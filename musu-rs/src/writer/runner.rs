//! TaskRunner — wiki/495 §3 runner.rs.
//!
//! Owns: claude subprocess lifecycle, state-machine transitions, concurrency
//! caps, JoinHandle registry, boot-orphan recovery.
//!
//! State machine: `pending → running → done | failed | cancelled`.
//!
//! Concurrency model (Q2 lock):
//!   - global cap: MAX_GLOBAL (default 4, override via MUSU_TASK_MAX_GLOBAL)
//!   - per-channel cap: MAX_PER_CHANNEL (default 1, override via MUSU_TASK_MAX_PER_CHANNEL)
//!   - Admission accounting via tokio::Mutex<AdmissionState> held briefly,
//!     never across `.await` on the claude subprocess.
//!
//! Registry: `Arc<DashMap<task_id, TaskHandle>>` (Critic C8). Each spawned
//! task removes its own entry from the registry as the last step before
//! exit so handles never leak (§6 acceptance #join_handles_never_leak).
//!
//! Boot-orphan recovery (§3.4 / Critic C4): on construction we issue a
//! single UPDATE that flips any `pending`/`running` rows from a prior
//! bridge crash to `failed` with `error='orphaned by bridge restart'`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use sqlx::SqlitePool;
use tokio::sync::{broadcast, Mutex, Notify};
use tokio::task::JoinHandle;

use crate::writer::claude::{self, ClaudeEvent, SpawnSpec};
use crate::writer::sse::{SseBroadcaster, TaskEvent};

/// Default ceilings; overridden via env at construction.
pub const DEFAULT_MAX_GLOBAL: u32 = 4;
pub const DEFAULT_MAX_PER_CHANNEL: u32 = 1;

/// Fallback admission recheck when a notify wake is missed.
///
/// Normal admission wakeups are event-driven via `Inner::admission_notify`.
/// This timeout is only a safety net, not the primary scheduling mechanism.
const ADMISSION_RECHECK_INTERVAL: Duration = Duration::from_secs(1);

/// Default cancel grace period before TerminateProcess on Windows /
/// SIGKILL elsewhere.
const CANCEL_GRACE: Duration = Duration::from_secs(5);

/// Task lifecycle status (mirrors `route_executions.status`).
///
/// `Pending`/`Running` are produced as DB string literals via INSERT/UPDATE
/// statements; the runner finalizes only with terminal variants but keeps
/// the full enum for completeness + future read paths (e.g. SSE rehydrate).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum TaskStatus {
    Pending,
    Running,
    Done,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::Running => "running",
            TaskStatus::Done => "done",
            TaskStatus::Failed => "failed",
            TaskStatus::Cancelled => "cancelled",
        }
    }
}

/// Caller-facing spec for `TaskRunnerHandle::spawn_task`.
///
/// `sender_id` + `expected_output` aren't consumed by the runner today but
/// flow through from the bridge handlers so they're available for future
/// per-sender metrics / qa-loop tooling (Critic notes plan parity vs Python).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TaskSpec {
    pub task_id: String,
    pub company_id: Option<String>,
    pub channel: String,
    pub sender_id: String,
    pub prompt: String,
    pub expected_output: Option<String>,
    pub cwd: PathBuf,
    pub model: Option<String>,
    pub timeout_sec: Option<u32>,
    /// V26-W1 Commit 3 (wiki/509). Adapter discriminator. Canonical default
    /// = `"claude"` applied at the HTTP handler boundary via
    /// `req.adapter_type.unwrap_or_else(|| "claude".into())`
    /// (`bridge/handlers/{tasks,run}.rs`). Inside the runner this field is a
    /// required `String`, never `None`. Per Critic MEDIUM-1, there is no
    /// `default_adapter_type()` helper — the canonical default lives at the
    /// handler boundary only.
    pub adapter_type: String,
    /// V27-F1: callback URL for forwarded tasks. When set, the runner POSTs
    /// the result to this URL after finalization.
    pub callback_url: Option<String>,
    /// V27-F1: original task ID on the requesting node.
    pub source_task_id: Option<String>,
    /// Shared mesh bearer token used to authenticate the result callback POST
    /// back to the originating node. Without it the source node's
    /// `/api/tasks/callback` rejects the result and the original task row stays
    /// `pending` forever — the cross-machine result never reaches the cockpit.
    pub callback_token: Option<String>,
}

/// Registry entry. Holds the cancel notifier so DELETE handler can signal.
/// `join` + `channel` are stored for future shutdown-flush and per-channel
/// listing endpoints.
#[allow(dead_code)]
pub struct TaskHandle {
    pub cancel: Arc<Notify>,
    pub join: JoinHandle<()>,
    pub channel: String,
}

/// Concurrency-cap accounting. Held under `tokio::sync::Mutex`.
#[derive(Debug, Default)]
struct AdmissionState {
    global_running: u32,
    per_channel_running: HashMap<String, u32>,
}

/// Shared handle held by AppState + cloned into spawn closures.
#[derive(Clone)]
pub struct TaskRunnerHandle {
    inner: Arc<Inner>,
}

struct Inner {
    pool: SqlitePool,
    registry: Arc<DashMap<String, TaskHandle>>,
    admission: Arc<Mutex<AdmissionState>>,
    admission_notify: Arc<Notify>,
    max_global: u32,
    max_per_channel: u32,
    sse: SseBroadcaster,
    claude_command: String,
}

fn resolve_claude_command() -> String {
    if let Ok(value) = std::env::var("MUSU_CLAUDE_BINARY") {
        if !value.trim().is_empty() {
            return value;
        }
    }
    default_claude_command()
}

#[cfg(windows)]
fn default_claude_command() -> String {
    find_on_path("claude.cmd")
        .or_else(|| find_on_path("claude.exe"))
        .or_else(|| find_on_path("claude.bat"))
        .unwrap_or_else(|| "claude".into())
}

#[cfg(not(windows))]
fn default_claude_command() -> String {
    "claude".into()
}

fn callback_node_name() -> String {
    std::env::var("MUSU_NODE_NAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            hostname::get()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
}

#[cfg(windows)]
fn find_on_path(file_name: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(file_name);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Default wall-clock task timeout (V28 H2) when a caller omits `timeout_sec`.
/// 300s, overridable via `MUSU_TASK_DEFAULT_TIMEOUT_SEC`. Prevents a hung adapter
/// from leaving a task "running" forever.
fn default_task_timeout() -> Duration {
    let secs = std::env::var("MUSU_TASK_DEFAULT_TIMEOUT_SEC")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|s| *s > 0)
        .unwrap_or(300);
    Duration::from_secs(secs)
}

/// Platform executable-name candidates for an agent CLI `stem`. On Windows an
/// npm-installed CLI like `codex` ships as `codex` (bash shim, NOT directly
/// runnable by CreateProcess) PLUS `codex.cmd` (the real Windows entry). So we
/// must resolve to the `.cmd`/`.exe`/`.bat` form, not the bare name.
#[cfg(windows)]
fn agent_binary_candidates(stem: &str) -> Vec<String> {
    vec![
        format!("{stem}.cmd"),
        format!("{stem}.exe"),
        format!("{stem}.bat"),
        stem.to_string(),
    ]
}
#[cfg(not(windows))]
fn agent_binary_candidates(stem: &str) -> Vec<String> {
    vec![stem.to_string()]
}

/// V28 — is an agent CLI (`codex`, `claude`, …) installed on PATH? Used by
/// `bridge::handlers::tasks::detect_default_adapter`.
pub(crate) fn adapter_binary_on_path(stem: &str) -> bool {
    agent_binary_candidates(stem)
        .iter()
        .any(|n| find_on_path(n).is_some())
}

/// V28 — resolve an agent CLI `stem` to a directly-runnable path on this
/// platform (`codex` → `…/codex.cmd` on Windows), or the bare stem if not found
/// (so the caller still gets a sensible spawn target / NotFound error). Fixes
/// codex/gemini "model unavailable" on Windows where the bare `codex` shim is
/// not CreateProcess-runnable. Used by the codex/gemini adapters.
pub fn resolve_agent_binary(stem: &str) -> String {
    for name in agent_binary_candidates(stem) {
        if let Some(path) = find_on_path(&name) {
            return path;
        }
    }
    stem.to_string()
}

impl TaskRunnerHandle {
    /// Construct + run boot-orphan recovery (Critic C4).
    pub async fn new(pool: SqlitePool, sse: SseBroadcaster) -> Self {
        let max_global = std::env::var("MUSU_TASK_MAX_GLOBAL")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_MAX_GLOBAL);
        let max_per_channel = std::env::var("MUSU_TASK_MAX_PER_CHANNEL")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_MAX_PER_CHANNEL);
        let claude_command = resolve_claude_command();

        let inner = Inner {
            pool,
            registry: Arc::new(DashMap::new()),
            admission: Arc::new(Mutex::new(AdmissionState::default())),
            admission_notify: Arc::new(Notify::new()),
            max_global,
            max_per_channel,
            sse,
            claude_command,
        };

        let handle = Self {
            inner: Arc::new(inner),
        };
        handle.recover_orphans().await;
        handle
    }

    /// Boot-time orphan-pending recovery (Critic C4).
    async fn recover_orphans(&self) {
        let now = chrono::Utc::now().timestamp();
        let r = sqlx::query(
            "UPDATE route_executions
                SET status = 'failed',
                    error = 'orphaned by bridge restart',
                    updated_at = ?
              WHERE status IN ('pending', 'running')",
        )
        .bind(now)
        .execute(&self.inner.pool)
        .await;
        match r {
            Ok(res) => {
                if res.rows_affected() > 0 {
                    tracing::warn!(
                        rows = res.rows_affected(),
                        "recovered orphaned pending/running rows from prior bridge crash"
                    );
                }
            }
            Err(e) => tracing::warn!(error = %e, "orphan recovery query failed (non-fatal)"),
        }
    }

    /// Test/debug accessor: number of live entries.
    #[allow(dead_code)] // used by tests + future /api/tasks/live endpoint.
    pub fn registry_len(&self) -> usize {
        self.inner.registry.len()
    }

    /// Cancel signal for a specific task. Returns true if found+signalled.
    pub fn cancel(&self, task_id: &str) -> bool {
        if let Some(entry) = self.inner.registry.get(task_id) {
            entry.cancel.notify_waiters();
            true
        } else {
            false
        }
    }

    /// Spawn a task. Returns immediately (Q1 spawn-then-track) once the
    /// background task is launched. The background task handles admission,
    /// spawning, streaming, and final reconciliation.
    pub async fn spawn_task(&self, spec: TaskSpec) -> anyhow::Result<()> {
        let cancel = Arc::new(Notify::new());
        let cancel_for_task = cancel.clone();
        let inner = self.inner.clone();
        let channel_for_handle = spec.channel.clone();
        let task_id = spec.task_id.clone();

        let join = tokio::spawn(async move {
            run_one(inner.clone(), spec, cancel_for_task).await;
        });

        self.inner.registry.insert(
            task_id,
            TaskHandle {
                cancel,
                join,
                channel: channel_for_handle,
            },
        );
        Ok(())
    }
}

/// V27-F1: fire callback to the originating node after task finalization.
fn fire_callback(
    spec: &TaskSpec,
    status: TaskStatus,
    output: Option<&str>,
    error: Option<&str>,
    exit_code: Option<i32>,
    duration_sec: Option<f64>,
) {
    let url = match spec.callback_url {
        Some(ref u) => u.clone(),
        None => return,
    };
    let token = spec.callback_token.clone();
    let cb = crate::bridge::handlers::forward::TaskCallback {
        source_task_id: spec
            .source_task_id
            .clone()
            .unwrap_or_else(|| spec.task_id.clone()),
        remote_task_id: spec.task_id.clone(),
        status: status.as_str().to_string(),
        output: output.map(|s| s.to_string()),
        error: error.map(|s| s.to_string()),
        exit_code,
        duration_sec,
        node: callback_node_name(),
    };
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        for attempt in 0..3u32 {
            let mut builder = client
                .post(&url)
                .json(&cb)
                .timeout(std::time::Duration::from_secs(10));
            // Authenticate the callback with the shared mesh token; the source
            // node's /api/tasks/callback is auth-gated and rejects it otherwise.
            if let Some(ref t) = token {
                builder = builder.bearer_auth(t);
            }
            match builder.send().await {
                Ok(resp) if resp.status().is_success() => {
                    tracing::info!(url = %url, attempt, "callback delivered");
                    return;
                }
                Ok(resp) => {
                    tracing::warn!(url = %url, status = %resp.status(), attempt, "callback rejected");
                }
                Err(e) => {
                    tracing::warn!(url = %url, err = %e, attempt, "callback failed");
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(1 << attempt)).await;
        }
        tracing::error!(url = %url, "callback failed after 3 attempts");
    });
}

/// Drive one task end-to-end. This runs inside `tokio::spawn`.
async fn run_one(inner: Arc<Inner>, mut spec: TaskSpec, cancel: Arc<Notify>) {
    let task_id = spec.task_id.clone();
    let channel = spec.channel.clone();

    // Make sure we always remove ourselves from the registry on exit.
    let registry_guard = RegistryGuard {
        registry: inner.registry.clone(),
        task_id: task_id.clone(),
    };

    // Admission: wait for global + per-channel slot.
    if let Err(e) = wait_for_admission(&inner, &channel, &cancel).await {
        match e {
            AdmissionExit::Cancelled => {
                finalize(&inner, &spec, TaskStatus::Cancelled, None, None, None, None).await;
                let _ = registry_guard;
                return;
            }
        }
    }

    // Mark running.
    let started_at = chrono::Utc::now().timestamp();
    update_status_started(&inner.pool, &task_id, started_at).await;
    inner
        .sse
        .publish(TaskEvent::update(&task_id, "running").with_context(
            spec.company_id.as_deref(),
            Some(&spec.channel),
            Some(&spec.sender_id),
        ));

    // --- AUTONOMOUS PRE-FETCHING ---
    // Seamlessly query the Semantic SSOT and inject knowledge into the prompt
    if let Ok(musu_crawl_exe) = std::env::var("MUSU_CRAWL_BINARY") {
        tracing::info!(task_id = %task_id, "Running autonomous pre-fetch using musu-crawl");
        let out = std::process::Command::new(&musu_crawl_exe)
            .arg("search")
            .arg(&spec.prompt)
            .arg("--limit")
            .arg("3")
            .output();
        if let Ok(output) = out {
            if output.status.success() {
                let crawler_results = String::from_utf8_lossy(&output.stdout);
                if !crawler_results.trim().is_empty() {
                    spec.prompt = format!(
                        "<BACKGROUND_CONTEXT>\n{}\n</BACKGROUND_CONTEXT>\n\n{}",
                        crawler_results.trim(),
                        spec.prompt
                    );
                }
            } else {
                tracing::warn!(task_id = %task_id, "Autonomous pre-fetch crawler failed with status: {}", output.status);
            }
        } else {
            tracing::warn!(task_id = %task_id, "Autonomous pre-fetch failed to spawn musu-crawl");
        }
    }

    let start = Instant::now();

    // V28 "make it actually work": in-process adapters that need NO subprocess
    // (echo today; mock/shell can join) finalize immediately without entering
    // the spawn → stream loop. This gives a fresh single-machine install a
    // working order→result path with ZERO external CLI (no claude, no Ollama).
    // Must run BEFORE claude_dispatch_spawn so `adapter_type="echo"` never tries
    // to spawn a binary. Returns Some(result) when it handled the task.
    if let Some((output, ok)) = run_inprocess_adapter(&spec) {
        let duration = start.elapsed().as_secs_f64();
        release_admission(&inner, &channel).await;
        finalize(
            &inner,
            &spec,
            if ok {
                TaskStatus::Done
            } else {
                TaskStatus::Failed
            },
            if ok { None } else { Some(output.as_str()) },
            if ok { Some(output.as_str()) } else { None },
            Some(0),
            Some(duration),
        )
        .await;
        return;
    }

    // V28 C3 fix: codex / gemini / openai_compat_* run via the trait surface
    // (`registry::dispatch` → `Adapter::execute`), which self-contains spawn +
    // stream + finalize and returns an AdapterResult. Previously the runner hot
    // path executed ONLY "claude", so auto-detecting/selecting codex failed with
    // "not yet wired". This unifies them: any registry adapter that isn't claude
    // runs here. claude stays on its byte-identical narrow path below.
    if spec.adapter_type != "claude" {
        let outcome = run_trait_adapter(&spec, cancel.clone()).await;
        let duration = start.elapsed().as_secs_f64();
        release_admission(&inner, &channel).await;
        match outcome {
            Ok((summary, ok)) => {
                finalize(
                    &inner,
                    &spec,
                    if ok {
                        TaskStatus::Done
                    } else {
                        TaskStatus::Failed
                    },
                    if ok { None } else { Some(summary.as_str()) },
                    Some(summary.as_str()),
                    Some(if ok { 0 } else { 1 }),
                    Some(duration),
                )
                .await;
            }
            Err(msg) => {
                finalize(
                    &inner,
                    &spec,
                    TaskStatus::Failed,
                    Some(msg.as_str()),
                    None,
                    Some(1),
                    Some(duration),
                )
                .await;
            }
        }
        return;
    }

    // Spawn via the V26-W1 Commit 3 (wiki/509 §7) narrow dispatch helper.
    // For `adapter_type="claude"` it builds the V24-R5 SpawnSpec and calls
    // `claude::spawn` — preserving runner.rs's existing stream loop,
    // admission accounting, SSE publish, and finalize bit-for-bit. For
    // non-claude adapter_type it returns `ErrorKind::Unsupported` so the
    // existing Err arm below surfaces a clear message; M3 (W12) unifies.
    let mut child = match claude_dispatch_spawn(&inner, &spec, &task_id).await {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let msg = format!(
                "claude CLI not found on PATH (looked for '{}'); install Claude Code per https://docs.anthropic.com/claude-code",
                inner.claude_command
            );
            tracing::warn!(task_id = %task_id, "{}", msg);
            release_admission(&inner, &channel).await;
            finalize(
                &inner,
                &spec,
                TaskStatus::Failed,
                Some(msg.as_str()),
                None,
                None,
                Some(start.elapsed().as_secs_f64()),
            )
            .await;
            return;
        }
        Err(e) => {
            // V26-W1 Commit 3 (wiki/509 / Critic Q6): branch on adapter_type
            // so a non-claude `adapter_type` request hitting the runner hot
            // path (which is currently claude-only) doesn't produce a
            // misleading "failed to spawn claude" message.
            let msg = if spec.adapter_type == "claude" {
                format!("failed to spawn claude: {e}")
            } else {
                format!(
                    "failed to dispatch adapter_type={:?} via runner hot path: {e} \
                     (only \"claude\" is wired here in W1; other adapters dispatch via registry)",
                    spec.adapter_type
                )
            };
            tracing::error!(task_id = %task_id, adapter_type = %spec.adapter_type, error = %e, "spawn failed");
            release_admission(&inner, &channel).await;
            finalize(
                &inner,
                &spec,
                TaskStatus::Failed,
                Some(msg.as_str()),
                None,
                None,
                Some(start.elapsed().as_secs_f64()),
            )
            .await;
            return;
        }
    };

    let pid = child.id();

    // Windows: assign to Job Object so descendants die with bridge.
    #[cfg(target_os = "windows")]
    let _job = pid.and_then(|p| match crate::writer::platform_windows::JobObject::assign(p) {
        Ok(j) => Some(j),
        Err(e) => {
            tracing::warn!(error = %e, pid = p, "JobObject::assign failed; orphan-on-bridge-exit possible");
            None
        }
    });

    // Stream stdout.
    let mut reader = match claude::buffered_stdout(&mut child) {
        Some(r) => r,
        None => {
            tracing::error!(task_id = %task_id, "claude child had no stdout pipe");
            let _ = child.kill().await;
            release_admission(&inner, &channel).await;
            finalize(
                &inner,
                &spec,
                TaskStatus::Failed,
                Some("claude child stdout missing"),
                None,
                None,
                Some(start.elapsed().as_secs_f64()),
            )
            .await;
            return;
        }
    };

    let mut accumulated: String = String::new();
    let mut result_text: Option<String> = None;
    let mut had_error: bool = false;

    // V28 "make it actually work" (H2): apply a default wall-clock timeout when
    // the caller didn't set one, so a hung adapter (the live E2E saw a task run
    // 86s with no cap) self-fails into Failed(timeout) instead of spinning
    // "running" forever in the cockpit. Operator override: MUSU_TASK_DEFAULT_TIMEOUT_SEC.
    let timeout = Some(
        spec.timeout_sec
            .map(|s| Duration::from_secs(s as u64))
            .unwrap_or_else(default_task_timeout),
    );
    let outcome = stream_until_done(
        &mut reader,
        &cancel,
        timeout,
        &mut accumulated,
        &mut result_text,
        &mut had_error,
    )
    .await;

    // Reap subprocess based on outcome.
    let (status, error): (TaskStatus, Option<String>) = match outcome {
        StreamOutcome::Done => {
            // Wait briefly for process to exit cleanly.
            let exit = wait_with_timeout(&mut child, Duration::from_secs(5)).await;
            let code = exit.map(|e| e.code()).unwrap_or(None).unwrap_or(0);
            if had_error || code != 0 {
                (
                    TaskStatus::Failed,
                    Some(format!(
                        "claude exited with code {code}; had_error={had_error}"
                    )),
                )
            } else {
                (TaskStatus::Done, None)
            }
        }
        StreamOutcome::Cancelled => {
            graceful_kill(&mut child, pid).await;
            (TaskStatus::Cancelled, Some("cancelled by operator".into()))
        }
        StreamOutcome::Timeout => {
            graceful_kill(&mut child, pid).await;
            (
                TaskStatus::Failed,
                Some(format!("timeout after {}s", spec.timeout_sec.unwrap_or(0))),
            )
        }
        StreamOutcome::IoError(e) => {
            graceful_kill(&mut child, pid).await;
            (TaskStatus::Failed, Some(format!("stdout read error: {e}")))
        }
    };

    let exit_code: Option<i32> = match status {
        TaskStatus::Done => Some(0),
        TaskStatus::Cancelled => None,
        _ => child.try_wait().ok().and_then(|o| o.and_then(|s| s.code())),
    };

    let final_output = if let Some(r) = result_text.clone() {
        if r.is_empty() {
            accumulated.clone()
        } else {
            r
        }
    } else {
        accumulated.clone()
    };

    let duration = start.elapsed().as_secs_f64();
    release_admission(&inner, &channel).await;
    finalize(
        &inner,
        &spec,
        status,
        error.as_deref(),
        Some(final_output.as_str()),
        exit_code,
        Some(duration),
    )
    .await;

    drop(registry_guard);
}

enum AdmissionExit {
    Cancelled,
}

async fn wait_for_admission(
    inner: &Inner,
    channel: &str,
    cancel: &Notify,
) -> Result<(), AdmissionExit> {
    loop {
        let notified = inner.admission_notify.notified();
        tokio::pin!(notified);

        {
            let mut st = inner.admission.lock().await;
            let chan_running = st.per_channel_running.get(channel).copied().unwrap_or(0);
            if st.global_running < inner.max_global && chan_running < inner.max_per_channel {
                st.global_running += 1;
                *st.per_channel_running
                    .entry(channel.to_string())
                    .or_insert(0) += 1;
                return Ok(());
            }
        }
        // Lock released. Wait for an admission slot to be released, with a
        // slow safety recheck so a missed wake cannot strand a pending task.
        tokio::select! {
            _ = &mut notified => {}
            _ = tokio::time::sleep(ADMISSION_RECHECK_INTERVAL) => {}
            _ = cancel.notified() => return Err(AdmissionExit::Cancelled),
        }
    }
}

async fn release_admission(inner: &Inner, channel: &str) {
    let mut st = inner.admission.lock().await;
    if st.global_running > 0 {
        st.global_running -= 1;
    }
    if let Some(n) = st.per_channel_running.get_mut(channel) {
        if *n > 0 {
            *n -= 1;
        }
        if *n == 0 {
            st.per_channel_running.remove(channel);
        }
    }
    inner.admission_notify.notify_waiters();
    inner.admission_notify.notify_one();
}

enum StreamOutcome {
    Done,
    Cancelled,
    Timeout,
    IoError(std::io::Error),
}

async fn stream_until_done(
    reader: &mut tokio::io::BufReader<tokio::process::ChildStdout>,
    cancel: &Notify,
    timeout: Option<Duration>,
    accumulated: &mut String,
    result_text: &mut Option<String>,
    had_error: &mut bool,
) -> StreamOutcome {
    let mut line_buf = String::new();
    let deadline = timeout.map(|t| Instant::now() + t);
    loop {
        // Compute time budget for this iteration.
        let remaining = match deadline {
            Some(d) => {
                let now = Instant::now();
                if now >= d {
                    return StreamOutcome::Timeout;
                }
                Some(d - now)
            }
            None => None,
        };

        // Bound the per-iteration read so we can re-check cancel + deadline.
        // ~1s polling on a no-deadline run is fine: claude streams quickly when
        // emitting, and we exit immediately when the pipe closes.
        let per_iter = remaining.unwrap_or(Duration::from_millis(500));

        line_buf.clear();
        let read_fut = claude::next_event(reader, &mut line_buf);
        let result = tokio::select! {
            biased;
            _ = cancel.notified() => return StreamOutcome::Cancelled,
            r = tokio::time::timeout(per_iter, read_fut) => r,
        };

        match result {
            // Per-iteration timeout. If we had a real deadline, this is a hard
            // timeout. Otherwise, just loop and check cancel again.
            Err(_) => {
                if remaining.is_some() {
                    return StreamOutcome::Timeout;
                }
                continue;
            }
            Ok(Ok(None)) => return StreamOutcome::Done,
            Ok(Ok(Some(Ok(ev)))) => handle_event(ev, accumulated, result_text, had_error),
            Ok(Ok(Some(Err(e)))) => {
                tracing::warn!(
                    error = %e,
                    line = %line_buf.trim(),
                    "stream-json parse error; skipping line"
                );
            }
            Ok(Err(e)) => return StreamOutcome::IoError(e),
        }
    }
}

fn handle_event(
    ev: ClaudeEvent,
    accumulated: &mut String,
    result_text: &mut Option<String>,
    had_error: &mut bool,
) {
    match ev {
        ClaudeEvent::Init { .. } => {}
        ClaudeEvent::Assistant { text } => {
            if !text.is_empty() {
                if !accumulated.is_empty() {
                    accumulated.push('\n');
                }
                accumulated.push_str(&text);
            }
        }
        ClaudeEvent::Result {
            text,
            cost_usd: _,
            is_error,
        } => {
            if is_error {
                *had_error = true;
            }
            *result_text = text;
        }
        ClaudeEvent::Other => {}
    }
}

async fn wait_with_timeout(
    child: &mut tokio::process::Child,
    dur: Duration,
) -> Option<std::process::ExitStatus> {
    tokio::time::timeout(dur, child.wait())
        .await
        .ok()
        .and_then(|r| r.ok())
}

/// Graceful kill: Windows sends CTRL_BREAK_EVENT + 5s grace + TerminateProcess;
/// other platforms try `start_kill` (SIGTERM-equivalent) + 5s grace + SIGKILL.
///
/// V26-W1 Commit 3 (wiki/509 §3 R6 / Critic HIGH-2): elevated from private
/// `async fn` to `pub(crate) async fn` so the `ClaudeAdapter` shim
/// (`adapter/claude.rs`) can reuse the SAME kill path instead of
/// re-implementing it. The shim calls `crate::writer::runner::graceful_kill`.
pub(crate) async fn graceful_kill(child: &mut tokio::process::Child, pid: Option<u32>) {
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = pid {
            if let Err(e) = crate::writer::platform_windows::send_ctrl_break(p) {
                tracing::warn!(pid = p, error = %e, "send_ctrl_break failed");
            }
        }
        if let Some(_status) = wait_with_timeout(child, CANCEL_GRACE).await {
            return;
        }
        let _ = child.kill().await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // tokio's Command::kill() sends SIGKILL on unix; try a SIGTERM via
        // child.start_kill() if available, else go straight to SIGKILL.
        let _ = pid; // not used on unix here
        let _ = child.start_kill();
        if let Some(_status) = wait_with_timeout(child, CANCEL_GRACE).await {
            return;
        }
        let _ = child.kill().await;
    }
}

async fn update_status_started(pool: &SqlitePool, task_id: &str, started_at: i64) {
    let now = chrono::Utc::now().timestamp();
    if let Err(e) = sqlx::query(
        "UPDATE route_executions
            SET status = 'running',
                started_at = ?,
                updated_at = ?
          WHERE task_id = ?",
    )
    .bind(started_at)
    .bind(now)
    .bind(task_id)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %e, task_id, "update_status_started failed");
    }

    TaskUpdate {
        task_id,
        status: "running",
        started_at: Some(started_at),
        ..Default::default()
    }
    .save();
}

#[allow(clippy::too_many_arguments)]
async fn finalize(
    inner: &Inner,
    spec: &TaskSpec,
    status: TaskStatus,
    error: Option<&str>,
    output: Option<&str>,
    exit_code: Option<i32>,
    duration_sec: Option<f64>,
) {
    let task_id = &spec.task_id;
    let now = chrono::Utc::now().timestamp();
    if let Err(e) = sqlx::query(
        "UPDATE route_executions
            SET status = ?,
                error = ?,
                output = ?,
                exit_code = ?,
                duration_sec = ?,
                updated_at = ?
          WHERE task_id = ?",
    )
    .bind(status.as_str())
    .bind(error)
    .bind(output)
    .bind(exit_code)
    .bind(duration_sec)
    .bind(now)
    .bind(task_id.as_str())
    .execute(&inner.pool)
    .await
    {
        tracing::warn!(error = %e, task_id, "finalize update failed");
    }
    TaskUpdate {
        task_id: task_id.as_str(),
        status: status.as_str(),
        company_id: spec.company_id.as_deref(),
        channel: Some(&spec.channel),
        sender_id: Some(&spec.sender_id),
        prompt: Some(&spec.prompt),
        output,
        error,
        exit_code,
        duration_sec,
        ..Default::default()
    }
    .save();
    inner.sse.publish(
        TaskEvent::update(task_id, status.as_str())
            .with_context(
                spec.company_id.as_deref(),
                Some(&spec.channel),
                Some(&spec.sender_id),
            )
            .with_result(output, error, exit_code, duration_sec),
    );

    // V27-F1: send result callback if this was a forwarded task.
    fire_callback(spec, status, output, error, exit_code, duration_sec);

    // GC: If this was a forwarded task with a callback, clean up the temporary workspace
    if spec.callback_url.is_some() {
        // Only remove if it's actually in temp_dir to prevent accidental deletion of real workspaces
        let temp_dir_base = std::env::temp_dir().join("musu_workspaces");
        if spec.cwd.starts_with(&temp_dir_base) {
            if let Err(e) = std::fs::remove_dir_all(&spec.cwd) {
                tracing::warn!(task_id = %task_id, err = %e, "Failed to garbage collect temporary workspace");
            } else {
                tracing::debug!(task_id = %task_id, dir = %spec.cwd.display(), "Garbage collected temporary workspace");
            }
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, Default)]
pub struct TaskUpdate<'a> {
    pub task_id: &'a str,
    pub status: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_pc: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
}

impl<'a> TaskUpdate<'a> {
    pub fn save(self) {
        let musu_home = crate::install::resolve_musu_home_from_env()
            .unwrap_or_else(|_| std::path::PathBuf::from(".").join(".musu"));

        let tasks_dir = musu_home.join("tasks");
        if let Err(e) = std::fs::create_dir_all(&tasks_dir) {
            tracing::warn!("Failed to create tasks dir {}: {}", tasks_dir.display(), e);
            return;
        }

        let file_path = tasks_dir.join(format!("{}.json", self.task_id));

        let mut json_val = if file_path.exists() {
            std::fs::read_to_string(&file_path)
                .ok()
                .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
                .unwrap_or_else(|| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        if let Some(obj) = json_val.as_object_mut() {
            let update_val = serde_json::to_value(&self).unwrap_or_else(|_| serde_json::json!({}));
            if let Some(update_obj) = update_val.as_object() {
                for (k, v) in update_obj {
                    obj.insert(k.clone(), v.clone());
                }
            }
            obj.insert(
                "updated_at".to_string(),
                serde_json::json!(chrono::Utc::now().timestamp()),
            );

            if obj.get("created_at").is_none() {
                obj.insert(
                    "created_at".to_string(),
                    serde_json::json!(chrono::Utc::now().timestamp()),
                );
            }
        }

        if let Ok(data) = serde_json::to_string_pretty(&json_val) {
            if let Err(e) = std::fs::write(&file_path, data) {
                tracing::warn!(
                    "Failed to write task json to {}: {}",
                    file_path.display(),
                    e
                );
            }
        }

        // --- SEMANTIC SSOT INTEGRATION ---
        // If the task has reached a terminal state, export it to the musu-crawl-ai wiki directory.
        if let Some(status) = json_val.get("status").and_then(|s| s.as_str()) {
            if status == "done" || status == "failed" {
                if let Ok(wiki_dir_str) = std::env::var("MUSU_CRAWL_WIKI_DIR") {
                    let wiki_dir = std::path::PathBuf::from(&wiki_dir_str);
                    let project_dir = wiki_dir.join("projects").join("brainai").join("tasks");
                    if let Err(e) = std::fs::create_dir_all(&project_dir) {
                        tracing::warn!("Failed to create Semantic SSOT wiki dir: {}", e);
                        return;
                    }

                    let task_id = json_val
                        .get("task_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let prompt = json_val
                        .get("prompt")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let output = json_val
                        .get("output")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let error = json_val.get("error").and_then(|v| v.as_str()).unwrap_or("");
                    let channel = json_val
                        .get("channel")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");

                    // UTF-8 safe truncation: byte slicing `&prompt[..100]` panics when
                    // byte 100 lands mid-codepoint (trivially true for Korean/emoji).
                    let summary: String = prompt.chars().take(100).collect();
                    let safe_summary = summary.replace('\n', " ").replace('"', "\\\"");

                    let md_content = format!(
                        r#"---
title: "Task {}"
source: "brainai"
project: "brainai"
reliability: 1.0
id: "{}"
date: "{}"
tags:
  - "status_{}"
  - "channel_{}"
summary: "{}"
---

## Prompt
{}

## Output
{}

## Error
{}
"#,
                        task_id,
                        task_id,
                        chrono::Utc::now().format("%Y-%m-%d"),
                        status,
                        channel,
                        safe_summary,
                        prompt,
                        output,
                        error
                    );

                    let md_path = project_dir.join(format!("{}.md", task_id));
                    if let Err(e) = std::fs::write(&md_path, md_content) {
                        tracing::warn!(
                            "Failed to write Semantic SSOT markdown to {}: {}",
                            md_path.display(),
                            e
                        );
                    } else {
                        // Spawn a background thread to trigger musu-crawl index
                        std::thread::spawn(move || {
                            let musu_crawl_exe = std::env::var("MUSU_CRAWL_BINARY")
                                .unwrap_or_else(|_| "musu-crawl".to_string());
                            let _ = std::process::Command::new(musu_crawl_exe)
                                .arg("index")
                                .arg("--out")
                                .arg(wiki_dir_str)
                                .arg("--project")
                                .arg("brainai")
                                .output();
                        });
                    }
                }
            }
        }
    }
}

/// Registry guard: removes the task entry on drop so JoinHandles never leak.
struct RegistryGuard {
    registry: Arc<DashMap<String, TaskHandle>>,
    task_id: String,
}

impl Drop for RegistryGuard {
    fn drop(&mut self) {
        self.registry.remove(&self.task_id);
    }
}

// Quiet unused-warnings when broadcast type imported but not directly named here.
#[allow(dead_code)]
fn _bc_typeref() -> Option<broadcast::Receiver<TaskEvent>> {
    None
}

/// V26-W1 Commit 3 (wiki/509 §7 + §7.1). Narrow dispatch boundary for the
/// runner hot path. Lives inside `runner.rs` (not in `adapter/claude.rs`)
/// because it needs `&Inner.claude_command` (private to this module — §7.1
/// helper-placement lock / Critic MEDIUM-2).
///
/// For `adapter_type="claude"`: builds the V24-R5 `SpawnSpec` (the SAME
/// shape the inline literal at the old `:261-273` used) and delegates to
/// `claude::spawn`. The returned `Child` flows into the existing stream
/// loop at `runner.rs:325-358` BYTE-IDENTICAL (detail plan §4.6 contract).
///
/// For non-claude `adapter_type`: returns `ErrorKind::Unsupported`. Those
/// adapters dispatch through `adapter::registry::dispatch(...)` and run via
/// `Adapter::execute(...)`, not via this hot path. M3 (W12) unifies both
/// surfaces once deadline+cancel propagation lands.
/// V28 "make it actually work" — in-process adapters that produce a result
/// WITHOUT spawning any external program. Returns `Some((output, ok))` if this
/// adapter_type is handled here; `None` to fall through to the spawn path.
///
/// `echo` is the zero-dependency floor: it lets a fresh single-machine install
/// demonstrate the full order → running → done → result loop with no claude CLI,
/// no Ollama, no login. It is the SAFE default the installer points at so the
/// product never silently requires a (soon-metered) external agent just to run.
fn run_inprocess_adapter(spec: &TaskSpec) -> Option<(String, bool)> {
    match spec.adapter_type.as_str() {
        "echo" => Some((format!("echo: {}", spec.prompt.trim()), true)),
        _ => None,
    }
}

/// V28 C3 fix — run a registry/trait adapter (codex / gemini / openai_compat_*)
/// to completion via `Adapter::execute`, returning `(summary, ok)`. Builds the
/// AdapterContext from the TaskSpec; the adapter self-contains spawn + stream +
/// cancel + deadline. Errors (unknown type, spawn failure) come back as
/// `Err(message)` so the caller finalizes Failed with a legible reason.
async fn run_trait_adapter(spec: &TaskSpec, cancel: Arc<Notify>) -> Result<(String, bool), String> {
    use crate::adapter::{registry, AdapterContext};

    let deadline_unix_ms = spec.timeout_sec.map(|s| {
        let now_ms = chrono::Utc::now().timestamp_millis().max(0) as u64;
        now_ms + (s as u64) * 1000
    });

    let ctx = AdapterContext {
        run_id: spec.task_id.clone(),
        prompt: spec.prompt.clone(),
        agent_id: spec.sender_id.clone(),
        adapter_type: spec.adapter_type.clone(),
        config_json: spec
            .model
            .as_ref()
            .map(|m| serde_json::json!({ "model": m }))
            .unwrap_or(serde_json::Value::Null),
        session_id: None,
        cwd: Some(spec.cwd.clone()),
        deadline_unix_ms,
        cancel: Some(cancel),
        extra: serde_json::Value::Null,
    };

    let adapter = registry::dispatch(&spec.adapter_type, &ctx)
        .map_err(|e| format!("adapter {:?}: {e}", spec.adapter_type))?;

    match adapter.execute(&ctx).await {
        Ok(result) => Ok((result.summary, result.success)),
        Err(e) => Err(format!("{:?} failed: {e}", spec.adapter_type)),
    }
}

async fn claude_dispatch_spawn(
    inner: &Inner,
    spec: &TaskSpec,
    task_id: &str,
) -> std::io::Result<tokio::process::Child> {
    match spec.adapter_type.as_str() {
        "claude" => {
            let spawn_spec = SpawnSpec {
                command: inner.claude_command.clone(),
                task_id: task_id.to_string(),
                prompt: spec.prompt.clone(),
                cwd: spec.cwd.clone(),
                model: spec.model.clone(),
                timeout_sec: spec.timeout_sec,
                company_id: spec.company_id.clone(),
                agent_id: None,
                run_id: None,
            };
            claude::spawn(&spawn_spec).await
        }
        other => Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            format!(
                "adapter_type {other:?} not yet wired into the runner hot path \
                 (only \"claude\" is supported in W1; non-claude adapters dispatch \
                 via adapter::registry::dispatch and run through Adapter::execute, \
                 which is exercised by adapter_openai_compat tests). M3 (W12) \
                 unifies both surfaces."
            ),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::schema::SCHEMA_V1_STATEMENTS;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    fn echo_spec(prompt: &str) -> TaskSpec {
        TaskSpec {
            task_id: "t-echo".into(),
            company_id: None,
            channel: "desktop".into(),
            sender_id: "op".into(),
            prompt: prompt.into(),
            expected_output: None,
            cwd: std::path::PathBuf::from("."),
            model: None,
            timeout_sec: None,
            adapter_type: "echo".into(),
            callback_url: None,
            source_task_id: None,
            callback_token: None,
        }
    }

    /// V28 "make it actually work": the built-in echo adapter produces a result
    /// in-process (no subprocess), so a fresh install with no external CLI still
    /// completes an order. Unknown types fall through (None → spawn path).
    #[test]
    fn echo_adapter_runs_in_process() {
        let (out, ok) = run_inprocess_adapter(&echo_spec("hello world")).unwrap();
        assert!(ok);
        assert_eq!(out, "echo: hello world");
        let mut claude = echo_spec("x");
        claude.adapter_type = "claude".into();
        assert!(run_inprocess_adapter(&claude).is_none());
    }

    /// adapter_binary_on_path returns false for a clearly-absent binary (so
    /// detect_default_adapter falls through to echo on a bare machine).
    #[test]
    fn adapter_binary_on_path_false_for_absent() {
        assert!(!adapter_binary_on_path("definitely-not-a-real-cli-xyz123"));
    }

    #[test]
    fn callback_node_name_prefers_musu_node_name() {
        let previous = std::env::var("MUSU_NODE_NAME").ok();
        std::env::set_var("MUSU_NODE_NAME", "studio-pc");
        assert_eq!(callback_node_name(), "studio-pc");
        match previous {
            Some(value) => std::env::set_var("MUSU_NODE_NAME", value),
            None => std::env::remove_var("MUSU_NODE_NAME"),
        }
    }

    async fn mem_pool() -> SqlitePool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .expect("mem pool");
        for stmt in SCHEMA_V1_STATEMENTS {
            sqlx::query(stmt).execute(&pool).await.expect(stmt);
        }
        for stmt in crate::core::schema::SCHEMA_V2_ALTER_STATEMENTS {
            sqlx::query(stmt).execute(&pool).await.expect(stmt);
        }
        pool
    }

    async fn insert_row(pool: &SqlitePool, task_id: &str, status: &str) {
        sqlx::query(
            "INSERT INTO route_executions \
             (task_id, company_id, channel, sender_id, input_hash, status, created_at) \
             VALUES (?, NULL, 'ch', 's', 'h', ?, ?)",
        )
        .bind(task_id)
        .bind(status)
        .bind(chrono::Utc::now().timestamp())
        .execute(pool)
        .await
        .unwrap();
    }

    async fn row_status(pool: &SqlitePool, task_id: &str) -> String {
        let r: (String,) = sqlx::query_as("SELECT status FROM route_executions WHERE task_id = ?")
            .bind(task_id)
            .fetch_one(pool)
            .await
            .unwrap();
        r.0
    }

    #[tokio::test]
    async fn recovers_orphaned_pending_rows_on_boot() {
        let pool = mem_pool().await;
        insert_row(&pool, "t1", "pending").await;
        insert_row(&pool, "t2", "running").await;
        insert_row(&pool, "t3", "done").await; // should NOT be touched
        let sse = SseBroadcaster::new(100);
        let _runner = TaskRunnerHandle::new(pool.clone(), sse).await;
        assert_eq!(row_status(&pool, "t1").await, "failed");
        assert_eq!(row_status(&pool, "t2").await, "failed");
        assert_eq!(row_status(&pool, "t3").await, "done");
    }

    /// Build a runner whose `claude` binary is a sh script that emits one
    /// stream-json line and exits 0.
    async fn runner_with_fake_claude(
        script_body: &str,
    ) -> (TaskRunnerHandle, SqlitePool, tempfile::TempDir) {
        let pool = mem_pool().await;
        let tmp = tempfile::tempdir().unwrap();
        let bin_path = write_fake_claude(&tmp, script_body);
        std::env::set_var("MUSU_CLAUDE_BINARY", &bin_path);
        std::env::set_var("MUSU_TASK_MAX_GLOBAL", "4");
        std::env::set_var("MUSU_TASK_MAX_PER_CHANNEL", "1");
        let sse = SseBroadcaster::new(100);
        let runner = TaskRunnerHandle::new(pool.clone(), sse).await;
        (runner, pool, tmp)
    }

    #[cfg(target_os = "windows")]
    fn write_fake_claude(tmp: &tempfile::TempDir, body: &str) -> std::path::PathBuf {
        // Write a .cmd file that echoes the body.
        let p = tmp.path().join("fake_claude.cmd");
        std::fs::write(&p, format!("@echo off\r\n{}\r\n", body)).unwrap();
        p
    }

    #[cfg(not(target_os = "windows"))]
    fn write_fake_claude(tmp: &tempfile::TempDir, body: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let p = tmp.path().join("fake_claude.sh");
        std::fs::write(&p, format!("#!/bin/sh\n{}\n", body)).unwrap();
        let mut perms = std::fs::metadata(&p).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&p, perms).unwrap();
        p
    }

    async fn wait_status(pool: &SqlitePool, task_id: &str, want: &str, timeout: Duration) -> bool {
        let start = Instant::now();
        while start.elapsed() < timeout {
            if row_status(pool, task_id).await == want {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(30)).await;
        }
        false
    }

    #[tokio::test]
    async fn state_machine_pending_running_done() {
        let body = if cfg!(target_os = "windows") {
            r#"echo {"type":"result","result":"ok","is_error":false}"#
        } else {
            r#"printf '{"type":"result","result":"ok","is_error":false}\n'"#
        };
        let (runner, pool, _tmp) = runner_with_fake_claude(body).await;
        let task_id = "t-done".to_string();
        insert_row(&pool, &task_id, "pending").await;
        runner
            .spawn_task(TaskSpec {
                task_id: task_id.clone(),
                company_id: None,
                channel: "ch-a".into(),
                sender_id: "s".into(),
                prompt: "hello".into(),
                expected_output: None,
                cwd: std::env::temp_dir(),
                model: None,
                timeout_sec: Some(10),
                adapter_type: "claude".into(),
                callback_url: None,
                source_task_id: None,
                callback_token: None,
            })
            .await
            .unwrap();
        assert!(wait_status(&pool, &task_id, "done", Duration::from_secs(10)).await);
    }

    #[tokio::test]
    async fn state_machine_pending_running_failed() {
        // Exit code nonzero AND result with is_error:true → failed.
        let body = if cfg!(target_os = "windows") {
            r#"echo {"type":"result","result":"bad","is_error":true}
exit 2"#
        } else {
            r#"printf '{"type":"result","result":"bad","is_error":true}\n'
exit 2"#
        };
        let (runner, pool, _tmp) = runner_with_fake_claude(body).await;
        let task_id = "t-fail".to_string();
        insert_row(&pool, &task_id, "pending").await;
        runner
            .spawn_task(TaskSpec {
                task_id: task_id.clone(),
                company_id: None,
                channel: "ch-b".into(),
                sender_id: "s".into(),
                prompt: "hello".into(),
                expected_output: None,
                cwd: std::env::temp_dir(),
                model: None,
                timeout_sec: Some(10),
                adapter_type: "claude".into(),
                callback_url: None,
                source_task_id: None,
                callback_token: None,
            })
            .await
            .unwrap();
        assert!(wait_status(&pool, &task_id, "failed", Duration::from_secs(10)).await);
    }

    #[tokio::test]
    async fn cancel_signal_transitions_to_cancelled() {
        // Long-running fake claude — sleep 30s then exit. We cancel mid-run.
        let body = if cfg!(target_os = "windows") {
            // ping-based sleep ~30s
            r#"ping -n 31 127.0.0.1 > NUL
echo {"type":"result","result":"ok","is_error":false}"#
        } else {
            r#"sleep 30
printf '{"type":"result","result":"ok","is_error":false}\n'"#
        };
        let (runner, pool, _tmp) = runner_with_fake_claude(body).await;
        let task_id = "t-cancel".to_string();
        insert_row(&pool, &task_id, "pending").await;
        runner
            .spawn_task(TaskSpec {
                task_id: task_id.clone(),
                company_id: None,
                channel: "ch-c".into(),
                sender_id: "s".into(),
                prompt: "hello".into(),
                expected_output: None,
                cwd: std::env::temp_dir(),
                model: None,
                timeout_sec: Some(120),
                adapter_type: "claude".into(),
                callback_url: None,
                source_task_id: None,
                callback_token: None,
            })
            .await
            .unwrap();
        // Wait briefly for it to become running, then cancel.
        assert!(wait_status(&pool, &task_id, "running", Duration::from_secs(5)).await);
        assert!(runner.cancel(&task_id));
        assert!(wait_status(&pool, &task_id, "cancelled", Duration::from_secs(15)).await);
    }

    #[tokio::test]
    async fn global_concurrency_cap_blocks_then_admits() {
        // Force tight cap: 1 global, 1 per-channel.
        std::env::set_var("MUSU_TASK_MAX_GLOBAL", "1");
        std::env::set_var("MUSU_TASK_MAX_PER_CHANNEL", "1");
        let body = if cfg!(target_os = "windows") {
            r#"ping -n 2 127.0.0.1 > NUL
echo {"type":"result","result":"ok","is_error":false}"#
        } else {
            r#"sleep 1
printf '{"type":"result","result":"ok","is_error":false}\n'"#
        };
        let (runner, pool, _tmp) = runner_with_fake_claude(body).await;
        insert_row(&pool, "g1", "pending").await;
        insert_row(&pool, "g2", "pending").await;
        // Different channels so per-channel cap doesn't interfere; global=1.
        for (id, ch) in [("g1", "g-ch-1"), ("g2", "g-ch-2")] {
            runner
                .spawn_task(TaskSpec {
                    task_id: id.into(),
                    company_id: None,
                    channel: ch.into(),
                    sender_id: "s".into(),
                    prompt: "hi".into(),
                    expected_output: None,
                    cwd: std::env::temp_dir(),
                    model: None,
                    timeout_sec: Some(10),
                    adapter_type: "claude".into(),
                    callback_url: None,
                    source_task_id: None,
                    callback_token: None,
                })
                .await
                .unwrap();
        }
        // Both should eventually complete (serially).
        assert!(wait_status(&pool, "g1", "done", Duration::from_secs(15)).await);
        assert!(wait_status(&pool, "g2", "done", Duration::from_secs(15)).await);
        // Reset.
        std::env::set_var("MUSU_TASK_MAX_GLOBAL", "4");
    }

    #[tokio::test]
    async fn per_channel_concurrency_cap_independent() {
        std::env::set_var("MUSU_TASK_MAX_GLOBAL", "10");
        std::env::set_var("MUSU_TASK_MAX_PER_CHANNEL", "1");
        let body = if cfg!(target_os = "windows") {
            r#"ping -n 2 127.0.0.1 > NUL
echo {"type":"result","result":"ok","is_error":false}"#
        } else {
            r#"sleep 1
printf '{"type":"result","result":"ok","is_error":false}\n'"#
        };
        let (runner, pool, _tmp) = runner_with_fake_claude(body).await;
        insert_row(&pool, "p1", "pending").await;
        insert_row(&pool, "p2", "pending").await;
        // Same channel → serialized.
        for id in ["p1", "p2"] {
            runner
                .spawn_task(TaskSpec {
                    task_id: id.into(),
                    company_id: None,
                    channel: "shared".into(),
                    sender_id: "s".into(),
                    prompt: "hi".into(),
                    expected_output: None,
                    cwd: std::env::temp_dir(),
                    model: None,
                    timeout_sec: Some(10),
                    adapter_type: "claude".into(),
                    callback_url: None,
                    source_task_id: None,
                    callback_token: None,
                })
                .await
                .unwrap();
        }
        assert!(wait_status(&pool, "p1", "done", Duration::from_secs(15)).await);
        assert!(wait_status(&pool, "p2", "done", Duration::from_secs(15)).await);
        std::env::set_var("MUSU_TASK_MAX_GLOBAL", "4");
    }

    #[tokio::test]
    async fn join_handles_never_leak_on_completion() {
        let body = if cfg!(target_os = "windows") {
            r#"echo {"type":"result","result":"ok","is_error":false}"#
        } else {
            r#"printf '{"type":"result","result":"ok","is_error":false}\n'"#
        };
        let (runner, pool, _tmp) = runner_with_fake_claude(body).await;
        let baseline = runner.registry_len();
        for i in 0..3 {
            let id = format!("leak-{i}");
            insert_row(&pool, &id, "pending").await;
            runner
                .spawn_task(TaskSpec {
                    task_id: id.clone(),
                    company_id: None,
                    channel: format!("ch-{i}"),
                    sender_id: "s".into(),
                    prompt: "hi".into(),
                    expected_output: None,
                    cwd: std::env::temp_dir(),
                    model: None,
                    timeout_sec: Some(10),
                    adapter_type: "claude".into(),
                    callback_url: None,
                    source_task_id: None,
                    callback_token: None,
                })
                .await
                .unwrap();
        }
        // Wait for all 3 to finish.
        for i in 0..3 {
            let id = format!("leak-{i}");
            assert!(wait_status(&pool, &id, "done", Duration::from_secs(15)).await);
        }
        // Allow a moment for the registry-guard drop to settle.
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(
            runner.registry_len(),
            baseline,
            "registry must return to baseline after all tasks finish"
        );
    }
}
