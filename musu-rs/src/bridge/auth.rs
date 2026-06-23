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
use std::sync::{Arc, RwLock};

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
///
/// `peer_token` is the account-wide mesh bearer. It lives behind an
/// `Arc<RwLock<...>>` cell so a background watcher (see `bridge::mod`) can
/// hot-swap it when `~/.musu/mesh.env` is (re)written by `musu mesh
/// join-account`, WITHOUT restarting the bridge. A bridge started before the
/// account is joined would otherwise hold `peer_token = None` forever and 401
/// every cross-machine sibling. The cell type is the swap channel; `arc-swap`
/// is deliberately NOT pulled in — `std::sync::RwLock` is sufficient for a
/// secret read on every request and written at most every few seconds.
#[derive(Debug, Clone)]
pub struct AuthState {
    pub token: Arc<String>,
    pub peer_token: Arc<RwLock<Option<Arc<String>>>>,
    pub localhost_auth_required: bool,
}

impl AuthState {
    pub fn from_config(cfg: &BridgeConfig) -> Self {
        Self {
            token: Arc::new(cfg.token.clone()),
            peer_token: Arc::new(RwLock::new(
                cfg.peer_token.as_ref().map(|t| Arc::new(t.clone())),
            )),
            localhost_auth_required: cfg.localhost_auth_required,
        }
    }

    /// Hot-swap the account-wide mesh bearer (peer_token) at runtime.
    ///
    /// Critic A3 (HIGH) — empty-swap guard: a `None` or trimmed-empty candidate
    /// is REJECTED without taking the write lock. A missing/emptied `mesh.env`
    /// (deleted file, blanked value, mid-rotation truncation) must NEVER clear a
    /// previously-good bearer and must NEVER install `Some("")` (an empty
    /// `Some` would make `ct_compare` accept an empty bearer — see
    /// require_bearer's empty-token reject at request time, but defense in
    /// depth keeps it out of the cell entirely). Per confirmed facts the mesh
    /// bearer has NO guaranteed minimum length, so this path enforces NON-EMPTY
    /// only — no `>=32` floor (a floor would reject short-but-valid bearers and
    /// break the existing roundtrip test).
    pub fn swap_peer_token(&self, candidate: Option<String>) {
        let value = match candidate {
            Some(v) if !v.trim().is_empty() => v,
            // None or empty/whitespace → preserve the existing bearer.
            _ => return,
        };
        if let Ok(mut guard) = self.peer_token.write() {
            *guard = Some(Arc::new(value));
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

/// True iff `ip` is a loopback address, including v6-mapped v4 loopback
/// (`::ffff:127.0.0.0/104`). Stdlib `IpAddr::is_loopback` returns false
/// for v6-mapped v4 loopback; we must handle that case explicitly.
///
/// wiki/491 §4 C-SEC-9 (Auditor A HIGH-1 audit-fix 2026-05-20).
fn is_loopback_strict(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6
                    .to_ipv4_mapped()
                    .map(|v4| v4.is_loopback())
                    .unwrap_or(false)
        }
    }
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
pub async fn require_bearer(State(state): State<AuthState>, req: Request, next: Next) -> Response {
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
    // C-SEC-9: use is_loopback_strict to cover v6-mapped v4 loopback.
    let ip = client_ip(&req);
    if !state.localhost_auth_required && is_loopback_strict(ip) {
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

    // V23.2-B1 secondary peer-sync token (account-wide mesh bearer).
    // The cell is hot-swappable; take a read guard, clone the inner Arc out,
    // then DROP the guard before the constant-time compare so we never hold the
    // lock across an await or across ct_compare.
    let peer = {
        let guard = state.peer_token.read().ok();
        guard.and_then(|g| g.clone())
    };
    if let Some(peer) = peer {
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
        assert!(is_screen_novnc_bypass(
            &Method::GET,
            "/screen/novnc/index.html"
        ));
        assert!(is_screen_novnc_bypass(
            &Method::GET,
            "/screen/novnc/a/b/c.js"
        ));
        assert!(is_screen_novnc_bypass(
            &Method::HEAD,
            "/screen/novnc/index.html"
        ));
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
        assert!(has_suspicious_encoding(
            "/screen/novnc/%2e%2e/api/companies"
        ));
        assert!(has_suspicious_encoding(
            "/screen/novnc/%2E%2E/api/companies"
        ));
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
        // Stdlib `Ipv6Addr::is_loopback` returns true only for `::1`;
        // our is_loopback_strict helper handles the v4-mapped case.
        let v6: Ipv6Addr = "::ffff:127.0.0.1".parse().unwrap();
        let ip = IpAddr::V6(v6);
        assert!(
            is_loopback_strict(ip),
            "::ffff:127.0.0.1 should count as loopback"
        );
        // Also verify stdlib's behavior diverges (regression-guard the gap).
        assert!(
            !ip.is_loopback(),
            "stdlib should NOT recognize ::ffff:127.0.0.1 as loopback (bug we worked around)"
        );
    }

    #[test]
    fn ipv6_mapped_non_loopback_is_not_loopback() {
        // C-SEC-9: ::ffff:192.168.1.5 is a v6-mapped LAN address, NOT loopback.
        let v6: Ipv6Addr = "::ffff:192.168.1.5".parse().unwrap();
        let ip = IpAddr::V6(v6);
        assert!(
            !is_loopback_strict(ip),
            "::ffff:192.168.1.5 must NOT count as loopback"
        );
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

    // ---- hot-swap peer_token (Critic A3 empty-swap guard) ----

    /// Build a bare AuthState with the given peer bearer for swap tests.
    fn auth_state_with_peer(peer: Option<&str>) -> AuthState {
        AuthState {
            token: Arc::new("a".repeat(32)),
            peer_token: Arc::new(RwLock::new(peer.map(|p| Arc::new(p.to_string())))),
            localhost_auth_required: true,
        }
    }

    fn peer_snapshot(state: &AuthState) -> Option<String> {
        state
            .peer_token
            .read()
            .unwrap()
            .as_ref()
            .map(|a| a.as_str().to_string())
    }

    #[test]
    fn swap_empty_string_preserves_existing() {
        let state = auth_state_with_peer(Some("goodbearer123"));
        state.swap_peer_token(Some(String::new()));
        assert_eq!(
            peer_snapshot(&state),
            Some("goodbearer123".to_string()),
            "Some(\"\") must NOT clear a previously-set bearer"
        );
    }

    #[test]
    fn swap_whitespace_preserves_existing() {
        let state = auth_state_with_peer(Some("goodbearer123"));
        state.swap_peer_token(Some("   ".to_string()));
        assert_eq!(
            peer_snapshot(&state),
            Some("goodbearer123".to_string()),
            "Some(\"  \") must NOT clear a previously-set bearer"
        );
    }

    #[test]
    fn swap_none_preserves_existing() {
        let state = auth_state_with_peer(Some("goodbearer123"));
        state.swap_peer_token(None);
        assert_eq!(
            peer_snapshot(&state),
            Some("goodbearer123".to_string()),
            "None must NOT clear a previously-set bearer"
        );
    }

    #[test]
    fn swap_valid_installs_bearer() {
        // Starts with no peer bearer (the bug: bridge booted pre-join).
        let state = auth_state_with_peer(None);
        assert_eq!(peer_snapshot(&state), None);
        state.swap_peer_token(Some("validbearer123".to_string()));
        assert_eq!(peer_snapshot(&state), Some("validbearer123".to_string()));
    }

    #[test]
    fn require_bearer_accepts_swapped_in_bearer() {
        use axum::body::Body;
        use axum::http::header::AUTHORIZATION;

        let state = auth_state_with_peer(None);
        state.swap_peer_token(Some("validbearer123".to_string()));

        // A request carrying the swapped-in mesh bearer must compare-equal.
        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/tasks")
            .header(AUTHORIZATION, "Bearer validbearer123")
            .body(Body::empty())
            .unwrap();
        let token = parse_bearer(
            req.headers()
                .get(AUTHORIZATION)
                .unwrap()
                .to_str()
                .unwrap(),
        )
        .unwrap();
        let peer = {
            let guard = state.peer_token.read().ok();
            guard.and_then(|g| g.clone())
        }
        .expect("peer bearer installed");
        assert!(
            ct_compare(token.as_bytes(), peer.as_bytes()),
            "swapped-in bearer must be accepted by ct_compare"
        );
    }

    #[test]
    fn wrong_bearer_still_rejected_after_swap() {
        let state = auth_state_with_peer(None);
        state.swap_peer_token(Some("validbearer123".to_string()));
        let peer = {
            let guard = state.peer_token.read().ok();
            guard.and_then(|g| g.clone())
        }
        .expect("peer bearer installed");
        // A different bearer of equal length must not compare-equal, and the
        // primary token must also reject it.
        assert!(!ct_compare(b"WRONGbearer123", peer.as_bytes()));
        assert!(!ct_compare(b"WRONGbearer123", state.token.as_bytes()));
    }
}
