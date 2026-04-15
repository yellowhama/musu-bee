/// musu-connectsd bridge-proxy — QUIC tunnel for musu-bridge message forwarding.
///
/// Runs two servers concurrently:
///   - HTTP server (127.0.0.1:{http_port}): accepts POST /forward from Python musu-bridge
///   - QUIC server (0.0.0.0:{quic_port}):   accepts incoming frames from remote peers
///
/// Message flow (outbound):
///   Python → POST /forward → HTTP server → QUIC client → remote QUIC server
///   → remote HTTP POST /api/route → response back via QUIC → Python response
///
/// Message flow (inbound):
///   Remote QUIC client → QUIC server → POST http://127.0.0.1:8070/api/route → response
use std::net::SocketAddr;
use std::sync::Arc;

use axum::{Json, Router, extract::State, http::StatusCode, routing::get, routing::post};
use quinn::{ClientConfig, Endpoint, ServerConfig};
use quinn::crypto::rustls::{QuicClientConfig, QuicServerConfig};
use rcgen::generate_simple_self_signed;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, Error as TlsError, SignatureScheme};
use serde::{Deserialize, Serialize};

// ── HTTP API types ────────────────────────────────────────────────────────────

/// POST /forward — sent by Python mesh_router
#[derive(Deserialize)]
pub struct ForwardRequest {
    /// e.g. "http://1.2.3.4:8070" — we extract the host IP from this
    pub peer_url: String,
    pub channel: String,
    pub sender_id: String,
    pub text: String,
}

// ── QUIC frame format ─────────────────────────────────────────────────────────

/// Frame sent over QUIC stream (both directions use JSON).
/// Request: {channel, sender_id, text, version}
/// Response: any JSON dict from musu-bridge /api/route
#[derive(Serialize, Deserialize, Debug)]
struct QuicFrame {
    channel: String,
    sender_id: String,
    text: String,
    #[serde(default = "default_version")]
    version: u8,
}

fn default_version() -> u8 { 1 }

// ── Proxy state ───────────────────────────────────────────────────────────────

#[derive(Clone)]
struct ProxyState {
    /// Remote QUIC port (default 4433) — same on all nodes
    quic_port: u16,
    /// Shared QUIC client endpoint (reuses the same UDP socket)
    client_endpoint: Arc<Endpoint>,
}

// ── TLS: no-verify client (Phase 2 — encryption only, no peer auth) ──────────

#[derive(Debug)]
struct NoVerifier;

impl ServerCertVerifier for NoVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::ED25519,
        ]
    }
}

// ── TLS helpers ───────────────────────────────────────────────────────────────

fn gen_self_signed_cert() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), Box<dyn std::error::Error>> {
    let cert = generate_simple_self_signed(vec!["musu-peer".to_string()])?;
    let cert_der = CertificateDer::from(cert.cert.der().to_vec());
    let key_der = PrivateKeyDer::try_from(cert.key_pair.serialize_der())
        .map_err(|e| format!("key error: {e}"))?;
    Ok((cert_der, key_der))
}

fn make_server_config(cert_der: CertificateDer<'static>, key_der: PrivateKeyDer<'static>) -> Result<ServerConfig, Box<dyn std::error::Error>> {
    let mut tls = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], key_der)?;
    tls.alpn_protocols = vec![b"musu/1".to_vec()];
    let quic_cfg = QuicServerConfig::try_from(tls)?;
    let mut cfg = ServerConfig::with_crypto(Arc::new(quic_cfg));
    Arc::get_mut(&mut cfg.transport).unwrap().max_idle_timeout(Some(
        quinn::VarInt::from_u32(30_000).into(),
    ));
    Ok(cfg)
}

fn make_client_endpoint() -> Result<Endpoint, Box<dyn std::error::Error>> {
    let mut tls = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoVerifier))
        .with_no_client_auth();
    tls.alpn_protocols = vec![b"musu/1".to_vec()];
    let quic_cfg = QuicClientConfig::try_from(tls)?;
    let client_cfg = ClientConfig::new(Arc::new(quic_cfg));
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
    endpoint.set_default_client_config(client_cfg);
    Ok(endpoint)
}

// ── QUIC inbound (remote peer → local bridge) ─────────────────────────────────

async fn handle_quic_connection(conn: quinn::Connection, bridge_url: Arc<String>) {
    loop {
        let (mut send, mut recv) = match conn.accept_bi().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[quic-server] connection closed: {e}");
                break;
            }
        };

        let bridge = bridge_url.clone();
        tokio::spawn(async move {
            let payload = match recv.read_to_end(1 * 1024 * 1024).await {  // 1 MiB max
                Ok(b) => b,
                Err(e) => {
                    eprintln!("[quic-server] read error: {e}");
                    return;
                }
            };

            let frame: QuicFrame = match serde_json::from_slice(&payload) {
                Ok(f) => f,
                Err(e) => {
                    eprintln!("[quic-server] frame parse error: {e}");
                    return;
                }
            };

            eprintln!(
                "[quic-server] recv channel={:?} sender={:?}",
                frame.channel, frame.sender_id
            );

            // Forward to local musu-bridge
            let url = format!("{}/api/route", bridge.trim_end_matches('/'));
            let body = serde_json::json!({
                "channel": frame.channel,
                "sender_id": frame.sender_id,
                "text": frame.text,
            });

            let response_json = match call_local_bridge(&url, body).await {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[quic-server] bridge call failed: {e}");
                    serde_json::json!({"status": "error", "message": e})
                }
            };

            let out = serde_json::to_vec(&response_json).unwrap_or_default();
            let _ = send.write_all(&out).await;
            let _ = send.finish();
        });
    }
}

async fn call_local_bridge(url: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("http error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("bridge returned {status}: {body}"));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("response parse: {e}"))
}

// ── HTTP server handlers ──────────────────────────────────────────────────────

async fn handle_health() -> &'static str {
    "ok"
}

async fn handle_forward(
    State(state): State<ProxyState>,
    Json(req): Json<ForwardRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // Extract host from peer_url (e.g. "http://1.2.3.4:8070" → "1.2.3.4")
    let host = extract_host(&req.peer_url).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, format!("cannot parse host from peer_url: {}", req.peer_url))
    })?;

    let remote_addr: SocketAddr = format!("{}:{}", host, state.quic_port)
        .parse()
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("bad address: {e}")))?;

    eprintln!(
        "[quic-proxy] forwarding channel={:?} → {}",
        req.channel, remote_addr
    );

    let frame = QuicFrame {
        channel: req.channel,
        sender_id: req.sender_id,
        text: req.text,
        version: 1,
    };

    let response = quic_send_simple(&state.client_endpoint, remote_addr, &frame)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("quic error: {e}")))?;

    eprintln!("[quic-proxy] response received from {}", remote_addr);
    Ok(Json(response))
}

/// Simpler quic_send that doesn't double-read
async fn quic_send_simple(
    endpoint: &Endpoint,
    remote_addr: SocketAddr,
    frame: &QuicFrame,
) -> Result<serde_json::Value, String> {
    let conn = endpoint
        .connect(remote_addr, "musu-peer")
        .map_err(|e| format!("connect error: {e}"))?
        .await
        .map_err(|e| format!("connection failed: {e}"))?;

    let (mut send, mut recv) = conn
        .open_bi()
        .await
        .map_err(|e| format!("open_bi failed: {e}"))?;

    let payload = serde_json::to_vec(frame).map_err(|e| e.to_string())?;
    send.write_all(&payload).await.map_err(|e| format!("write failed: {e}"))?;
    send.finish().map_err(|e| format!("finish failed: {e}"))?;

    let data = recv
        .read_to_end(4 * 1024 * 1024)
        .await
        .map_err(|e| format!("read failed: {e}"))?;

    serde_json::from_slice(&data).map_err(|e| format!("json parse: {e}"))
}

fn extract_host(url: &str) -> Option<String> {
    // "http://1.2.3.4:8070" or "http://hostname:8070" → "1.2.3.4" or "hostname"
    let stripped = url
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    // take the part before the first '/'
    let host_port = stripped.split('/').next()?;
    // remove port
    let host = if host_port.contains('[') {
        // IPv6 "[::1]:8070" → "::1"
        host_port.trim_start_matches('[').split(']').next()?.to_string()
    } else {
        host_port.split(':').next()?.to_string()
    };
    if host.is_empty() { None } else { Some(host) }
}

// ── Entry point ───────────────────────────────────────────────────────────────

pub async fn run_bridge_proxy(
    quic_port: u16,
    http_port: u16,
    bridge_url: String,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Generate self-signed TLS cert
    let (cert_der, key_der) = gen_self_signed_cert()?;

    // 2. QUIC server
    let quic_addr: SocketAddr = format!("0.0.0.0:{quic_port}").parse()?;
    let server_cfg = make_server_config(cert_der, key_der)?;
    let server_endpoint = Endpoint::server(server_cfg, quic_addr)?;
    eprintln!("[bridge-proxy] QUIC server listening on UDP {quic_addr}");

    // 3. QUIC client endpoint (shared, reuses one UDP socket)
    let client_endpoint = make_client_endpoint()?;

    // 4. Shared state
    let state = ProxyState {
        quic_port,
        client_endpoint: Arc::new(client_endpoint),
    };

    // 5. HTTP server
    let http_addr: SocketAddr = format!("127.0.0.1:{http_port}").parse()?;
    let app = Router::new()
        .route("/forward", post(handle_forward))
        .route("/health", get(handle_health))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    eprintln!("[bridge-proxy] HTTP proxy listening on http://{http_addr}");
    eprintln!("[bridge-proxy] bridge-url = {bridge_url}");

    // 6. Run QUIC server accept loop + HTTP server concurrently.
    // tokio::select! cancels the other branch when one completes, so both exit together.
    let bridge_url_arc = Arc::new(bridge_url);
    tokio::select! {
        _ = run_quic_accept_loop(server_endpoint, bridge_url_arc) => {
            eprintln!("[bridge-proxy] QUIC accept loop exited — shutting down HTTP proxy");
        }
        result = axum::serve(listener, app) => {
            match result {
                Ok(()) => eprintln!("[bridge-proxy] HTTP server stopped — shutting down QUIC server"),
                Err(e) => eprintln!("[bridge-proxy] HTTP server error: {e} — shutting down QUIC server"),
            }
        }
    }

    Ok(())
}

async fn run_quic_accept_loop(endpoint: Endpoint, bridge_url: Arc<String>) {
    while let Some(incoming) = endpoint.accept().await {
        let bridge = bridge_url.clone();
        tokio::spawn(async move {
            match incoming.await {
                Ok(conn) => {
                    eprintln!("[quic-server] accepted connection from {}", conn.remote_address());
                    handle_quic_connection(conn, bridge).await;
                }
                Err(e) => eprintln!("[quic-server] accept error: {e}"),
            }
        });
    }
}
