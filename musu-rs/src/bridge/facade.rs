//! Reverse-proxy facade to Python musu-bridge on `127.0.0.1:8071`.
//!
//! wiki/491 §6 (C-SEC-3 + A-3 hardened):
//!   - INVARIANT: auth middleware runs BEFORE facade. Auth fail = 401
//!     with NO upstream call. This is enforced by middleware ordering
//!     in `bridge::mod`.
//!   - Streaming preserved for SSE (text/event-stream) via reqwest
//!     `bytes_stream()` → axum `Body::from_stream()`.
//!   - Hop-by-hop headers stripped per RFC 7230 §6.1.
//!   - Host header rewritten to upstream target.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::header::{HeaderName, AUTHORIZATION, HOST};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::bridge::error::MusuError;
use crate::bridge::AppState;

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

fn copy_request_headers(src: &HeaderMap, dst: &mut reqwest::header::HeaderMap) {
    for (name, value) in src.iter() {
        if is_hop_by_hop(name) || name == HOST {
            continue;
        }
        // HIGH-2: strip incoming Authorization; caller re-injects the
        // canonical MUSU_BRIDGE_TOKEN. peer_token (accepted by Rust auth)
        // is NOT known to Python upstream, so forwarding it verbatim would
        // produce silent 401s on peer-sync requests.
        if name == AUTHORIZATION {
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

fn copy_response_headers(src: &reqwest::header::HeaderMap, dst: &mut HeaderMap) {
    for (name, value) in src.iter() {
        let std_name = name.as_str();
        if HOP_BY_HOP.iter().any(|h| std_name.eq_ignore_ascii_case(h)) {
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

/// Catch-all axum handler: forwards every request to Python.
///
/// Mounted under `Router::fallback`. Middleware (auth + rate-limit) has
/// already run.
pub async fn proxy(State(state): State<AppState>, req: Request) -> Response {
    let upstream_base = format!("http://127.0.0.1:{}", state.config.python_facade_port);
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or("/");
    let upstream_url = format!("{}{}", upstream_base, path_and_query);

    // Sidecar-removal telemetry: every line here is an /api/* path the native
    // Rust router did NOT match and had to fall through to Python. Logging
    // method+path of each proxied request produces the definitive PROXIED
    // inventory we need before we can delete this fallback (server.py is not in
    // this repo, so the proxied surface cannot be enumerated statically). Target
    // is INFO so it shows up in normal runs; grep `facade proxied` to collect.
    tracing::info!(
        method = %req.method(),
        path = %req.uri().path(),
        "facade proxied request (un-ported /api/* → Python sidecar)"
    );

    let (parts, body) = req.into_parts();

    // Stream the request body to the upstream via reqwest.
    let body_stream = body_to_stream(body);

    let mut headers = reqwest::header::HeaderMap::new();
    copy_request_headers(&parts.headers, &mut headers);

    // HIGH-2: re-inject canonical token; peer_token not forwarded (Python
    // doesn't know it). C-SEC-3 guarantees Python on :8071 binds 127.0.0.1
    // only, so the Python-side bearer check is defense-in-depth, not the
    // security boundary — the actual boundary is connection trust.
    let canonical_auth = format!("Bearer {}", state.config.token);
    if let Ok(v) = reqwest::header::HeaderValue::from_str(&canonical_auth) {
        headers.insert(reqwest::header::AUTHORIZATION, v);
    }

    let method = match reqwest::Method::from_bytes(parts.method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => return method_not_allowed(),
    };

    let req_b = state
        .http_client
        .request(method, &upstream_url)
        .headers(headers)
        .body(reqwest::Body::wrap_stream(body_stream));

    let upstream_resp = match req_b.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(
                upstream = %upstream_url,
                error = %e,
                "facade upstream send failed"
            );
            return MusuError::Upstream(format!("upstream unreachable: {}", e)).into_response();
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

    // Build the response. SSE always streams; non-SSE also streams (no
    // reason to fully buffer in-memory).
    let stream = upstream_resp.bytes_stream();
    let body = Body::from_stream(stream);

    let mut resp = Response::builder().status(status).body(body).unwrap();
    *resp.headers_mut() = resp_headers;

    if is_sse {
        tracing::debug!(upstream = %upstream_url, "facade SSE stream open");
    }

    resp
}

fn method_not_allowed() -> Response {
    (StatusCode::METHOD_NOT_ALLOWED, "method not allowed").into_response()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_strips_authorization() {
        // HIGH-2: Authorization MUST be stripped from forwarded headers;
        // caller re-injects the canonical token.
        let mut src = HeaderMap::new();
        src.insert(
            AUTHORIZATION,
            HeaderValue::from_static("Bearer peer-token-xyz"),
        );
        src.insert("x-custom", HeaderValue::from_static("keep-me"));
        let mut dst = reqwest::header::HeaderMap::new();
        copy_request_headers(&src, &mut dst);

        assert!(
            !dst.contains_key(reqwest::header::AUTHORIZATION),
            "Authorization must be stripped before re-injection"
        );
        assert_eq!(
            dst.get("x-custom").map(|v| v.to_str().unwrap()),
            Some("keep-me"),
            "non-auth headers must still be forwarded"
        );
    }

    #[test]
    fn copy_strips_hop_by_hop_and_host() {
        let mut src = HeaderMap::new();
        src.insert(HOST, HeaderValue::from_static("evil.example.com"));
        src.insert("connection", HeaderValue::from_static("close"));
        src.insert("transfer-encoding", HeaderValue::from_static("chunked"));
        src.insert("x-keeper", HeaderValue::from_static("ok"));
        let mut dst = reqwest::header::HeaderMap::new();
        copy_request_headers(&src, &mut dst);

        assert!(!dst.contains_key(reqwest::header::HOST));
        assert!(!dst.contains_key("connection"));
        assert!(!dst.contains_key("transfer-encoding"));
        assert!(dst.contains_key("x-keeper"));
    }
}
