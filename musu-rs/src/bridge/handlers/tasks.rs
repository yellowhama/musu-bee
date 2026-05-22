//! POST /api/tasks/delegate — writer-stub + dedup per wiki/491 §5.6.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // qa_loop fields accepted for future R7+ qa-loop wiring; runner ignores today.
pub struct DelegateRequest {
    pub channel: String,
    pub sender_id: String,
    pub text: String,
    #[serde(default)]
    pub expected_output: Option<String>,
    #[serde(default)]
    pub use_qa_loop: bool,
    #[serde(default = "default_qa_loop_max")]
    pub qa_loop_max_iter: u32,
    #[serde(default)]
    pub timeout_sec: Option<u32>,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub allow_duplicate: bool,
    // R5 (wiki/495 §3.3 / Critic C2): adapter knob parity with Python.
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    /// V26-W1 Commit 3 (wiki/509 §9.1). Adapter discriminator. `None` →
    /// canonical default `"claude"` (Critic MEDIUM-1: this handler is THE
    /// canonical default; no `default_adapter_type()` helper). V24-R5
    /// clients omitting the field get V24-R5 behavior unchanged.
    #[serde(default)]
    pub adapter_type: Option<String>,
}

fn default_qa_loop_max() -> u32 {
    3
}

#[derive(Debug, Serialize)]
pub struct DelegateResponse {
    pub task_id: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
pub struct DuplicateResponse {
    pub error: &'static str,
    pub code: &'static str,
    pub existing_task_id: String,
}

pub async fn delegate(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<DelegateRequest>,
) -> Result<axum::response::Response> {
    // Validation: text 1..10000 chars.
    if req.text.is_empty() || req.text.len() > 10_000 {
        return Err(MusuError::BadRequest("text must be 1..10000 chars".into()));
    }
    if req.channel.is_empty() {
        return Err(MusuError::BadRequest("channel required".into()));
    }
    if req.sender_id.is_empty() {
        return Err(MusuError::BadRequest("sender_id required".into()));
    }

    if !crate::bridge::db::schema_applied(&state.pool).await {
        return Err(MusuError::Internal(
            "schema not applied — apply R2 migrations first".into(),
        ));
    }

    let key = crate::bridge::dedup::DedupCache::key(&req.channel, &req.sender_id, &req.text);
    let task_id = uuid::Uuid::new_v4().to_string();

    // Dedup check.
    if !req.allow_duplicate {
        if let Some(existing) = state.dedup.check_and_insert(&key, &task_id) {
            tracing::info!(
                existing_task_id = %existing,
                "dedup cache hit; returning 409"
            );
            let body = Json(DuplicateResponse {
                error: "duplicate",
                code: "duplicate",
                existing_task_id: existing,
            });
            return Ok((StatusCode::CONFLICT, body).into_response());
        }
    } else {
        // Insert into cache anyway so subsequent duplicates dedup against
        // the new task_id.
        let _ = state.dedup.check_and_insert(&key, &task_id);
    }

    // EDIT-A (wiki/495 §3.2 / Critic C1): explicit 'pending' literal matches
    // schema v1 DEFAULT but is legible at the call site.
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
         VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(&task_id)
    .bind(&req.company_id)
    .bind(&req.channel)
    .bind(&req.sender_id)
    .bind(&key)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    // EDIT-B (wiki/495 §3.2): hand off to native runner. spawn_task returns
    // immediately (Q1 spawn-then-track). Runner owns JoinHandle + all status
    // updates. SSE delivers state transitions to subscribers.
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
            company_id: req.company_id.clone(),
            channel: req.channel.clone(),
            sender_id: req.sender_id.clone(),
            prompt: req.text.clone(),
            expected_output: req.expected_output.clone(),
            cwd,
            model: req.model.clone(),
            timeout_sec: req.timeout_sec,
            // V26-W1 Commit 3 (wiki/509 §9.1): handler-side canonical
            // default. V24-R5 clients omit the field entirely → "claude".
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
            path: "/api/tasks/delegate".into(),
            status_code: 202,
            agent_id: None,
            note: Some(format!("delegate via writer-stub task_id={}", task_id)),
            company_id: req.company_id.clone(),
        })
        .await;

    let body = Json(DelegateResponse {
        task_id,
        status: "queued",
    });
    Ok((StatusCode::ACCEPTED, body).into_response())
}
