//! POST /api/companies/{id}/run — writer-stub per wiki/491 §5.5 (A-1).
//!
//! R1 implements the writer-stub: insert a route_execution row, then POST
//! to Python `/api/tasks/delegate` on :8071 to trigger real execution.
//! R5 replaces this with native Rust writer.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // `passthrough` flattens unknown fields forwarded to Python facade.
pub struct RunRequest {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub sender_id: Option<String>,
    #[serde(default)]
    pub expected_output: Option<String>,
    #[serde(flatten)]
    pub passthrough: Value,
}

#[derive(Debug, Serialize)]
pub struct RunResponse {
    pub company_id: String,
    pub task: TaskRef,
}

#[derive(Debug, Serialize)]
pub struct TaskRef {
    pub task_id: String,
    pub status: &'static str,
}

pub async fn run_company(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<String>,
    Json(req): Json<RunRequest>,
) -> Result<(StatusCode, Json<RunResponse>)> {
    if !crate::bridge::db::schema_applied(&state.pool).await {
        return Err(MusuError::Internal(
            "schema not applied — apply R2 migrations first".into(),
        ));
    }

    // Verify company exists.
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM companies WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await
        .map_err(MusuError::Sqlx)?;
    if exists.is_none() {
        return Err(MusuError::NotFound(format!("company {} not found", id)));
    }

    // Generate task_id, write pending row.
    let task_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let channel = req
        .channel
        .clone()
        .unwrap_or_else(|| format!("company:{}", id));
    let sender_id = req.sender_id.clone().unwrap_or_else(|| "system".into());
    let text = req.text.clone().unwrap_or_default();
    let input_hash = crate::bridge::dedup::DedupCache::key(&channel, &sender_id, &text);

    sqlx::query(
        "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
         VALUES (?, ?, ?, ?, ?, 'pending_python_writer', ?)",
    )
    .bind(&task_id)
    .bind(&id)
    .bind(&channel)
    .bind(&sender_id)
    .bind(&input_hash)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    // POST to Python facade target. We forward the same body + headers.
    let upstream = format!(
        "http://127.0.0.1:{}/api/tasks/delegate",
        state.config.python_facade_port
    );
    let body = serde_json::json!({
        "channel": channel,
        "sender_id": sender_id,
        "text": text,
        "company_id": id,
        "expected_output": req.expected_output,
        "via_rust_task_id": task_id,
    });

    let mut req_b = state
        .http_client
        .post(&upstream)
        .header("X-Musu-Via-Rust", "1")
        .header("X-Musu-Task-Id", &task_id);
    // Forward our bearer to Python.
    if !state.config.token.is_empty() {
        req_b = req_b.bearer_auth(&state.config.token);
    }

    match req_b.json(&body).send().await {
        Ok(resp) => {
            tracing::info!(
                task_id = %task_id,
                status = %resp.status(),
                "writer-stub forwarded to python"
            );
        }
        Err(e) => {
            tracing::warn!(
                task_id = %task_id,
                error = %e,
                "writer-stub failed to forward to python; task remains pending"
            );
            // Update row to mark python_unreachable so operator sees it.
            let _ = sqlx::query(
                "UPDATE route_executions SET status = 'python_unreachable' WHERE task_id = ?",
            )
            .bind(&task_id)
            .execute(&state.pool)
            .await;
        }
    }

    // Auditor N-1: real client IP from ConnectInfo.
    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: addr.ip(),
            method: "POST".into(),
            path: format!("/api/companies/{}/run", id),
            status_code: 202,
            agent_id: None,
            note: Some(format!("run via writer-stub task_id={}", task_id)),
            company_id: Some(id.clone()),
        })
        .await;

    Ok((
        StatusCode::ACCEPTED,
        Json(RunResponse {
            company_id: id,
            task: TaskRef {
                task_id,
                status: "queued",
            },
        }),
    ))
}
