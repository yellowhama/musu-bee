//! POST /api/companies/{id}/run — wiki/491 §5.5 (A-1) + wiki/495 §3.2.
//!
//! R1 inserted a route_execution row and POSTed to Python on :8071.
//! R5 (wiki/495) replaces the Python forward with native Rust runner
//! spawn-then-track: row goes `pending → running → done|failed|cancelled`
//! driven by `writer::runner::TaskRunner`.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // `passthrough` flattens unknown fields the caller may pass.
pub struct RunRequest {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub sender_id: Option<String>,
    #[serde(default)]
    pub expected_output: Option<String>,
    // R5 (wiki/495 §3.3 / Critic C2): additive opt-in adapter knobs.
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub timeout_sec: Option<u32>,
    #[serde(default)]
    pub cwd: Option<String>,
    /// V26-W1 Commit 3 (wiki/509 §9.2). Adapter discriminator. `None` →
    /// canonical default `"claude"` (Critic MEDIUM-1: handler-side default
    /// is THE canonical place). V24-R5 clients unchanged.
    #[serde(default)]
    pub adapter_type: Option<String>,
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

    // EDIT-A (wiki/495 §3.2 / Critic C1): explicit 'pending' literal matches
    // schema v1 DEFAULT but is legible at the call site.
    sqlx::query(
        "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
         VALUES (?, ?, ?, ?, ?, 'pending', ?)",
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

    // EDIT-B (wiki/495 §3.2): hand off to native runner. spawn_task returns
    // immediately (Q1 spawn-then-track). Runner owns JoinHandle + all status
    // updates. POST returns 202 with the task_id; subsequent state changes
    // flow via /api/tasks/events SSE.
    let cwd = req
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
        });
    state
        .task_runner
        .spawn_task(crate::writer::TaskSpec {
            task_id: task_id.clone(),
            company_id: Some(id.clone()),
            channel: channel.clone(),
            sender_id: sender_id.clone(),
            prompt: text.clone(),
            expected_output: req.expected_output.clone(),
            cwd,
            model: req.model.clone(),
            timeout_sec: req.timeout_sec,
            // V26-W1 Commit 3 (wiki/509 §9.2): handler-side canonical
            // default. V24-R5 clients omit the field → "claude".
            adapter_type: req
                .adapter_type
                .clone()
                .unwrap_or_else(|| "claude".into()),
        })
        .await
        .map_err(|e| MusuError::Internal(format!("spawn_task: {e}")))?;

    // EDIT-C (wiki/495 §3.2): audit_log write — PRESERVED unchanged from N-1
    // Auditor fix. DO NOT fold into EDIT-B.
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
