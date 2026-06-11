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
    /// Web/control-plane source for this work order, e.g. `musu.pro`.
    #[serde(default)]
    pub origin: Option<String>,
    /// Stable user-visible work order id from MUSU.PRO or another control plane.
    #[serde(default)]
    pub work_order_id: Option<String>,
    /// Project room context. Stored only as bounded audit/context metadata.
    #[serde(default)]
    pub project_id: Option<String>,
    /// Meeting room / collaboration room context.
    #[serde(default)]
    pub room_id: Option<String>,
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
    /// V27: explicit target node for cross-machine routing.
    /// If set, task is forwarded to the named peer instead of local execution.
    #[serde(default)]
    pub target_node: Option<String>,
    /// V27-F4: request GPU routing.
    #[serde(default)]
    pub needs_gpu: bool,
    /// V27-F4: preferred OS.
    #[serde(default)]
    pub prefer_os: Option<String>,
    /// Remote control-plane permission envelope. Accepted for audit/enforcement
    /// wiring; unsupported keys remain advisory until the allowlist lands.
    #[serde(default)]
    pub permission_envelope: Option<serde_json::Value>,
}

fn default_qa_loop_max() -> u32 {
    3
}

/// The adapter a delegated task uses when the caller does not specify one.
///
/// V28 (Agent SDK metering, 2026-06-15): MUSU must NOT spawn headless `claude -p`
/// by default. The default is operator-controlled via `MUSU_DEFAULT_ADAPTER`
/// (e.g. `codex`, `openai_compat_local` for a local Ollama/Gemma endpoint,
/// `echo` for the zero-dependency floor). If unset, we AUTO-DETECT what's
/// actually installed: `codex` (panel load-bearing, official headless) →
/// `claude` (if present) → `echo` (the built-in zero-dep adapter, so a fresh
/// install with NO external CLI still produces a real order→result). This is the
/// "make it actually work" fix: a bare machine never silently requires software
/// it doesn't have. An empty/whitespace env value is treated as unset.
///
/// Shared by every task-spawning entry point (delegate, forward-receive, run)
/// so the guarantee holds across ALL paths.
pub(crate) fn default_adapter_type() -> String {
    default_adapter_from(
        std::env::var("MUSU_DEFAULT_ADAPTER").ok().as_deref(),
        detect_default_adapter,
    )
}

/// Auto-detect the best available default adapter by what's on PATH.
///
/// Auto-detect the best available default by what's on PATH and runnable.
/// codex > claude > echo. ALL of these now execute in the runner hot path
/// (codex/gemini/openai_compat via `run_trait_adapter` → Adapter::execute;
/// claude via its narrow path; echo in-process), so detection can't pick an
/// adapter that fails. codex is first (panel's load-bearing, non-metered,
/// official headless); echo is the always-works zero-dependency floor.
pub(crate) fn detect_default_adapter() -> &'static str {
    if crate::writer::runner::adapter_binary_on_path("codex") {
        "codex"
    } else if crate::writer::runner::adapter_binary_on_path("claude") {
        "claude"
    } else {
        "echo"
    }
}

/// Pure resolution: an explicit env value wins; otherwise the injected detector
/// decides. Split this way so it can be unit-tested WITHOUT touching
/// process-global env (thread-unsafe) or the real filesystem PATH.
fn default_adapter_from(env_value: Option<&str>, detect: impl Fn() -> &'static str) -> String {
    match env_value.map(str::trim).filter(|v| !v.is_empty()) {
        Some(v) => v.to_string(),
        None => detect().to_string(),
    }
}

const AUDIT_FRAGMENT_MAX_CHARS: usize = 160;

fn audit_fragment(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= AUDIT_FRAGMENT_MAX_CHARS {
        return trimmed.to_string();
    }

    let mut out: String = trimmed.chars().take(AUDIT_FRAGMENT_MAX_CHARS).collect();
    out.push_str("...");
    out
}

fn audit_fragment_or_none(value: Option<&str>) -> String {
    value
        .map(audit_fragment)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "none".to_string())
}

fn delegate_task_audit_note(task_id: &str, req: &DelegateRequest) -> String {
    format!(
        "delegate via writer-stub task_id={} origin={} work_order_id={} project_id={} room_id={} target_node={}",
        audit_fragment(task_id),
        audit_fragment_or_none(req.origin.as_deref()),
        audit_fragment_or_none(req.work_order_id.as_deref()),
        audit_fragment_or_none(req.project_id.as_deref()),
        audit_fragment_or_none(req.room_id.as_deref()),
        audit_fragment_or_none(req.target_node.as_deref())
    )
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

    crate::writer::runner::TaskUpdate {
        task_id: &task_id,
        company_id: req.company_id.as_deref(),
        channel: Some(&req.channel),
        sender_id: Some(&req.sender_id),
        prompt: Some(&req.text),
        status: "pending",
        created_at: Some(now),
        ..Default::default()
    }
    .save();

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
    // V27-F4: Build route hints from request fields.
    let hints = crate::bridge::router::RouteHints {
        needs_gpu: req.needs_gpu,
        prefer_os: req.prefer_os.clone(),
        prefer_least_busy: false,
    };
    // V27: Route decision — local or remote?
    let decision = crate::bridge::router::route_task(&state, req.target_node.as_deref(), &hints);
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
                    company_id: req.company_id.clone(),
                    channel: req.channel.clone(),
                    sender_id: req.sender_id.clone(),
                    prompt: req.text.clone(),
                    expected_output: req.expected_output.clone(),
                    cwd,
                    model: req.model.clone(),
                    timeout_sec: req.timeout_sec,
                    adapter_type: req
                        .adapter_type
                        .clone()
                        .unwrap_or_else(default_adapter_type),
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
                channel: req.channel.clone(),
                sender_id: req.sender_id.clone(),
                text: req.text.clone(),
                adapter_type: req.adapter_type.clone(),
                model: req.model.clone(),
                cwd: req.cwd.clone(),
                deadline_unix_ms: None,
                company_id: req.company_id.clone(),
                origin: req.origin.clone(),
                work_order_id: req.work_order_id.clone(),
                project_id: req.project_id.clone(),
                room_id: req.room_id.clone(),
                timeout_sec: req.timeout_sec,
                callback_url: Some(format!(
                    "{}/api/tasks/callback",
                    crate::bridge::services::advertised_bridge_http_url(&state.config),
                )),
                rendezvous_session_id: None,
                rendezvous_target_node_id: None,
            };
            match crate::bridge::handlers::forward::forward_to_peer_with_retry(
                &state, peer, forwarded, 2, // max retries
            )
            .await
            {
                Ok(report) => {
                    crate::bridge::router::record_success(&report.route_peer.addr);
                    let musu_home = state
                        .config
                        .nodes_toml_path
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new("."));
                    match crate::bridge::route_evidence::record_bridge_forward_route_evidence(
                        musu_home,
                        &task_id,
                        &state.config.node_name,
                        &report.route_peer,
                        report.rendezvous_session_id.clone(),
                        report.handshake_ms,
                        report.total_attempt_ms,
                        crate::bridge::route_evidence::RouteAttemptEvidenceResult::Success,
                        None,
                        report.transport_proof.clone(),
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
                    crate::bridge::router::record_failure(&e.route_peer.addr);
                    let musu_home = state
                        .config
                        .nodes_toml_path
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new("."));
                    match crate::bridge::route_evidence::record_bridge_forward_route_evidence(
                        musu_home,
                        &task_id,
                        &state.config.node_name,
                        &e.route_peer,
                        e.rendezvous_session_id.clone(),
                        e.handshake_ms,
                        e.total_attempt_ms,
                        crate::bridge::route_evidence::RouteAttemptEvidenceResult::Failed,
                        Some(e.failure_class.clone()),
                        None,
                        e.relay_fallback.clone(),
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
            path: "/api/tasks/delegate".into(),
            status_code: 202,
            agent_id: None,
            note: Some(delegate_task_audit_note(&task_id, &req)),
            company_id: req.company_id.clone(),
            cross_machine,
        })
        .await;

    let body = Json(DelegateResponse {
        task_id,
        status: "queued",
    });
    Ok((StatusCode::ACCEPTED, body).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delegate_task_audit_note_keeps_work_order_context_without_prompt() {
        let req = DelegateRequest {
            channel: "release-room".to_string(),
            sender_id: "operator".to_string(),
            text: "sensitive prompt body that must not be written to audit".to_string(),
            expected_output: None,
            use_qa_loop: false,
            qa_loop_max_iter: 3,
            timeout_sec: None,
            company_id: Some("company-1".to_string()),
            origin: Some("musu.pro".to_string()),
            work_order_id: Some("wo-20260604-1".to_string()),
            project_id: Some("project-rc1".to_string()),
            room_id: Some("room-release".to_string()),
            allow_duplicate: false,
            model: None,
            cwd: Some("F:/sensitive/workspace".to_string()),
            adapter_type: None,
            target_node: Some("local".to_string()),
            needs_gpu: false,
            prefer_os: None,
            permission_envelope: None,
        };

        let note = delegate_task_audit_note("task-1", &req);

        assert!(note.contains("task_id=task-1"));
        assert!(note.contains("origin=musu.pro"));
        assert!(note.contains("work_order_id=wo-20260604-1"));
        assert!(note.contains("project_id=project-rc1"));
        assert!(note.contains("room_id=room-release"));
        assert!(note.contains("target_node=local"));
        assert!(note.len() < 512);
        assert!(!note.contains("sensitive prompt"));
        assert!(!note.contains("F:/sensitive/workspace"));
    }

    /// V28: an explicit MUSU_DEFAULT_ADAPTER wins; otherwise the injected
    /// detector decides (real one is codex>claude>echo). Tested on the PURE
    /// resolver with a stub detector so we never touch process-global env
    /// (thread-unsafe) or the real PATH.
    #[test]
    fn default_adapter_env_wins_else_detector() {
        let detect_echo = || "echo";
        // explicit env value wins, trimmed
        assert_eq!(default_adapter_from(Some("codex"), detect_echo), "codex");
        assert_eq!(
            default_adapter_from(Some("  openai_compat_local  "), detect_echo),
            "openai_compat_local"
        );
        // blank/absent → detector
        assert_eq!(default_adapter_from(Some("   "), detect_echo), "echo");
        assert_eq!(default_adapter_from(Some(""), detect_echo), "echo");
        assert_eq!(default_adapter_from(None, detect_echo), "echo");
        // a different detector result flows through
        assert_eq!(default_adapter_from(None, || "claude"), "claude");
    }
}

/// GET /api/tasks/:task_id — get task status and result.
pub async fn get_task(
    State(state): State<AppState>,
    axum::extract::Path(task_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query(
        "SELECT task_id, status, output, error, exit_code, duration_sec, created_at, updated_at \
         FROM route_executions WHERE task_id = ?",
    )
    .bind(&task_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(MusuError::Sqlx)?;

    match row {
        Some(row) => {
            use sqlx::Row;
            Ok(Json(serde_json::json!({
                "task_id": row.try_get::<String, _>("task_id").unwrap_or_default(),
                "status": row.try_get::<String, _>("status").unwrap_or_default(),
                "output": row.try_get::<Option<String>, _>("output").unwrap_or(None),
                "error": row.try_get::<Option<String>, _>("error").unwrap_or(None),
                "exit_code": row.try_get::<Option<i32>, _>("exit_code").unwrap_or(None),
                "duration_sec": row.try_get::<Option<f64>, _>("duration_sec").unwrap_or(None),
            })))
        }
        None => Err(MusuError::NotFound(format!("task {} not found", task_id))),
    }
}
