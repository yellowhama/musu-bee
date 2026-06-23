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

/// Best-effort disk free percent (0.0–100.0) for the volume containing `path`.
/// Returns None on platforms / errors we can't handle. Not load-bearing — a
/// None or error here must never fail the health check.
#[cfg(windows)]
fn disk_free_percent(path: &std::path::Path) -> Option<f64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    // GetDiskFreeSpaceExW accepts a directory/file path and reports the free
    // and total bytes of the volume that contains it. Use the db path's parent
    // dir (the path itself may be a file); fall back to the path as given.
    let dir = path.parent().unwrap_or(path);

    // Wide, NUL-terminated path for the W API.
    let mut wide: Vec<u16> = dir.as_os_str().encode_wide().collect();
    wide.push(0);

    let mut free_to_caller: u64 = 0;
    let mut total: u64 = 0;
    // SAFETY: pointers are valid for the duration of the call; out-params are
    // local stack variables; the path buffer is NUL-terminated.
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_to_caller,
            &mut total,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 || total == 0 {
        return None;
    }
    Some((free_to_caller as f64 / total as f64) * 100.0)
}

#[cfg(not(windows))]
fn disk_free_percent(_path: &std::path::Path) -> Option<f64> {
    // Non-Windows builds (CI/tooling) have no native measurement wired; musu
    // ships Windows-first. Return None rather than a fabricated 0.0 so the
    // field is honestly absent instead of a misleading "disk full" signal.
    None
}
