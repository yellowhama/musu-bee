//! Generic reverse-proxy handlers for port unification.
//!
//! Routes traffic from the unified gateway port (`:8070`) to internal
//! services that run on their own ports:
//!
//!   - `/brain/*` → musu-brainai (Go, default `:8888`)
//!   - `/worker/*` → musu-worker  (Python, default `:9700`)
//!
//! Design:
//!   - Reuses the hop-by-hop stripping, header copy, and streaming
//!     patterns from `facade.rs`.
//!   - Path prefix (`/brain`, `/worker`) is stripped before forwarding
//!     so the backend receives its native URL space.
//!   - Backend discovery: env override → `127.0.0.1:{default_port}`.
//!   - If the backend is unreachable, returns 503 with a structured
//!     JSON error and a human-friendly hint.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::header::{HeaderName, HOST};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::bridge::AppState;

// ── Hop-by-hop header handling ──────────────────────────────────────

/// Headers that MUST NOT be forwarded per RFC 7230 §6.1.
const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

fn is_hop_by_hop(name: &HeaderName) -> bool {
    HOP_BY_HOP
        .iter()
        .any(|h| name.as_str().eq_ignore_ascii_case(h))
}

/// Copy request headers, stripping hop-by-hop and Host.
///
/// Unlike `facade.rs` we do NOT strip `Authorization` — the proxied
/// services are internal and may need the caller's token for their own
/// auth (e.g. brainai's bearer check).
fn copy_request_headers(src: &HeaderMap, dst: &mut reqwest::header::HeaderMap) {
    for (name, value) in src.iter() {
        if is_hop_by_hop(name) || name == HOST {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes()),
            reqwest::header::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            dst.append(n, v);
        }
    }
}

/// Copy response headers, stripping hop-by-hop.
fn copy_response_headers(src: &reqwest::header::HeaderMap, dst: &mut HeaderMap) {
    for (name, value) in src.iter() {
        let std_name = name.as_str();
        if HOP_BY_HOP
            .iter()
            .any(|h| std_name.eq_ignore_ascii_case(h))
        {
            continue;
        }
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(std_name.as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            dst.append(n, v);
        }
    }
}

/// Adapt axum `Body` into a reqwest-friendly byte stream.
fn body_to_stream(
    body: Body,
) -> impl futures_util::Stream<Item = Result<bytes::Bytes, std::io::Error>> + Send + 'static {
    use futures_util::TryStreamExt;
    use http_body_util::BodyStream;

    BodyStream::new(body)
        .map_ok(|frame| frame.into_data().unwrap_or_default())
        .map_err(|e| std::io::Error::other(e.to_string()))
}

// ── Service port resolution ─────────────────────────────────────────

/// Resolve the upstream base URL for a service.
///
/// Checks for an env-var override `MUSU_{SERVICE}_PORT` (e.g.
/// `MUSU_BRAINAI_PORT`), falling back to `127.0.0.1:{default_port}`.
fn resolve_service_url(service_name: &str, default_port: u16) -> String {
    let env_key = format!("MUSU_{}_PORT", service_name.to_uppercase());
    let port: u16 = std::env::var(&env_key)
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(default_port);
    format!("http://127.0.0.1:{}", port)
}

// ── Generic proxy core ──────────────────────────────────────────────

/// Forward a request to an internal service.
///
/// Used by the unified gateway to route `/brain/*`, `/worker/*`, etc.
/// to their respective backend services.
///
/// # Path rewriting
///
/// The `prefix` (e.g. `"/brain"`) is stripped from the request URI
/// before forwarding so the backend receives its native URL space.
/// For example, `/brain/api/search?q=test` becomes `/api/search?q=test`.
///
/// # Error handling
///
/// If the backend is unreachable, returns **503 Service Unavailable**
/// with a JSON body containing `error`, `service`, and `hint` fields.
async fn proxy_to_service(
    state: &AppState,
    service_name: &str,
    default_port: u16,
    prefix: &str,
    req: Request,
) -> Response {
    let upstream_base = resolve_service_url(service_name, default_port);

    // Strip the route prefix so the backend sees its native URL space.
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or("/");

    let backend_path = path_and_query
        .strip_prefix(prefix)
        .unwrap_or(path_and_query);

    // Ensure the backend path starts with '/'.
    let backend_path = if backend_path.is_empty() || !backend_path.starts_with('/') {
        format!("/{}", backend_path.trim_start_matches('/'))
    } else {
        backend_path.to_string()
    };

    let upstream_url = format!("{}{}", upstream_base, backend_path);

    let (parts, body) = req.into_parts();

    // Stream the request body to the upstream via reqwest.
    let body_stream = body_to_stream(body);

    let mut headers = reqwest::header::HeaderMap::new();
    copy_request_headers(&parts.headers, &mut headers);

    let method = match reqwest::Method::from_bytes(parts.method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => {
            return (StatusCode::METHOD_NOT_ALLOWED, "method not allowed").into_response()
        }
    };

    tracing::debug!(
        service = service_name,
        upstream = %upstream_url,
        method = %parts.method,
        "proxy forwarding request"
    );

    let req_b = state
        .http_client
        .request(method, &upstream_url)
        .headers(headers)
        .body(reqwest::Body::wrap_stream(body_stream));

    let upstream_resp = match req_b.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(
                service = service_name,
                upstream = %upstream_url,
                error = %e,
                "proxy upstream unreachable"
            );
            return service_unavailable(service_name);
        }
    };

    let status =
        StatusCode::from_u16(upstream_resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);

    let is_sse = upstream_resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.starts_with("text/event-stream"))
        .unwrap_or(false);

    let mut resp_headers = HeaderMap::new();
    copy_response_headers(upstream_resp.headers(), &mut resp_headers);

    let stream = upstream_resp.bytes_stream();
    let body = Body::from_stream(stream);

    let mut resp = Response::builder().status(status).body(body).unwrap();
    *resp.headers_mut() = resp_headers;

    if is_sse {
        tracing::debug!(
            service = service_name,
            upstream = %upstream_url,
            "proxy SSE stream open"
        );
    }

    resp
}

/// Build a 503 Service Unavailable response with a structured JSON body.
fn service_unavailable(service_name: &str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "error": format!("{} unavailable", service_name),
            "service": service_name,
            "hint": format!(
                "start the {} service or check ~/.musu/services/",
                service_name
            ),
        })),
    )
        .into_response()
}

// ── Per-service route handlers ──────────────────────────────────────

/// Proxy all methods on `/brain` and `/brain/*` to musu-brainai.
///
/// Default upstream: `127.0.0.1:8888`.
/// Override with env `MUSU_BRAINAI_PORT`.
pub async fn proxy_brainai(State(state): State<AppState>, req: Request) -> Response {
    proxy_to_service(&state, "brainai", 8888, "/brain", req).await
}

/// Proxy all methods on `/worker` and `/worker/*` to musu-worker.
///
/// Default upstream: `127.0.0.1:9700`.
/// Override with env `MUSU_WORKER_PORT`.
pub async fn proxy_worker(State(state): State<AppState>, req: Request) -> Response {
    proxy_to_service(&state, "worker", 9700, "/worker", req).await
}

// ── File Explorer proxy ─────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct ProxyFileParams {
    pub node_id: String,
    pub path: String,
}

/// Helper to proxy an HTTP request to a peer.
async fn proxy_to_peer_url(state: &AppState, node_id: &str, upstream_url: &str, req: Request) -> Response {
    let musu_home = state.config.nodes_toml_path.parent().unwrap_or(std::path::Path::new("."));
    let peers = crate::peer::discovery::resolve_all_peers(musu_home);
    let peer = match peers.into_iter().find(|p| p.name.as_deref() == Some(node_id)) {
        Some(p) => p,
        None => return (StatusCode::NOT_FOUND, "node not found").into_response(),
    };

    let url = format!("http://{}{}", peer.addr, upstream_url);
    let (parts, body) = req.into_parts();
    let body_stream = body_to_stream(body);
    let mut headers = reqwest::header::HeaderMap::new();
    copy_request_headers(&parts.headers, &mut headers);

    // Forward Bearer token from our configuration so the peer accepts it
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", state.config.token)).unwrap(),
    );

    let method = match reqwest::Method::from_bytes(parts.method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => return (StatusCode::METHOD_NOT_ALLOWED, "method not allowed").into_response(),
    };

    let req_b = state
        .http_client
        .request(method, &url)
        .headers(headers)
        .body(reqwest::Body::wrap_stream(body_stream));

    let upstream_resp = match req_b.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(peer = %peer.addr, error = %e, "peer unreachable for file proxy");
            return (StatusCode::BAD_GATEWAY, "peer unreachable").into_response();
        }
    };

    let status = StatusCode::from_u16(upstream_resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut resp_headers = HeaderMap::new();
    copy_response_headers(upstream_resp.headers(), &mut resp_headers);

    let stream = upstream_resp.bytes_stream();
    let body = Body::from_stream(stream);

    let mut resp = Response::builder().status(status).body(body).unwrap();
    *resp.headers_mut() = resp_headers;
    resp
}

/// GET /api/v1/proxy/files
pub async fn proxy_files_list(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ProxyFileParams>,
    req: Request,
) -> Response {
    // percent encode the path for safety
    let enc_path = urlencoding::encode(&params.path);
    proxy_to_peer_url(&state, &params.node_id, &format!("/api/files?path={}", enc_path), req).await
}

/// GET /api/v1/proxy/files/read
pub async fn proxy_files_read(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ProxyFileParams>,
    req: Request,
) -> Response {
    let enc_path = urlencoding::encode(&params.path);
    proxy_to_peer_url(&state, &params.node_id, &format!("/api/files/read?path={}", enc_path), req).await
}

/// POST /api/v1/proxy/files/write
pub async fn proxy_files_write(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ProxyFileParams>,
    req: Request,
) -> Response {
    let enc_path = urlencoding::encode(&params.path);
    proxy_to_peer_url(&state, &params.node_id, &format!("/api/files/write?path={}", enc_path), req).await
}

/// POST /api/v1/proxy/files/mkdir
pub async fn proxy_files_mkdir(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ProxyFileParams>,
    req: Request,
) -> Response {
    let enc_path = urlencoding::encode(&params.path);
    proxy_to_peer_url(&state, &params.node_id, &format!("/api/files/mkdir?path={}", enc_path), req).await
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn resolve_service_url_uses_default_port() {
        let _g = ENV_LOCK.lock().unwrap();
        std::env::remove_var("MUSU_TESTSERVICE_PORT");
        let url = resolve_service_url("testservice", 9999);
        assert_eq!(url, "http://127.0.0.1:9999");
    }

    #[test]
    fn resolve_service_url_honors_env_override() {
        let _g = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_TESTSERVICE_PORT", "1234");
        let url = resolve_service_url("testservice", 9999);
        std::env::remove_var("MUSU_TESTSERVICE_PORT");
        assert_eq!(url, "http://127.0.0.1:1234");
    }

    #[test]
    fn resolve_service_url_ignores_non_numeric_env() {
        let _g = ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_TESTSERVICE_PORT", "not-a-port");
        let url = resolve_service_url("testservice", 9999);
        std::env::remove_var("MUSU_TESTSERVICE_PORT");
        assert_eq!(url, "http://127.0.0.1:9999");
    }

    #[test]
    fn copy_strips_hop_by_hop_and_host() {
        let mut src = HeaderMap::new();
        src.insert(HOST, HeaderValue::from_static("evil.example.com"));
        src.insert("connection", HeaderValue::from_static("close"));
        src.insert("transfer-encoding", HeaderValue::from_static("chunked"));
        src.insert("x-custom", HeaderValue::from_static("keep-me"));
        let mut dst = reqwest::header::HeaderMap::new();
        copy_request_headers(&src, &mut dst);

        assert!(!dst.contains_key(reqwest::header::HOST));
        assert!(!dst.contains_key("connection"));
        assert!(!dst.contains_key("transfer-encoding"));
        assert!(dst.contains_key("x-custom"));
    }

    #[test]
    fn copy_preserves_authorization_for_internal_services() {
        // Unlike facade.rs, proxy handlers forward Authorization so
        // internal services can perform their own auth checks.
        let mut src = HeaderMap::new();
        src.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer my-token"),
        );
        let mut dst = reqwest::header::HeaderMap::new();
        copy_request_headers(&src, &mut dst);

        assert!(
            dst.contains_key(reqwest::header::AUTHORIZATION),
            "Authorization must be forwarded to internal services"
        );
    }

    #[test]
    fn copy_response_strips_hop_by_hop() {
        let mut src = reqwest::header::HeaderMap::new();
        src.insert("connection", "close".parse().unwrap());
        src.insert("x-backend", "ok".parse().unwrap());
        let mut dst = HeaderMap::new();
        copy_response_headers(&src, &mut dst);

        assert!(!dst.contains_key("connection"));
        assert!(dst.contains_key("x-backend"));
    }

    /// Verify path-prefix stripping logic in isolation.
    #[test]
    fn path_prefix_stripping() {
        // Simulates what proxy_to_service does with the URI path.
        let cases = vec![
            ("/brain/api/search?q=test", "/brain", "/api/search?q=test"),
            ("/brain", "/brain", "/"),
            ("/brain/", "/brain", "/"),
            ("/worker/run", "/worker", "/run"),
            ("/worker", "/worker", "/"),
        ];
        for (input, prefix, expected) in cases {
            let stripped = input.strip_prefix(prefix).unwrap_or(input);
            let result = if stripped.is_empty() || !stripped.starts_with('/') {
                format!("/{}", stripped.trim_start_matches('/'))
            } else {
                stripped.to_string()
            };
            assert_eq!(
                result, expected,
                "strip_prefix({:?}, {:?}) => {:?}, expected {:?}",
                input, prefix, result, expected
            );
        }
    }
}
