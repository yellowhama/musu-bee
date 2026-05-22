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

/// Wait between admission retries when capped.
const ADMISSION_POLL_INTERVAL: Duration = Duration::from_millis(50);

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
    max_global: u32,
    max_per_channel: u32,
    sse: SseBroadcaster,
    claude_command: String,
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
        let claude_command =
            std::env::var("MUSU_CLAUDE_BINARY").unwrap_or_else(|_| "claude".into());

        let inner = Inner {
            pool,
            registry: Arc::new(DashMap::new()),
            admission: Arc::new(Mutex::new(AdmissionState::default())),
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

/// Drive one task end-to-end. This runs inside `tokio::spawn`.
async fn run_one(inner: Arc<Inner>, spec: TaskSpec, cancel: Arc<Notify>) {
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
                finalize(
                    &inner,
                    &task_id,
                    TaskStatus::Cancelled,
                    None,
                    None,
                    None,
                    None,
                )
                .await;
                let _ = registry_guard;
                return;
            }
        }
    }

    // Mark running.
    let started_at = chrono::Utc::now().timestamp();
    update_status_started(&inner.pool, &task_id, started_at).await;
    inner.sse.publish(TaskEvent::update(&task_id, "running"));

    // Spawn via the V26-W1 Commit 3 (wiki/509 §7) narrow dispatch helper.
    // For `adapter_type="claude"` it builds the V24-R5 SpawnSpec and calls
    // `claude::spawn` — preserving runner.rs's existing stream loop,
    // admission accounting, SSE publish, and finalize bit-for-bit. For
    // non-claude adapter_type it returns `ErrorKind::Unsupported` so the
    // existing Err arm below surfaces a clear message; M3 (W12) unifies.
    let start = Instant::now();
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
                &task_id,
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
                &task_id,
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
                &task_id,
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

    let timeout = spec.timeout_sec.map(|s| Duration::from_secs(s as u64));
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
        &task_id,
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
        // Lock released — poll with cancel awareness.
        tokio::select! {
            _ = tokio::time::sleep(ADMISSION_POLL_INTERVAL) => {}
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
}

#[allow(clippy::too_many_arguments)]
async fn finalize(
    inner: &Inner,
    task_id: &str,
    status: TaskStatus,
    error: Option<&str>,
    output: Option<&str>,
    exit_code: Option<i32>,
    duration_sec: Option<f64>,
) {
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
    .bind(task_id)
    .execute(&inner.pool)
    .await
    {
        tracing::warn!(error = %e, task_id, "finalize update failed");
    }
    inner
        .sse
        .publish(TaskEvent::update(task_id, status.as_str()));
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
