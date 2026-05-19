//! POST /api/tasks/delegate — writer-stub + dedup per wiki/491 §5.6.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

#[derive(Debug, Deserialize)]
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
    Json(req): Json<DelegateRequest>,
) -> Result<axum::response::Response> {
    // Validation: text 1..10000 chars.
    if req.text.is_empty() || req.text.len() > 10_000 {
        return Err(MusuError::BadRequest(
            "text must be 1..10000 chars".into(),
        ));
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

    // Write pending row.
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO route_executions (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
         VALUES (?, ?, ?, ?, ?, 'pending_python_writer', ?)",
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

    // Forward to Python facade target.
    let upstream = format!(
        "http://127.0.0.1:{}/api/tasks/delegate",
        state.config.python_facade_port
    );
    let body = serde_json::json!({
        "channel": req.channel,
        "sender_id": req.sender_id,
        "text": req.text,
        "expected_output": req.expected_output,
        "use_qa_loop": req.use_qa_loop,
        "qa_loop_max_iter": req.qa_loop_max_iter,
        "timeout_sec": req.timeout_sec,
        "company_id": req.company_id,
        "allow_duplicate": req.allow_duplicate,
        "via_rust_task_id": task_id,
    });

    let mut req_b = state
        .http_client
        .post(&upstream)
        .header("X-Musu-Via-Rust", "1")
        .header("X-Musu-Task-Id", &task_id);
    if !state.config.token.is_empty() {
        req_b = req_b.bearer_auth(&state.config.token);
    }

    match req_b.json(&body).send().await {
        Ok(resp) => {
            tracing::info!(
                task_id = %task_id,
                status = %resp.status(),
                "tasks/delegate forwarded to python"
            );
        }
        Err(e) => {
            tracing::warn!(
                task_id = %task_id,
                error = %e,
                "tasks/delegate forward to python failed"
            );
            let _ = sqlx::query(
                "UPDATE route_executions SET status = 'python_unreachable' WHERE task_id = ?",
            )
            .bind(&task_id)
            .execute(&state.pool)
            .await;
        }
    }

    state
        .audit
        .write(crate::bridge::audit::AuditEntry {
            actor_ip: std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
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
