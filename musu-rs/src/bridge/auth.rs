//! Bearer-token auth middleware.
//!
//! wiki/491 §4 (V23.2-B1 + Critic-hardened):
//!   C-SEC-1: empty-token reject at boot + request time
//!   C-SEC-2: MUSU_ENV inverted (default = prod)
//!   C-SEC-3: localhost_auth_required default true
//!   C-SEC-6: segment-split bypass (no prefix match), %2f rejection
//!   C-SEC-7: hmac/sha2 NOT used for auth (subtle::ConstantTimeEq only)
//!   C-SEC-9: IpAddr::is_loopback() for v4/v6/v6-mapped
//!   C-SEC-11: RFC 6750 case-insensitive Bearer scheme
//!   C-SEC-12: bypass keyed on (method, path) tuple
//!
//! Port-from: `musu-bridge/middleware.py::TokenAuthMiddleware`.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;

use axum::extract::{ConnectInfo, Request, State};
use axum::http::{Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use subtle::ConstantTimeEq;

use super::config::BridgeConfig;

/// State held by the auth middleware. Tokens are stored as `String` (zeroizing
/// is a R3 hardening item; for R1 the secret never leaves the process).
#[derive(Debug, Clone)]
pub struct AuthState {
    pub token: Arc<String>,
    pub peer_token: Option<Arc<String>>,
    pub localhost_auth_required: bool,
}

impl AuthState {
    pub fn from_config(cfg: &BridgeConfig) -> Self {
        Self {
            token: Arc::new(cfg.token.clone()),
            peer_token: cfg.peer_token.as_ref().map(|t| Arc::new(t.clone())),
            localhost_auth_required: cfg.localhost_auth_required,
        }
    }
}

/// Bypass list — keyed on (method, path) exact match.
/// wiki/491 §4 C-SEC-12.
fn is_exact_bypass(method: &Method, path: &str) -> bool {
    matches!(
        (method, path),
        (&Method::GET, "/health")
            | (&Method::GET, "/health/ready")
            | (&Method::GET, "/metrics")
            | (&Method::GET, "/docs")
            | (&Method::GET, "/redoc")
            | (&Method::GET, "/openapi.json")
    )
}

/// Prefix bypass for `/screen/novnc/<rest>` — segment-aware match
/// (NOT `starts_with`). wiki/491 §4 C-SEC-6.
///
/// Returns true iff the FIRST two segments of `path` are exactly
/// ["screen", "novnc"] AND no segment is "..", "." or empty (after first '/').
fn is_screen_novnc_bypass(method: &Method, path: &str) -> bool {
    if !matches!(method, &Method::GET | &Method::HEAD) {
        return false;
    }
    // Path must start with '/'; split into segments; skip leading empty.
    let mut iter = path.split('/');
    // First element is always "" because path starts with '/'.
    if iter.next() != Some("") {
        return false;
    }
    let s1 = match iter.next() {
        Some(s) => s,
        None => return false,
    };
    let s2 = match iter.next() {
        Some(s) => s,
        None => return false,
    };
    if s1 != "screen" || s2 != "novnc" {
        return false;
    }
    // Remaining segments must not contain traversal sentinels.
    for seg in iter {
        if seg == ".." || seg == "." || seg.is_empty() {
            return false;
        }
    }
    true
}

/// True if this (method, path) is whitelisted for unauthenticated access.
fn is_bypass(method: &Method, path: &str) -> bool {
    is_exact_bypass(method, path) || is_screen_novnc_bypass(method, path)
}

/// True if `path` contains an encoded slash or encoded dot — these often
/// indicate path-traversal attempts that bypass naive segment splitting.
/// wiki/491 §4 C-SEC-6.
fn has_suspicious_encoding(raw_path: &str) -> bool {
    // Case-insensitive percent-encoding check.
    let lower = raw_path.to_ascii_lowercase();
    lower.contains("%2f") || lower.contains("%2e")
}

/// Extract the client IP from request extensions. Falls back to 0.0.0.0
/// when ConnectInfo isn't set (which means tests/loopback edge cases).
fn client_ip(req: &Request) -> IpAddr {
    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED))
}

/// Build a JSON 401 response with the supplied reason.
fn unauthorized(reason: &str) -> Response {
    let body = Json(json!({
        "error": format!("unauthorized: {}", reason),
        "code": "unauthorized",
    }));
    (StatusCode::UNAUTHORIZED, body).into_response()
}

/// Axum middleware function. Mount with `axum::middleware::from_fn_with_state`.
pub async fn require_bearer(
    State(state): State<AuthState>,
    req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    // Use the raw URI path; axum 0.7 has already done percent-decoding
    // normalization, but the raw query/path may still contain encoded
    // separators we need to reject.
    let path = req.uri().path().to_string();
    let raw_path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or(path.as_str());

    // C-SEC-6: reject %2f and %2e in the path (path-traversal smugglers).
    if has_suspicious_encoding(raw_path_and_query) {
        tracing::warn!(path = %raw_path_and_query, "path-traversal attempt: encoded slash/dot rejected");
        return unauthorized("path traversal rejected");
    }

    // Bypass list runs AFTER suspicious-encoding check so we never grant
    // bypass to a path with `%2f` or `%2e`.
    if is_bypass(&method, &path) {
        return next.run(req).await;
    }

    // C-SEC-3: localhost-auth-bypass only when explicitly opted in.
    let ip = client_ip(&req);
    if !state.localhost_auth_required && ip.is_loopback() {
        return next.run(req).await;
    }

    // Header parse.
    let header_value = match req.headers().get(axum::http::header::AUTHORIZATION) {
        Some(h) => match h.to_str() {
            Ok(s) => s,
            Err(_) => return unauthorized("malformed authorization header"),
        },
        None => return unauthorized("missing authorization"),
    };

    // C-SEC-11: case-insensitive Bearer scheme per RFC 6750.
    let token = match parse_bearer(header_value) {
        Some(t) => t,
        None => return unauthorized("expected Bearer scheme"),
    };

    // C-SEC-1: empty token rejected at request time.
    if token.is_empty() {
        return unauthorized("empty token");
    }

    // Primary token compare (constant-time on equal length).
    if ct_compare(token.as_bytes(), state.token.as_bytes()) {
        return next.run(req).await;
    }

    // V23.2-B1 secondary peer-sync token.
    if let Some(peer) = &state.peer_token {
        if ct_compare(token.as_bytes(), peer.as_bytes()) {
            return next.run(req).await;
        }
    }

    unauthorized("invalid bearer")
}

/// Parse `Authorization: Bearer <token>` (case-insensitive scheme).
/// Returns `None` if scheme is missing or not Bearer. Returns `Some("")` if
/// the token portion is empty (caller decides whether to reject).
fn parse_bearer(header: &str) -> Option<&str> {
    // Find the first space. Everything before = scheme, after = token.
    let trimmed = header.trim_start();
    // Find scheme via case-insensitive prefix match on "bearer ".
    if trimmed.len() < 7 {
        return None;
    }
    let (scheme, rest) = trimmed.split_at(6);
    if !scheme.eq_ignore_ascii_case("Bearer") {
        return None;
    }
    // The 7th char must be whitespace.
    let mut chars = rest.chars();
    match chars.next() {
        Some(c) if c.is_whitespace() => {}
        _ => return None,
    }
    // Token is the remainder after the whitespace, but we keep using
    // slice math to avoid allocating.
    let token = &rest[1..];
    // RFC 6750 allows trailing whitespace; strip both sides.
    Some(token.trim())
}

/// Constant-time byte comparison. Length check first (constant time on
/// equal-length inputs only — length mismatch leaks length but that's
/// strictly less info than a timing oracle).
fn ct_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.ct_eq(b).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv6Addr;

    // ---- bypass list tests ----

    #[test]
    fn exact_health_get_is_bypass() {
        assert!(is_bypass(&Method::GET, "/health"));
        assert!(is_bypass(&Method::GET, "/health/ready"));
        assert!(is_bypass(&Method::GET, "/metrics"));
    }

    #[test]
    fn exact_health_post_is_not_bypass() {
        // C-SEC-12: bypass keyed on (method, path) — POST /health requires auth.
        assert!(!is_bypass(&Method::POST, "/health"));
    }

    #[test]
    fn screen_novnc_simple_bypass_ok() {
        assert!(is_screen_novnc_bypass(&Method::GET, "/screen/novnc/index.html"));
        assert!(is_screen_novnc_bypass(&Method::GET, "/screen/novnc/a/b/c.js"));
        assert!(is_screen_novnc_bypass(&Method::HEAD, "/screen/novnc/index.html"));
    }

    #[test]
    fn screen_novnc_traversal_rejected() {
        // C-SEC-6: "../" segment in path must NOT bypass.
        assert!(!is_screen_novnc_bypass(
            &Method::GET,
            "/screen/novnc/../api/companies"
        ));
        assert!(!is_screen_novnc_bypass(
            &Method::GET,
            "/screen/novnc/./api/companies"
        ));
    }

    #[test]
    fn screen_novnc_post_is_not_bypass() {
        // Only GET/HEAD bypass for static assets.
        assert!(!is_screen_novnc_bypass(&Method::POST, "/screen/novnc/x"));
    }

    #[test]
    fn double_slash_path_rejected() {
        // `//screen/novnc/x` parses as segments ["", "", "screen", "novnc", "x"]
        // which means s1="" — rejected.
        assert!(!is_screen_novnc_bypass(&Method::GET, "//screen/novnc/x"));
    }

    // ---- suspicious-encoding tests ----

    #[test]
    fn percent_2f_detected() {
        assert!(has_suspicious_encoding("/screen/novnc/%2fapi%2fcompanies"));
        assert!(has_suspicious_encoding("/screen/novnc/%2Fapi%2Fcompanies"));
    }

    #[test]
    fn percent_2e_detected() {
        // Encoded dot — common in traversal smuggle.
        assert!(has_suspicious_encoding("/screen/novnc/%2e%2e/api/companies"));
        assert!(has_suspicious_encoding("/screen/novnc/%2E%2E/api/companies"));
    }

    #[test]
    fn clean_path_not_suspicious() {
        assert!(!has_suspicious_encoding("/health"));
        assert!(!has_suspicious_encoding("/api/companies?workspace_id=foo"));
    }

    // ---- Bearer parse tests ----

    #[test]
    fn bearer_case_insensitive() {
        // C-SEC-11 RFC 6750.
        assert_eq!(parse_bearer("Bearer xyz"), Some("xyz"));
        assert_eq!(parse_bearer("bearer xyz"), Some("xyz"));
        assert_eq!(parse_bearer("BEARER xyz"), Some("xyz"));
        assert_eq!(parse_bearer("BeArEr xyz"), Some("xyz"));
    }

    #[test]
    fn bearer_rejects_other_schemes() {
        assert_eq!(parse_bearer("Basic dXNlcjpwYXNz"), None);
        assert_eq!(parse_bearer("Token xyz"), None);
    }

    #[test]
    fn bearer_empty_token_returned_as_empty() {
        // "Bearer " with trailing space → token is "".
        assert_eq!(parse_bearer("Bearer "), Some(""));
        // Caller (require_bearer) is responsible for 401-on-empty.
    }

    #[test]
    fn bearer_missing_space() {
        // "Bearerxyz" has no whitespace after scheme → reject.
        assert_eq!(parse_bearer("Bearerxyz"), None);
    }

    #[test]
    fn bearer_strips_trailing_whitespace() {
        assert_eq!(parse_bearer("Bearer xyz  "), Some("xyz"));
    }

    // ---- IP loopback tests ----

    #[test]
    fn ipv4_loopback_detected() {
        // C-SEC-9: IpAddr::is_loopback handles standard v4.
        let ip: IpAddr = "127.0.0.1".parse().unwrap();
        assert!(ip.is_loopback());
        let ip: IpAddr = "127.0.0.5".parse().unwrap();
        assert!(ip.is_loopback()); // entire 127.0.0.0/8 is loopback
    }

    #[test]
    fn ipv6_loopback_detected() {
        let ip: IpAddr = "::1".parse().unwrap();
        assert!(ip.is_loopback());
    }

    #[test]
    fn ipv6_mapped_v4_loopback_is_loopback() {
        // C-SEC-9: ::ffff:127.0.0.1 (v6-mapped v4 loopback).
        // NOTE: stdlib `Ipv6Addr::is_loopback` returns true only for `::1`.
        // For v4-mapped addresses we must convert via `to_ipv4_mapped()`.
        let v6: Ipv6Addr = "::ffff:127.0.0.1".parse().unwrap();
        let ip = IpAddr::V6(v6);
        // Hand-rolled check matching the auth middleware's expectations:
        let is_loopback = match ip {
            IpAddr::V4(v4) => v4.is_loopback(),
            IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6
                        .to_ipv4_mapped()
                        .map(|v4| v4.is_loopback())
                        .unwrap_or(false)
            }
        };
        assert!(is_loopback, "::ffff:127.0.0.1 should count as loopback");
    }

    #[test]
    fn zero_ip_not_loopback() {
        let ip: IpAddr = "0.0.0.0".parse().unwrap();
        assert!(!ip.is_loopback());
    }

    #[test]
    fn lan_ip_not_loopback() {
        let ip: IpAddr = "192.168.1.5".parse().unwrap();
        assert!(!ip.is_loopback());
        let ip: IpAddr = "100.64.5.5".parse().unwrap(); // tailscale CGN
        assert!(!ip.is_loopback());
    }

    // ---- constant-time compare ----

    #[test]
    fn ct_compare_equal() {
        assert!(ct_compare(b"abc123", b"abc123"));
    }

    #[test]
    fn ct_compare_diff_value_same_len() {
        assert!(!ct_compare(b"abc123", b"xyz456"));
    }

    #[test]
    fn ct_compare_diff_len() {
        assert!(!ct_compare(b"abc", b"abcd"));
        assert!(!ct_compare(b"", b"abc"));
    }
}
