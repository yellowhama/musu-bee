//! GET /health and GET /health/ready.
//!
//! wiki/491 §5.1. Exposes `auth_mode` and `audit_degraded` per
//! C-SEC-2 + C-SEC-10.

use axum::extract::State;
use axum::Json;
use serde::Serialize;
use serde_json::Value;

use crate::bridge::AppState;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub worker_ok: bool,
    pub db_size_mb: f64,
    pub disk_free_pct: f64,
    pub auth_mode: &'static str,
    pub audit_degraded: bool,
    pub schema_applied: bool,
    /// Placeholder for relay block. Returned as null until R-cleanup ships
    /// relay-rs (DEVIATION from Python which returns a populated object).
    pub relay: Option<Value>,
}

pub async fn get_health(State(state): State<AppState>) -> Json<HealthResponse> {
    let db_size_mb = state
        .config
        .db_path
        .metadata()
        .ok()
        .map(|m| (m.len() as f64) / 1_048_576.0)
        .unwrap_or(0.0);

    let disk_free_pct = disk_free_percent(&state.config.db_path).unwrap_or(0.0);

    let schema_applied = crate::bridge::db::schema_applied(&state.pool).await;

    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        worker_ok: true,
        db_size_mb,
        disk_free_pct,
        auth_mode: state.config.env.as_str(),
        audit_degraded: state.audit.degraded(),
        schema_applied,
        relay: None,
    })
}

pub async fn get_health_ready(State(state): State<AppState>) -> Json<serde_json::Value> {
    // wiki/492 §3 + §11: readiness = PRAGMA user_version >= EXPECTED.
    // schema_applied/audit_schema_applied retained for back-compat with
    // anything inspecting the legacy keys.
    let ready = crate::core::is_ready(&state.pool).await;
    let schema_version = crate::core::schema_version(&state.pool).await;
    let schema_applied = crate::bridge::db::schema_applied(&state.pool).await;
    let audit_applied = crate::bridge::db::audit_schema_applied(&state.pool).await;
    Json(serde_json::json!({
        "ready": ready,
        "schema_version": schema_version,
        "schema_applied": schema_applied,
        "audit_schema_applied": audit_applied,
    }))
}

/// Best-effort disk free percent for the volume containing `path`.
/// Returns None on platforms / errors we can't handle. Not load-bearing.
fn disk_free_percent(_path: &std::path::Path) -> Option<f64> {
    // R1 placeholder: returning 0.0 is acceptable for /health; R-cleanup
    // adds proper sysinfo crate-backed measurement. Python health does
    // the same kind of approximation.
    Some(0.0)
}
