use crate::domain::transport::{
    HealthRecord, Reachability, ReconcileState, SessionRecord, SessionRegistry, TransportState,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuicEndpointConfig {
    pub bind_target: QuicBindTarget,
    pub alpn: String,
    pub idle_timeout_ms: u64,
}

impl Default for QuicEndpointConfig {
    fn default() -> Self {
        Self {
            bind_target: QuicBindTarget::SocketAddr("0.0.0.0:4433".into()),
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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuicProvider {
    endpoint_config: QuicEndpointConfig,
    listener_addr: Option<String>,
    next_stream_id: u64,
    session_registry: SessionRegistry,
}

impl QuicProvider {
    pub fn new(endpoint_config: QuicEndpointConfig) -> Self {
        Self {
            endpoint_config,
            listener_addr: None,
            next_stream_id: 0,
            session_registry: SessionRegistry::default(),
        }
    }

    pub fn endpoint_config(&self) -> &QuicEndpointConfig {
        &self.endpoint_config
    }

    pub fn listener_addr(&self) -> Option<&str> {
        self.listener_addr.as_deref()
    }

    pub fn session_registry(&self) -> &SessionRegistry {
        &self.session_registry
    }

    pub fn open_listener(&mut self) -> String {
        let addr = match &self.endpoint_config.bind_target {
            QuicBindTarget::SocketAddr(addr) => addr.clone(),
            QuicBindTarget::InterfacePort { interface, port } => format!("{interface}:{port}"),
        };
        self.listener_addr = Some(addr.clone());
        addr
    }

    pub fn dial(
        &mut self,
        peer_id: &str,
        session_id: &str,
        remote_addr: &str,
        now: &str,
    ) -> Result<QuicSessionEvent, QuicProviderError> {
        self.build_session_event(peer_id, session_id, remote_addr, now)
    }

    pub fn accept(
        &mut self,
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
        let listener_addr = self
            .listener_addr
            .as_deref()
            .ok_or(QuicProviderError::ListenerNotOpen)?;
        let port = listener_addr
            .rsplit_once(':')
            .and_then(|(_, raw)| raw.parse::<u16>().ok())
            .unwrap_or(4433);
        let peer_label = sanitize_peer_label(peer_id);
        Ok(format!("{peer_label}.mesh.internal:{port}"))
    }

    fn build_session_event(
        &mut self,
        peer_id: &str,
        session_id: &str,
        remote_addr: &str,
        now: &str,
    ) -> Result<QuicSessionEvent, QuicProviderError> {
        let endpoint_addr = self
            .listener_addr
            .clone()
            .ok_or(QuicProviderError::ListenerNotOpen)?;

        let stream_id = self.next_stream_id;
        self.next_stream_id += 1;
        let control_stream = QuicControlBiStream {
            stream_id,
            channel: "control".into(),
            descriptor: format!("bi/{stream_id}/control"),
        };

        self.session_registry.upsert_session(SessionRecord {
            peer_id: peer_id.to_owned(),
            session_id: session_id.to_owned(),
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
            QuicBindTarget::SocketAddr("0.0.0.0:4433".into())
        );
        assert_eq!(config.alpn, "musu-connects/1");
    }

    #[test]
    fn listener_open_uses_bind_target() {
        let mut provider = QuicProvider::new(QuicEndpointConfig {
            bind_target: QuicBindTarget::InterfacePort {
                interface: "127.0.0.1".into(),
                port: 7443,
            },
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 45_000,
        });

        let listener = provider.open_listener();
        assert_eq!(listener, "127.0.0.1:7443");
        assert_eq!(provider.listener_addr(), Some("127.0.0.1:7443"));
    }

    #[test]
    fn dial_requires_open_listener() {
        let mut provider = QuicProvider::default();
        let error = provider
            .dial(
                "peer-a",
                "session-a",
                "10.0.0.3:7443",
                "2026-04-03T00:00:00Z",
            )
            .expect_err("dial should fail before listener is opened");
        assert_eq!(error, QuicProviderError::ListenerNotOpen);
    }

    #[test]
    fn dial_and_accept_update_session_registry_with_control_bistream() {
        let mut provider = QuicProvider::default();
        provider.open_listener();

        let dial = provider
            .dial(
                "peer-a",
                "session-a",
                "10.0.0.10:7443",
                "2026-04-03T00:00:00Z",
            )
            .expect("dial should succeed");
        let accept = provider
            .accept(
                "peer-b",
                "session-b",
                "10.0.0.11:7443",
                "2026-04-03T00:00:05Z",
            )
            .expect("accept should succeed");

        assert_eq!(dial.control_stream.descriptor, "bi/0/control");
        assert_eq!(accept.control_stream.descriptor, "bi/1/control");
        assert_eq!(
            provider.session_registry().connected_peers(),
            vec!["peer-a", "peer-b"]
        );
        assert_eq!(
            provider
                .session_registry()
                .health_for_peer("peer-a")
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
        assert_eq!(error, QuicProviderError::ListenerNotOpen);
    }

    #[test]
    fn runtime_remote_addr_uses_listener_port_and_peer_identity() {
        let mut provider = QuicProvider::new(QuicEndpointConfig {
            bind_target: QuicBindTarget::SocketAddr("0.0.0.0:7443".into()),
            alpn: "musu-connects/1".into(),
            idle_timeout_ms: 30_000,
        });
        provider.open_listener();
        let remote = provider
            .runtime_remote_addr_for_peer("Peer_A")
            .expect("runtime remote address should be derived once listener is open");
        assert_eq!(remote, "peer-a.mesh.internal:7443");
    }
}
