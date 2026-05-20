//! Sliding-window per-IP rate limiter.
//!
//! wiki/491 §8.5 (C-SEC-5 resolution):
//!   - 60 req / 60s / IP default (configurable via MUSU_RATE_LIMIT_PER_MIN)
//!   - 1000 req/min global ceiling (across all IPs)
//!   - LRU cap 4096 IPs
//!   - Per-endpoint override: /api/nodes/accept-peer = 5 req/min
//!   - Localhost NOT exempt (defense against compromised local process)
//!   - MUSU_DISABLE_RATE_LIMIT honored only in dev/test (enforced in config.rs)
//!   - Rejects with 429 + Retry-After header + warn log
//!
//! Middleware order: `request_id → rate_limit → auth → audit_setup → handler`
//! (rate_limit BEFORE auth so DoS-shaped attacks don't consume auth budget).

use std::collections::VecDeque;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use dashmap::DashMap;
use serde_json::json;
use std::net::SocketAddr;

const WINDOW: Duration = Duration::from_secs(60);
const LRU_CAP: usize = 4096;
const GLOBAL_PER_MIN: u32 = 1000;

/// Per-endpoint overrides. Format: (method, path) → req/min.
/// Listed in match order; first match wins.
fn endpoint_override(method: &axum::http::Method, path: &str) -> Option<u32> {
    if *method == axum::http::Method::POST && path == "/api/nodes/accept-peer" {
        return Some(5);
    }
    None
}

#[derive(Debug)]
struct Window {
    /// Timestamps of requests within the current window. Oldest first.
    timestamps: VecDeque<Instant>,
    /// For LRU eviction.
    last_seen: Instant,
}

impl Window {
    fn new() -> Self {
        Self {
            timestamps: VecDeque::new(),
            last_seen: Instant::now(),
        }
    }

    fn record_and_check(&mut self, limit: u32) -> Result<(), Duration> {
        let now = Instant::now();
        self.last_seen = now;

        // Drop expired entries.
        let cutoff = now - WINDOW;
        while let Some(front) = self.timestamps.front() {
            if *front < cutoff {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }

        if self.timestamps.len() as u32 >= limit {
            // How long until the oldest entry expires?
            let retry_in = self
                .timestamps
                .front()
                .map(|t| (*t + WINDOW).saturating_duration_since(now))
                .unwrap_or(WINDOW);
            return Err(retry_in.max(Duration::from_secs(1)));
        }

        self.timestamps.push_back(now);
        Ok(())
    }
}

/// State for the rate limiter. Held in axum `State` via clone (cheap due to Arc).
#[derive(Debug, Clone)]
pub struct RateLimitState {
    inner: Arc<RateLimitInner>,
}

#[derive(Debug)]
struct RateLimitInner {
    per_ip: DashMap<IpAddr, Window>,
    /// Global ceiling window (across all IPs). Wrapped in a Mutex because
    /// we mutate the VecDeque.
    global: std::sync::Mutex<Window>,
    per_ip_limit: u32,
    disabled: bool,
}

impl RateLimitState {
    pub fn new(per_ip_limit: u32, disabled: bool) -> Self {
        Self {
            inner: Arc::new(RateLimitInner {
                per_ip: DashMap::new(),
                global: std::sync::Mutex::new(Window::new()),
                per_ip_limit,
                disabled,
            }),
        }
    }

    /// Check the global ceiling. Returns Err(retry_in) if exceeded.
    fn check_global(&self) -> Result<(), Duration> {
        let mut g = self
            .inner
            .global
            .lock()
            .expect("rate-limit global mutex poisoned");
        g.record_and_check(GLOBAL_PER_MIN)
    }

    /// Check per-IP limit (or per-endpoint override). Returns Err(retry_in) if exceeded.
    fn check_per_ip(&self, ip: IpAddr, limit: u32) -> Result<(), Duration> {
        // Evict if over LRU cap. Cheap heuristic: when len > cap, drop the
        // single least-recently-seen entry (full LRU is O(n) per insert
        // but dashmap doesn't have a true LRU; this is good enough for
        // the abuse-bound use case).
        if self.inner.per_ip.len() >= LRU_CAP {
            let oldest = self
                .inner
                .per_ip
                .iter()
                .min_by_key(|e| e.value().last_seen)
                .map(|e| *e.key());
            if let Some(k) = oldest {
                self.inner.per_ip.remove(&k);
            }
        }

        let mut entry = self.inner.per_ip.entry(ip).or_insert_with(Window::new);
        entry.record_and_check(limit)
    }
}

/// Build a 429 response with Retry-After header.
fn rate_limited_response(retry_in: Duration) -> Response {
    let secs = retry_in.as_secs().max(1);
    let body = Json(json!({
        "error": "rate limited",
        "code": "rate_limited",
        "retry_after_s": secs,
    }));
    let mut resp = (StatusCode::TOO_MANY_REQUESTS, body).into_response();
    if let Ok(val) = HeaderValue::from_str(&secs.to_string()) {
        resp.headers_mut()
            .insert(axum::http::header::RETRY_AFTER, val);
    }
    resp
}

pub async fn rate_limit_middleware(
    State(state): State<RateLimitState>,
    req: Request,
    next: Next,
) -> Response {
    if state.inner.disabled {
        return next.run(req).await;
    }

    // Global ceiling check first.
    if let Err(retry_in) = state.check_global() {
        tracing::warn!(
            retry_in_s = retry_in.as_secs(),
            "global rate limit exceeded"
        );
        return rate_limited_response(retry_in);
    }

    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let ip = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED));

    let limit = endpoint_override(&method, &path).unwrap_or(state.inner.per_ip_limit);

    if let Err(retry_in) = state.check_per_ip(ip, limit) {
        tracing::warn!(
            ip = %ip,
            path = %path,
            limit = limit,
            "per-IP rate limit exceeded"
        );
        return rate_limited_response(retry_in);
    }

    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_under_limit() {
        let state = RateLimitState::new(5, false);
        let ip: IpAddr = "10.0.0.1".parse().unwrap();
        for _ in 0..5 {
            assert!(state.check_per_ip(ip, 5).is_ok());
        }
    }

    #[test]
    fn rejects_over_limit() {
        let state = RateLimitState::new(3, false);
        let ip: IpAddr = "10.0.0.2".parse().unwrap();
        for _ in 0..3 {
            assert!(state.check_per_ip(ip, 3).is_ok());
        }
        assert!(state.check_per_ip(ip, 3).is_err());
    }

    #[test]
    fn disabled_state_passes_through() {
        let state = RateLimitState::new(1, true);
        // Even with limit=1 disabled means middleware never calls check_*.
        // Here we just verify the flag flows through.
        assert!(state.inner.disabled);
    }

    #[test]
    fn endpoint_override_accept_peer() {
        let m = axum::http::Method::POST;
        assert_eq!(endpoint_override(&m, "/api/nodes/accept-peer"), Some(5));
        assert_eq!(endpoint_override(&m, "/api/companies"), None);
        let m = axum::http::Method::GET;
        assert_eq!(endpoint_override(&m, "/api/nodes/accept-peer"), None);
    }

    #[test]
    fn separate_ips_have_separate_buckets() {
        let state = RateLimitState::new(2, false);
        let ip1: IpAddr = "10.0.0.10".parse().unwrap();
        let ip2: IpAddr = "10.0.0.11".parse().unwrap();
        assert!(state.check_per_ip(ip1, 2).is_ok());
        assert!(state.check_per_ip(ip1, 2).is_ok());
        // ip1 exhausted, but ip2 has its own budget.
        assert!(state.check_per_ip(ip2, 2).is_ok());
        assert!(state.check_per_ip(ip2, 2).is_ok());
        assert!(state.check_per_ip(ip1, 2).is_err());
    }
}
