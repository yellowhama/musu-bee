//! Deadline propagation middleware — wiki/511.
//!
//! Parses `X-Musu-Deadline-Unix-Ms` from incoming requests, enforces a
//! timeout (deadline − now − 50ms buffer), and injects `DeadlineMs` into
//! request extensions so downstream handlers/proxies can propagate it.
//!
//! Middleware order: `request_id → deadline → rate_limit → auth → handler`
//!
//! Behavior:
//!   - Header absent  → pass through unchanged (no timeout enforcement)
//!   - Header present, expired → immediate 504
//!   - Header present, valid   → wrap handler in `tokio::time::timeout`
//!   - Malformed (non-numeric) → warn log, pass through (no enforcement)
//!   - On timeout → 504 Gateway Timeout with JSON body
//!   - Response echoes the deadline header back for diagnostics

use std::time::Duration;

use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Header name for deadline propagation between musu nodes.
pub const HEADER_NAME: &str = "x-musu-deadline-unix-ms";

/// Cancel 50ms before actual deadline to allow response serialization +
/// network transit back to caller. Master plan §9.5.
const BUFFER_MS: i64 = 50;

/// Newtype stored in request extensions so handlers can read and propagate
/// the deadline.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)] // Inner field read by integration tests + downstream W9/W13 handlers.
pub struct DeadlineMs(pub i64);

/// Axum middleware function. Wire via `axum::middleware::from_fn`.
pub async fn deadline_middleware(mut req: Request, next: Next) -> Response {
    let header_val = req
        .headers()
        .get(HEADER_NAME)
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    let deadline_ms = match header_val {
        Some(ref s) => match s.parse::<i64>() {
            Ok(v) => Some(v),
            Err(_) => {
                tracing::warn!(
                    header = %s,
                    "X-Musu-Deadline-Unix-Ms: malformed (non-numeric); ignoring"
                );
                None
            }
        },
        None => None,
    };

    let deadline_ms = match deadline_ms {
        Some(d) => d,
        None => {
            // No deadline — pass through unchanged.
            return next.run(req).await;
        }
    };

    // Inject into extensions for downstream (audit, handlers).
    req.extensions_mut().insert(DeadlineMs(deadline_ms));

    let now_ms = chrono::Utc::now().timestamp_millis();
    let remaining_ms = deadline_ms - now_ms - BUFFER_MS;

    if remaining_ms <= 0 {
        // Deadline already expired.
        tracing::warn!(
            deadline_ms = deadline_ms,
            now_ms = now_ms,
            "deadline already expired on arrival"
        );
        return deadline_exceeded_response(deadline_ms);
    }

    let timeout_dur = Duration::from_millis(remaining_ms as u64);

    match tokio::time::timeout(timeout_dur, next.run(req)).await {
        Ok(mut resp) => {
            // Echo deadline header in response for diagnostics.
            if let Ok(val) = HeaderValue::from_str(&deadline_ms.to_string()) {
                resp.headers_mut().insert(HEADER_NAME, val);
            }
            resp
        }
        Err(_) => {
            tracing::warn!(
                deadline_ms = deadline_ms,
                remaining_ms = remaining_ms,
                "handler timed out — deadline exceeded"
            );
            deadline_exceeded_response(deadline_ms)
        }
    }
}

/// Build a 504 Gateway Timeout response with JSON body.
fn deadline_exceeded_response(deadline_ms: i64) -> Response {
    let body = Json(json!({
        "error": "deadline_exceeded",
        "code": "deadline_exceeded",
        "deadline_ms": deadline_ms,
    }));
    (StatusCode::GATEWAY_TIMEOUT, body).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_ms_is_50() {
        assert_eq!(BUFFER_MS, 50);
    }

    #[test]
    fn deadline_ms_newtype_clone() {
        let d = DeadlineMs(1234567890123);
        let d2 = d;
        assert_eq!(d.0, d2.0);
    }

    #[test]
    fn header_name_is_lowercase() {
        assert_eq!(HEADER_NAME, "x-musu-deadline-unix-ms");
    }
}
