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
    /// V27: explicit target node for cross-machine routing.
    #[serde(default)]
    pub target_node: Option<String>,
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

    crate::writer::runner::TaskUpdate {
        task_id: &task_id,
        company_id: Some(&id),
        channel: Some(&channel),
        sender_id: Some(&sender_id),
        prompt: Some(&text),
        status: "pending",
        created_at: Some(now),
        ..Default::default()
    }
    .save();

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
    // V27: Route decision — local or remote?
    let decision = crate::bridge::router::route_task(
        &state,
        req.target_node.as_deref(),
        &crate::bridge::router::RouteHints::default(),
    );
    let cross_machine = matches!(
        decision,
        crate::bridge::router::RouteDecision::Remote { .. }
    );

    match decision {
        crate::bridge::router::RouteDecision::Local => {
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
                    adapter_type: req.adapter_type.clone().unwrap_or_else(|| "claude".into()),
                    callback_url: None,
                    source_task_id: None,
                })
                .await
                .map_err(|e| MusuError::Internal(format!("spawn_task: {e}")))?;
        }
        crate::bridge::router::RouteDecision::Remote { ref peer } => {
            let forwarded = crate::bridge::handlers::forward::ForwardedTask {
                source_node: state.config.node_name.clone(),
                source_task_id: task_id.clone(),
                channel: channel.clone(),
                sender_id: sender_id.clone(),
                text: text.clone(),
                adapter_type: req.adapter_type.clone(),
                model: req.model.clone(),
                cwd: req.cwd.clone(),
                deadline_unix_ms: None,
                company_id: Some(id.clone()),
                timeout_sec: req.timeout_sec,
                callback_url: Some(format!(
                    "{}/api/tasks/callback",
                    crate::bridge::services::advertised_bridge_http_url(&state.config),
                )),
            };
            match crate::bridge::handlers::forward::forward_to_peer_with_retry(
                &state.http_client,
                peer,
                forwarded,
                &state.config.token,
                2, // max retries
            )
            .await
            {
                Ok(report) => {
                    crate::bridge::router::record_success(&peer.addr);
                    let musu_home = state
                        .config
                        .nodes_toml_path
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new("."));
                    match crate::bridge::route_evidence::record_bridge_forward_route_evidence(
                        musu_home,
                        &task_id,
                        &state.config.node_name,
                        peer,
                        report.handshake_ms,
                        report.total_attempt_ms,
                        crate::bridge::route_evidence::RouteAttemptEvidenceResult::Success,
                        None,
                    ) {
                        Ok(record) => {
                            tracing::info!(
                                task_id = %task_id,
                                remote_task_id = %report.response.task_id,
                                remote_node = %report.response.node,
                                path = %record.path.display(),
                                "bridge route evidence written"
                            );
                            crate::bridge::route_evidence::spawn_recorded_route_evidence_submit_if_configured(
                                musu_home.to_path_buf(),
                                record,
                                "bridge",
                                task_id.clone(),
                            );
                        }
                        Err(err) => tracing::warn!(
                            task_id = %task_id,
                            err = %err,
                            "failed to write bridge route evidence"
                        ),
                    }
                }
                Err(e) => {
                    crate::bridge::router::record_failure(&peer.addr);
                    let musu_home = state
                        .config
                        .nodes_toml_path
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new("."));
                    match crate::bridge::route_evidence::record_bridge_forward_route_evidence(
                        musu_home,
                        &task_id,
                        &state.config.node_name,
                        peer,
                        e.handshake_ms,
                        e.total_attempt_ms,
                        crate::bridge::route_evidence::RouteAttemptEvidenceResult::Failed,
                        Some(e.failure_class.clone()),
                    ) {
                        Ok(record) => {
                            tracing::info!(
                                task_id = %task_id,
                                path = %record.path.display(),
                                "bridge route evidence written"
                            );
                            crate::bridge::route_evidence::spawn_recorded_route_evidence_submit_if_configured(
                                musu_home.to_path_buf(),
                                record,
                                "bridge",
                                task_id.clone(),
                            );
                        }
                        Err(err) => tracing::warn!(
                            task_id = %task_id,
                            err = %err,
                            "failed to write bridge route evidence"
                        ),
                    }
                    return Err(MusuError::Internal(format!(
                        "forward_to_peer: {}",
                        e.message
                    )));
                }
            }
        }
    }

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
            cross_machine,
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
