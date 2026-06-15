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
    // Prefer the env var; fall back to the persisted bridge.env value when the
    // env is unset. Removing the live std::env::set_var (env-race fix) means the
    // persisted default would otherwise never reach the running bridge — the
    // bridge boots in-process via `musu startup` with no dotenv hydration. Read
    // the file the same way ensure_bridge_token does (token.rs).
    let env_value = std::env::var("MUSU_DEFAULT_ADAPTER")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(persisted_default_adapter);
    default_adapter_from(env_value.as_deref(), detect_default_adapter)
}

/// Read `MUSU_DEFAULT_ADAPTER` from `<home>/bridge.env` (the persisted default
/// set by set_default_adapter). Line-based parse, mirroring token.rs.
fn persisted_default_adapter() -> Option<String> {
    let home = crate::install::resolve_musu_home_from_env().ok()?;
    let body = std::fs::read_to_string(home.join("bridge.env")).ok()?;
    for line in body.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("MUSU_DEFAULT_ADAPTER=") {
            let val = rest.trim().trim_matches('"').trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
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
        // Read-side allow-list guard: a configured default that is NOT
        // defaultable (e.g. MUSU_DEFAULT_ADAPTER=shell written by pre-fix code,
        // a hand-edited bridge.env, or an inherited OS env var) must NOT silently
        // become the fleet default — that is the forwarded-task RCE. Drop it to
        // the safe auto-detected default and warn. The write endpoint already
        // rejects these, but the resolver must not trust the value's provenance.
        Some(v) if !crate::adapter::is_defaultable_adapter(v) => {
            tracing::warn!(
                rejected_default = %v,
                "ignoring non-defaultable MUSU_DEFAULT_ADAPTER; using auto-detected default (shell/exec adapters are dispatchable only per-task)"
            );
            detect().to_string()
        }
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
                    callback_token: None,
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

    #[test]
    fn default_adapter_drops_non_defaultable_shell_on_read() {
        let detect_echo = || "echo";
        // A configured `shell` default (e.g. legacy bridge.env, hand-edit, or an
        // inherited OS env var) must NOT become the fleet default — it is dropped
        // to the safe auto-detected value, closing the forwarded-task RCE on the
        // read side regardless of how the value got there.
        assert_eq!(default_adapter_from(Some("shell"), detect_echo), "echo");
        assert_eq!(default_adapter_from(Some("  shell  "), detect_echo), "echo");
        assert_eq!(default_adapter_from(Some("shell"), || "codex"), "codex");
        // an unknown/garbage adapter is likewise not trusted as the default
        assert_eq!(default_adapter_from(Some("rm-rf"), detect_echo), "echo");
        // defaultable values still flow through unchanged
        assert_eq!(default_adapter_from(Some("codex"), detect_echo), "codex");
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
            let musu_home = state
                .config
                .nodes_toml_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."));
            let route_proof = crate::bridge::route_evidence::task_route_proof(musu_home, &task_id);
            Ok(Json(serde_json::json!({
                "task_id": row.try_get::<String, _>("task_id").unwrap_or_default(),
                "status": row.try_get::<String, _>("status").unwrap_or_default(),
                "output": row.try_get::<Option<String>, _>("output").unwrap_or(None),
                "error": row.try_get::<Option<String>, _>("error").unwrap_or(None),
                "exit_code": row.try_get::<Option<i32>, _>("exit_code").unwrap_or(None),
                "duration_sec": row.try_get::<Option<f64>, _>("duration_sec").unwrap_or(None),
                "route_proof": route_proof,
            })))
        }
        None => Err(MusuError::NotFound(format!("task {} not found", task_id))),
    }
}

#[cfg(test)]
mod get_task_tests {
    use super::*;
    use axum::extract::{Path, State};
    use std::sync::Arc;
    use tempfile::TempDir;

    async fn test_state(pool: sqlx::SqlitePool, musu_home: &std::path::Path) -> AppState {
        let cfg = Arc::new(crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 0,
            python_facade_port: 0,
            public_url: None,
            node_name: "test-node".to_string(),
            db_path: musu_home.join("db").join("musu.db"),
            audit_db_path: musu_home.join("data").join("audit.db"),
            nodes_toml_path: musu_home.join("nodes.toml"),
            token: String::new(),
            peer_token: None,
            localhost_auth_required: false,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        });
        let sse_broadcaster = crate::writer::SseBroadcaster::from_env();
        let task_runner =
            crate::writer::TaskRunnerHandle::new(pool.clone(), sse_broadcaster.clone()).await;
        AppState {
            config: cfg,
            pool: pool.clone(),
            http_client: reqwest::Client::new(),
            audit: crate::bridge::audit::AuditState::new(pool),
            dedup: crate::bridge::dedup::DedupCache::new(),
            task_runner,
            sse_broadcaster,
            pairing: crate::bridge::handlers::pair::PairingStore::new(),
        }
    }

    #[tokio::test]
    async fn get_task_returns_terminal_output_and_error_fields() {
        let tmp = TempDir::new().unwrap();
        let musu_home = tmp.path().join(".musu");
        std::fs::create_dir_all(&musu_home).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE route_executions (
                task_id TEXT PRIMARY KEY,
                company_id TEXT,
                channel TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                input_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                output TEXT,
                error TEXT,
                exit_code INTEGER,
                duration_sec REAL,
                started_at INTEGER,
                updated_at INTEGER
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO route_executions (
                task_id, company_id, channel, sender_id, input_hash, status,
                created_at, output, error, exit_code, duration_sec, updated_at
            ) VALUES (?, NULL, 'cto', 'user', 'hash', 'done', 10, ?, NULL, 0, 1.25, 12)",
        )
        .bind("task-1")
        .bind("agent output")
        .execute(&pool)
        .await
        .unwrap();

        let state = test_state(pool, &musu_home).await;
        let Json(body) = get_task(State(state), Path("task-1".to_string()))
            .await
            .unwrap();

        assert_eq!(body["task_id"], "task-1");
        assert_eq!(body["status"], "done");
        assert_eq!(body["output"], "agent output");
        assert_eq!(body["error"], serde_json::Value::Null);
        assert_eq!(body["exit_code"], 0);
        assert_eq!(body["duration_sec"], 1.25);
    }
}
