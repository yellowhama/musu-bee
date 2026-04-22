use crate::application::identity::{FingerprintVerifier, FingerprintClientVerifier, NoVerifier};
use crate::domain::transport::{
    HealthRecord, Reachability, ReconcileState, SessionRecord, SessionRegistry, TransportState,
};
use quinn::{ClientConfig, Endpoint, ServerConfig};
use quinn::crypto::rustls::{QuicClientConfig, QuicServerConfig};
use rustls_pki_types::{CertificateDer, PrivateKeyDer};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::net::SocketAddr;
use dashmap::DashMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuicEndpointConfig {
    pub bind_target: QuicBindTarget,
    pub alpn: String,
    pub idle_timeout_ms: u64,
}

impl Default for QuicEndpointConfig {
    fn default() -> Self {
        Self {
            bind_target: QuicBindTarget::SocketAddr("127.0.0.1:0".into()),
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 30_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum QuicBindTarget {
    SocketAddr(String),
    InterfacePort { interface: String, port: u16 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuicControlBiStream {
    pub stream_id: u64,
    pub channel: String,
    pub descriptor: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuicSessionEvent {
    pub peer_id: String,
    pub session_id: String,
    pub endpoint_addr: String,
    pub remote_addr: String,
    pub accepted_at: String,
    pub control_stream: QuicControlBiStream,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuicProviderError {
    ListenerNotOpen,
    BindFailed(String),
    TlsConfigError(String),
    ConnectError(String),
    HandshakeFailed(String),
}

pub struct QuicProvider {
    endpoint_config: QuicEndpointConfig,
    endpoint: Option<Endpoint>,
    next_stream_id: std::sync::atomic::AtomicU64,
    pub session_registry: SessionRegistry,
    pub connections: Arc<DashMap<String, quinn::Connection>>,
    pub allowed_fingerprints: Arc<dashmap::DashSet<String>>,
}

impl QuicProvider {
    pub fn new(endpoint_config: QuicEndpointConfig) -> Self {
        Self {
            endpoint_config,
            endpoint: None,
            next_stream_id: std::sync::atomic::AtomicU64::new(0),
            session_registry: SessionRegistry::default(),
            connections: Arc::new(DashMap::new()),
            allowed_fingerprints: Arc::new(dashmap::DashSet::new()),
        }
    }

    pub fn endpoint_config(&self) -> &QuicEndpointConfig {
        &self.endpoint_config
    }

    pub fn listener_addr(&self) -> Option<String> {
        self.endpoint.as_ref().and_then(|e| e.local_addr().ok()).map(|a| a.to_string())
    }

    pub fn session_registry(&self) -> &SessionRegistry {
        &self.session_registry
    }

    pub async fn open_listener(
        &mut self,
        cert: CertificateDer<'static>,
        key: PrivateKeyDer<'static>,
    ) -> Result<String, QuicProviderError> {
        let addr_str = match &self.endpoint_config.bind_target {
            QuicBindTarget::SocketAddr(addr) => addr.clone(),
            QuicBindTarget::InterfacePort { interface, port } => format!("{interface}:{port}"),
        };
        let socket_addr: SocketAddr = addr_str.parse().map_err(|e| QuicProviderError::BindFailed(format!("{e}")))?;

        let verifier = FingerprintClientVerifier::new(self.allowed_fingerprints.clone());

        let mut tls = rustls::ServerConfig::builder()
            .with_client_cert_verifier(verifier)
            .with_single_cert(vec![cert], key)
            .map_err(|e| QuicProviderError::TlsConfigError(format!("{e}")))?;
        tls.alpn_protocols = vec![self.endpoint_config.alpn.as_bytes().to_vec()];
        tls.max_early_data_size = u32::MAX;

        let server_config = ServerConfig::with_crypto(Arc::new(
            QuicServerConfig::try_from(tls).map_err(|e| QuicProviderError::TlsConfigError(format!("{e}")))?
        ));
        
        let endpoint = Endpoint::server(server_config, socket_addr)
            .map_err(|e| QuicProviderError::BindFailed(format!("{e}")))?;
        
        let local_addr = endpoint.local_addr().map_err(|e| QuicProviderError::BindFailed(format!("{e}")))?;
        self.endpoint = Some(endpoint);
        Ok(local_addr.to_string())
    }

    pub async fn dial(
        &self,
        peer_id: &str,
        session_id: &str,
        remote_addr_str: &str,
        expected_fingerprint: Option<&str>,
        now: &str,
    ) -> Result<QuicSessionEvent, QuicProviderError> {
        let endpoint = self.endpoint.as_ref().ok_or(QuicProviderError::ListenerNotOpen)?;
        let remote_addr: SocketAddr = remote_addr_str.parse().map_err(|e| QuicProviderError::ConnectError(format!("Invalid remote address: {e}")))?;

        let mut tls_config = if let Some(fp) = expected_fingerprint {
            rustls::ClientConfig::builder()
                .dangerous()
                .with_custom_certificate_verifier(FingerprintVerifier::new(fp.to_string()))
                .with_no_client_auth()
        } else {
            // Secure by default: eliminate NoVerifier fallback
            return Err(QuicProviderError::TlsConfigError(format!("Missing expected fingerprint for peer {peer_id}")));
        };

        tls_config.alpn_protocols = vec![self.endpoint_config.alpn.as_bytes().to_vec()];
        
        // Enable session resumption via in-memory store
        tls_config.resumption = rustls::client::Resumption::in_memory_sessions(256);

        let client_config = ClientConfig::new(Arc::new(
            QuicClientConfig::try_from(tls_config).map_err(|e| QuicProviderError::TlsConfigError(format!("{e}")))?
        ));

        let connection = endpoint.connect_with(client_config, remote_addr, "musu-peer")
            .map_err(|e| QuicProviderError::ConnectError(format!("{e}")))?
            .await
            .map_err(|e| QuicProviderError::HandshakeFailed(format!("{e}")))?;

        self.connections.insert(session_id.to_string(), connection.clone());
        let remote_addr_observed = connection.remote_address().to_string();
        self.build_session_event(peer_id, session_id, &remote_addr_observed, now)
    }

    pub async fn accept(
        &self,
        peer_id: &str,
        session_id: &str,
        remote_addr: &str,
        now: &str,
    ) -> Result<QuicSessionEvent, QuicProviderError> {
        self.build_session_event(peer_id, session_id, remote_addr, now)
    }

    pub fn runtime_remote_addr_for_peer(
        &self,
        peer_id: &str,
    ) -> Result<String, QuicProviderError> {
        let local_addr = self.listener_addr().ok_or(QuicProviderError::ListenerNotOpen)?;
        let port = local_addr
            .rsplit_once(':')
            .and_then(|(_, raw)| raw.parse::<u16>().ok())
            .unwrap_or(4433);
        let peer_label = sanitize_peer_label(peer_id);
        Ok(format!("{peer_label}.mesh.internal:{port}"))
    }

    fn build_session_event(
        &self,
        peer_id: &str,
        session_id: &str,
        remote_addr: &str,
        now: &str,
    ) -> Result<QuicSessionEvent, QuicProviderError> {
        let endpoint_addr = self.listener_addr().ok_or(QuicProviderError::ListenerNotOpen)?;

        let stream_id = self.next_stream_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let control_stream = QuicControlBiStream {
            stream_id,
            channel: "control".into(),
            descriptor: format!("bi/{stream_id}/control"),
        };

        self.session_registry.upsert_session(SessionRecord {
            peer_id: peer_id.to_owned(),
            session_id: session_id.to_owned(),
            remote_addr: remote_addr.to_owned(),
            transport_state: TransportState::Connected,
            connected_at: now.to_owned(),
            last_heartbeat_at: now.to_owned(),
        });
        self.session_registry.update_health(HealthRecord {
            peer_id: peer_id.to_owned(),
            reachability: Reachability::Reachable,
            freshness_state: "fresh".into(),
            reconcile_state: ReconcileState::Clean,
            last_probe_at: now.to_owned(),
            retry_count: 0,
        });

        Ok(QuicSessionEvent {
            peer_id: peer_id.to_owned(),
            session_id: session_id.to_owned(),
            endpoint_addr,
            remote_addr: remote_addr.to_owned(),
            accepted_at: now.to_owned(),
            control_stream,
        })
    }
}

impl Default for QuicProvider {
    fn default() -> Self {
        Self::new(QuicEndpointConfig::default())
    }
}

fn sanitize_peer_label(peer_id: &str) -> String {
    let sanitized: String = peer_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let compact = sanitized.trim_matches('-');
    if compact.is_empty() {
        "peer".to_string()
    } else {
        compact.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{QuicBindTarget, QuicEndpointConfig, QuicProvider, QuicProviderError};

    #[test]
    fn endpoint_config_default_shape_is_stable() {
        let config = QuicEndpointConfig::default();
        assert_eq!(
            config.bind_target,
            QuicBindTarget::SocketAddr("127.0.0.1:0".into())
        );
        assert_eq!(config.alpn, "musu-connects/1");
    }

    #[tokio::test]
    async fn listener_open_uses_bind_target() {
        let mut provider = QuicProvider::new(QuicEndpointConfig {
            bind_target: QuicBindTarget::InterfacePort {
                interface: "127.0.0.1".into(),
                port: 0, // Ephemeral port for test
            },
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 45_000,
        });

        let (cert, key) = crate::application::identity::gen_self_signed_cert().unwrap();
        let listener = provider.open_listener(cert, key).await.expect("listener should open");
        assert!(listener.contains("127.0.0.1:"));
        assert!(provider.listener_addr().is_some());
    }

    #[tokio::test]
    async fn dial_requires_open_listener() {
        let provider = QuicProvider::new(QuicEndpointConfig {
            bind_target: QuicBindTarget::SocketAddr("127.0.0.1:0".into()),
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 30_000,
        });
        let error = provider
            .dial(
                "peer-a",
                "session-a",
                "127.0.0.1:4433",
                None,
                "2026-04-03T00:00:00Z",
            )
            .await
            .expect_err("dial should fail before listener is opened");
        assert!(matches!(error, QuicProviderError::ListenerNotOpen));
    }

    #[tokio::test]
    async fn accept_updates_session_registry_with_control_bistream() {
        let mut provider = QuicProvider::new(QuicEndpointConfig {
            bind_target: QuicBindTarget::SocketAddr("127.0.0.1:0".into()),
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 30_000,
        });
        let (cert, key) = crate::application::identity::gen_self_signed_cert().unwrap();
        provider.open_listener(cert, key).await.expect("listener should open");

        let accept = provider
            .accept(
                "peer-b",
                "session-b",
                "127.0.0.1:7443",
                "2026-04-03T00:00:05Z",
            )
            .await
            .expect("accept should succeed");

        assert_eq!(accept.control_stream.descriptor, "bi/0/control");
        assert_eq!(
            provider.session_registry().connected_peers(),
            vec!["peer-b"]
        );
        assert_eq!(
            provider
                .session_registry()
                .health_for_peer("peer-b")
                .map(|record| record.reachability.clone()),
            Some(crate::domain::transport::Reachability::Reachable)
        );
    }

    #[test]
    fn runtime_remote_addr_requires_listener() {
        let provider = QuicProvider::default();
        let error = provider
            .runtime_remote_addr_for_peer("peer-a")
            .expect_err("listener should be required before runtime remote address exists");
        assert!(matches!(error, QuicProviderError::ListenerNotOpen));
    }

    #[tokio::test]
    async fn runtime_remote_addr_uses_listener_port_and_peer_identity() {
        let mut provider = QuicProvider::new(QuicEndpointConfig {
            bind_target: QuicBindTarget::SocketAddr("127.0.0.1:0".into()),
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 30_000,
        });
        let (cert, key) = crate::application::identity::gen_self_signed_cert().unwrap();
        provider.open_listener(cert, key).await.expect("listener should open");
        let remote = provider
            .runtime_remote_addr_for_peer("Peer_A")
            .expect("runtime remote address should be derived once listener is open");
        assert!(remote.starts_with("peer-a.mesh.internal:"));
    }
}
