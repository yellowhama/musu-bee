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
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use axum::{Json, Router, extract::State, http::StatusCode, routing::get, routing::post};
use dashmap::DashMap;
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

// ── Connection pool ───────────────────────────────────────────────────────────

type ConnPool = Arc<DashMap<SocketAddr, (quinn::Connection, Instant)>>;
type FingerprintCache = Arc<DashMap<SocketAddr, String>>;

const CONN_IDLE_TIMEOUT: Duration = Duration::from_secs(60);

// ── Proxy state ───────────────────────────────────────────────────────────────

#[derive(Clone)]
struct ProxyState {
    /// Remote QUIC port (default 4433) — same on all nodes
    quic_port: u16,
    /// Shared QUIC client endpoint (reuses the same UDP socket)
    client_endpoint: Arc<Endpoint>,
    /// Connection pool: reuse open QUIC connections per remote addr
    conn_pool: ConnPool,
    /// Fingerprint cache: addr → expected SHA-256 fingerprint from musu.pro
    fingerprint_cache: FingerprintCache,
    /// musu.pro bearer token (MUSU_TOKEN env — for fetching peer fingerprints)
    musu_token: Option<String>,
    /// musu.pro nodes list URL (default: https://musu.pro/api/v1/nodes)
    nodes_url: String,
}

// ── TLS: no-verify client (fallback — used when fingerprint is unknown) ───────

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

// ── TLS: fingerprint verifier (Phase 4 — actual peer authentication) ─────────

/// Verifies the peer's TLS certificate by SHA-256 fingerprint.
/// Populated from musu.pro /api/v1/nodes response.
#[derive(Debug)]
struct FingerprintVerifier {
    expected: String,  // "ab:cd:ef:..." colon-separated hex
}

impl ServerCertVerifier for FingerprintVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        let actual = cert_fingerprint(end_entity);
        if actual == self.expected {
            Ok(ServerCertVerified::assertion())
        } else {
            eprintln!(
                "[bridge-proxy] fingerprint mismatch — expected={} actual={}",
                self.expected, actual
            );
            Err(TlsError::InvalidCertificate(
                rustls::CertificateError::ApplicationVerificationFailure,
            ))
        }
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

// ── Static HTTP client (shared across all bridge calls) ───────────────────────

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("failed to build static HTTP client")
    })
}

// ── TLS helpers ───────────────────────────────────────────────────────────────

fn gen_self_signed_cert() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), Box<dyn std::error::Error>> {
    let cert = generate_simple_self_signed(vec!["musu-peer".to_string()])?;
    let cert_der = CertificateDer::from(cert.cert.der().to_vec());
    let key_der = PrivateKeyDer::try_from(cert.key_pair.serialize_der())
        .map_err(|e| format!("key error: {e}"))?;
    Ok((cert_der, key_der))
}

/// Load cert/key from ~/.musu/, or generate a new self-signed cert and save it.
/// Stable across restarts — same fingerprint unless files are deleted.
fn load_or_gen_cert() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), Box<dyn std::error::Error>> {
    let musu_dir: PathBuf = dirs::home_dir()
        .ok_or("cannot determine home directory")?
        .join(".musu");
    std::fs::create_dir_all(&musu_dir)?;
    let cert_path = musu_dir.join("quic_cert.der");
    let key_path  = musu_dir.join("quic_key.der");

    if cert_path.exists() && key_path.exists() {
        let cert_bytes = std::fs::read(&cert_path)?;
        let key_bytes  = std::fs::read(&key_path)?;
        let cert = CertificateDer::from(cert_bytes);
        let key  = PrivateKeyDer::try_from(key_bytes)
            .map_err(|e| format!("key load error: {e}"))?;
        eprintln!("[bridge-proxy] loaded TLS cert from {}", cert_path.display());
        return Ok((cert, key));
    }

    // Generate fresh cert and persist
    let (cert, key) = gen_self_signed_cert()?;
    std::fs::write(&cert_path, cert.as_ref())?;
    let key_bytes = match &key {
        PrivateKeyDer::Pkcs8(k) => k.secret_pkcs8_der().to_vec(),
        PrivateKeyDer::Sec1(k)  => k.secret_sec1_der().to_vec(),
        PrivateKeyDer::Pkcs1(k) => k.secret_pkcs1_der().to_vec(),
        _ => return Err("unsupported private key type".into()),
    };
    std::fs::write(&key_path, key_bytes)?;
    eprintln!("[bridge-proxy] generated new TLS cert → {}", cert_path.display());
    Ok((cert, key))
}

/// Compute SHA-256 fingerprint of a DER certificate (hex, colon-separated).
fn cert_fingerprint(cert: &CertificateDer<'_>) -> String {
    use ring::digest::{digest, SHA256};
    digest(&SHA256, cert.as_ref())
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn make_server_config(cert_der: CertificateDer<'static>, key_der: PrivateKeyDer<'static>) -> Result<ServerConfig, Box<dyn std::error::Error>> {
    let mut tls = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], key_der)?;
    tls.alpn_protocols = vec![b"musu/1".to_vec()];
    let quic_cfg = QuicServerConfig::try_from(tls)?;
    let mut cfg = ServerConfig::with_crypto(Arc::new(quic_cfg));
    Arc::get_mut(&mut cfg.transport)
        .expect("transport Arc should have no other refs at config time")
        .max_idle_timeout(Some(
        quinn::VarInt::from_u32(30_000).into(),
    ));
    Ok(cfg)
}

fn make_client_endpoint() -> Result<Endpoint, Box<dyn std::error::Error>> {
    let tls = make_noverify_tls()?;
    let quic_cfg = QuicClientConfig::try_from(tls)?;
    let client_cfg = ClientConfig::new(Arc::new(quic_cfg));
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
    endpoint.set_default_client_config(client_cfg);
    Ok(endpoint)
}

fn make_noverify_tls() -> Result<rustls::ClientConfig, Box<dyn std::error::Error>> {
    let mut tls = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoVerifier))
        .with_no_client_auth();
    tls.alpn_protocols = vec![b"musu/1".to_vec()];
    Ok(tls)
}

fn make_fingerprint_tls(expected_fp: &str) -> Result<rustls::ClientConfig, Box<dyn std::error::Error>> {
    let mut tls = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(FingerprintVerifier {
            expected: expected_fp.to_string(),
        }))
        .with_no_client_auth();
    tls.alpn_protocols = vec![b"musu/1".to_vec()];
    Ok(tls)
}

fn make_client_config_from_tls(tls: rustls::ClientConfig) -> Result<ClientConfig, Box<dyn std::error::Error>> {
    let quic_cfg = QuicClientConfig::try_from(tls)?;
    Ok(ClientConfig::new(Arc::new(quic_cfg)))
}

// ── Fingerprint resolution ────────────────────────────────────────────────────

/// Fetch the expected fingerprint for a remote QUIC addr from musu.pro.
/// Returns None if token missing, network error, or no matching node.
async fn fetch_fingerprint(
    token: &str,
    nodes_url: &str,
    target: SocketAddr,
) -> Option<String> {
    let client = get_http_client();
    let resp = client
        .get(nodes_url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        eprintln!("[bridge-proxy] fetch_fingerprint: musu.pro returned {}", resp.status());
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    // API may return list or {"nodes": [...]}
    let nodes = if json.is_array() {
        json.as_array()?.clone()
    } else {
        json.get("nodes")?.as_array()?.clone()
    };

    let target_ip = target.ip().to_string();
    for node in &nodes {
        let public_url = node.get("public_url")?.as_str()?;
        let node_host = extract_host(public_url)?;
        if node_host == target_ip {
            let fp = node.get("cert_fingerprint")?.as_str()?;
            if !fp.is_empty() {
                return Some(fp.to_string());
            }
        }
    }
    None
}

// ── QUIC send helpers ─────────────────────────────────────────────────────────

/// Send frame on an existing QUIC connection's new bidirectional stream.
async fn try_send_on_conn(
    conn: &quinn::Connection,
    frame: &QuicFrame,
) -> Result<serde_json::Value, String> {
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

/// Send a QUIC frame, reusing a pooled connection when available.
/// New connections use fingerprint verification if musu.pro token + fingerprint available.
async fn quic_send_pooled(
    endpoint: &Endpoint,
    pool: &DashMap<SocketAddr, (quinn::Connection, Instant)>,
    fingerprint_cache: &DashMap<SocketAddr, String>,
    musu_token: &Option<String>,
    nodes_url: &str,
    remote_addr: SocketAddr,
    frame: &QuicFrame,
) -> Result<serde_json::Value, String> {
    // Try pooled connection first.
    // Clone conn before dropping the DashMap entry so we don't hold the shard
    // lock across the async send (which can take 30-120s waiting for LLM).
    let pooled = if let Some(entry) = pool.get(&remote_addr) {
        let (conn, last_used) = entry.value();
        let is_alive = conn.close_reason().is_none()
            && last_used.elapsed() < CONN_IDLE_TIMEOUT;
        if is_alive {
            Some(conn.clone()) // clone Arc — cheap, releases shard lock immediately
        } else {
            None
        }
    } else {
        None
    };

    if let Some(conn) = pooled {
        match try_send_on_conn(&conn, frame).await {
            Ok(val) => {
                pool.alter(&remote_addr, |_, mut item| {
                    item.1 = Instant::now();
                    item
                });
                eprintln!("[quic-proxy] reusing connection to {}", remote_addr);
                return Ok(val);
            }
            Err(_) => {
                // Stale connection — fall through to reconnect
            }
        }
    }
    pool.remove(&remote_addr);

    // Resolve fingerprint for new connection
    eprintln!("[quic-proxy] new connection to {}", remote_addr);
    let conn = match resolve_peer_config(
        fingerprint_cache,
        musu_token,
        nodes_url,
        remote_addr,
        endpoint,
    )
    .await
    {
        Ok(c) => c,
        Err(e) => return Err(format!("connection failed: {e}")),
    };

    let val = try_send_on_conn(&conn, frame).await?;
    pool.insert(remote_addr, (conn, Instant::now()));
    Ok(val)
}

/// Establish a new QUIC connection to remote_addr, using fingerprint if available.
async fn resolve_peer_config(
    fingerprint_cache: &DashMap<SocketAddr, String>,
    musu_token: &Option<String>,
    nodes_url: &str,
    remote_addr: SocketAddr,
    endpoint: &Endpoint,
) -> Result<quinn::Connection, String> {
    // 1. Check cache
    let fp = if let Some(cached) = fingerprint_cache.get(&remote_addr) {
        Some(cached.value().clone())
    } else if let Some(token) = musu_token {
        // 2. Try fetching from musu.pro
        let fetched = fetch_fingerprint(token, nodes_url, remote_addr).await;
        if let Some(ref fp) = fetched {
            fingerprint_cache.insert(remote_addr, fp.clone());
            eprintln!("[quic-proxy] fingerprint resolved for {} → {}", remote_addr, fp);
        }
        fetched
    } else {
        None
    };

    let conn = if let Some(ref expected_fp) = fp {
        // Use fingerprint verifier
        let tls = make_fingerprint_tls(expected_fp)
            .map_err(|e| format!("tls config error: {e}"))?;
        let cfg = make_client_config_from_tls(tls)
            .map_err(|e| format!("client config error: {e}"))?;
        endpoint
            .connect_with(cfg, remote_addr, "musu-peer")
            .map_err(|e| format!("connect error: {e}"))?
            .await
            .map_err(|e| {
                eprintln!("[quic-proxy] fingerprint mismatch or connection refused for {}", remote_addr);
                format!("connection failed: {e}")
            })?
    } else {
        // Fallback: NoVerifier (no token or no fingerprint registered yet)
        eprintln!("[quic-proxy] WARN: no fingerprint for {} — connecting without peer auth", remote_addr);
        endpoint
            .connect(remote_addr, "musu-peer")
            .map_err(|e| format!("connect error: {e}"))?
            .await
            .map_err(|e| format!("connection failed: {e}"))?
    };

    Ok(conn)
}

// ── Connection pool cleanup ───────────────────────────────────────────────────

/// Background task: prune stale/closed connections from the pool every 30s.
async fn cleanup_pool_loop(pool: ConnPool) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    loop {
        interval.tick().await;
        let before = pool.len();
        pool.retain(|_, (conn, last_used)| {
            conn.close_reason().is_none() && last_used.elapsed() < CONN_IDLE_TIMEOUT
        });
        let removed = before.saturating_sub(pool.len());
        if removed > 0 {
            eprintln!("[quic-proxy] pool cleanup: removed {} stale connection(s)", removed);
        }
    }
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

            let out = serde_json::to_vec(&response_json).unwrap_or_else(|_| b"{}".to_vec());
            if let Err(e) = send.write_all(&out).await {
                eprintln!("[quic-server] write error: {e}");
                return;
            }
            if let Err(e) = send.finish() {
                eprintln!("[quic-server] finish error: {e}");
            }
        });
    }
}

async fn call_local_bridge(url: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let resp = get_http_client()
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

    let response = quic_send_pooled(
        &state.client_endpoint,
        &state.conn_pool,
        &state.fingerprint_cache,
        &state.musu_token,
        &state.nodes_url,
        remote_addr,
        &frame,
    )
    .await
    .map_err(|e| (StatusCode::BAD_GATEWAY, format!("quic error: {e}")))?;

    eprintln!("[quic-proxy] response received from {}", remote_addr);
    Ok(Json(response))
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
    // 1. Load or generate persistent TLS cert (stable fingerprint across restarts)
    let (cert_der, _key_der) = load_or_gen_cert()?;

    // 2. Compute and publish fingerprint
    let fingerprint = cert_fingerprint(&cert_der);
    eprintln!("[bridge-proxy] cert fingerprint (SHA-256): {}", fingerprint);
    // Export for Python musu-bridge to include in heartbeat
    std::env::set_var("MUSU_QUIC_FINGERPRINT", &fingerprint);

    // 3. QUIC server — needs its own copy of cert/key (ServerConfig takes ownership)
    let (server_cert, server_key) = load_or_gen_cert()?;
    let quic_addr: SocketAddr = format!("0.0.0.0:{quic_port}").parse()?;
    let server_cfg = make_server_config(server_cert, server_key)?;
    let server_endpoint = Endpoint::server(server_cfg, quic_addr)?;
    eprintln!("[bridge-proxy] QUIC server listening on UDP {quic_addr}");

    // 4. QUIC client endpoint (shared, reuses one UDP socket)
    let client_endpoint = make_client_endpoint()?;

    // 5. Read musu.pro token + nodes URL from env
    let musu_token = std::env::var("MUSU_TOKEN").ok().filter(|t| !t.is_empty());
    let nodes_url = std::env::var("MUSU_NODES_URL")
        .unwrap_or_else(|_| "https://musu.pro/api/v1/nodes".to_string());
    if musu_token.is_some() {
        eprintln!("[bridge-proxy] MUSU_TOKEN present — fingerprint verification enabled");
    } else {
        eprintln!("[bridge-proxy] WARN: MUSU_TOKEN not set — fingerprint verification disabled");
    }

    // 6. Shared state
    let conn_pool: ConnPool = Arc::new(DashMap::new());
    let state = ProxyState {
        quic_port,
        client_endpoint: Arc::new(client_endpoint),
        conn_pool: conn_pool.clone(),
        fingerprint_cache: Arc::new(DashMap::new()),
        musu_token,
        nodes_url,
    };

    // 7. HTTP server
    let http_addr: SocketAddr = format!("127.0.0.1:{http_port}").parse()?;
    let app = Router::new()
        .route("/forward", post(handle_forward))
        .route("/health", get(handle_health))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    eprintln!("[bridge-proxy] HTTP proxy listening on http://{http_addr}");
    eprintln!("[bridge-proxy] bridge-url = {bridge_url}");

    // 8. Background pool cleanup
    tokio::spawn(cleanup_pool_loop(conn_pool));

    // 9. Run QUIC server accept loop + HTTP server concurrently.
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
