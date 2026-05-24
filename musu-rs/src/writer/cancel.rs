//! DELETE /api/tasks/{task_id} — wiki/495 §1 #4 (Q4 lock).
//!
//! Signals the runner to cancel an in-flight task. Returns 200 on found,
//! 404 if no live registry entry. Idempotent: deleting an already-finished
//! task returns 404 (operator can re-check via SSE or row).

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Serialize)]
pub struct CancelResponse {
    pub task_id: String,
    pub cancelled: bool,
}

pub async fn cancel_task(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(task_id): Path<String>,
) -> Result<(StatusCode, Json<CancelResponse>)> {
    let found = state.task_runner.cancel(&task_id);
    if !found {
        // Audit even on miss — operator visibility.
        state
            .audit
            .write(crate::bridge::audit::AuditEntry {
                actor_ip: addr.ip(),
                method: "DELETE".into(),
                path: format!("/api/tasks/{task_id}"),
                status_code: 404,
                agent_id: None,
                note: Some("cancel: task_id not found in live registry".into()),
                company_id: None,
                cross_machine: false,
            })
            .await;
        return Err(MusuError::NotFound(format!(
            "task {task_id} not found (already completed or unknown)"
        )));
    }

    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: addr.ip(),
            method: "DELETE".into(),
            path: format!("/api/tasks/{task_id}"),
            status_code: 200,
            agent_id: None,
            note: Some("cancel signal delivered".into()),
            company_id: None,
            cross_machine: false,
        })
        .await;

    Ok((
        StatusCode::OK,
        Json(CancelResponse {
            task_id,
            cancelled: true,
        }),
    ))
}
