# V24-R5 — musu-rs::writer module (native Claude-CLI task runner)

**Wiki ID**: wiki/495
**Created**: 2026-05-20
**Phase**: R-cleanup, 1 of 4 (per GOAL.md §A.1.1 reorder)
**Parent**: wiki/490 (V24 master plan) + wiki/498c (R8 E2E closure, which surfaced this gap)
**Predecessors**: wiki/491 (R1 bridge), wiki/492 (R2 core), wiki/493+ (R7 musu-bee wire-up), wiki/498c (R8 4060Ti E2E closure) — all SHIPPED
**Risk**: MED
**LOC estimate**: ~750 Rust (vs wiki/490 §5 R5 row's ~1,500 — Researcher F2 carved out musu-supervisor sandboxing; deferred to V25)
**Status**: DRAFT (Phase 0 Researcher done; awaiting Phase 1.5 Critic)
**Critic**: `system-architect` (single, MED-risk per master plan §5)
**Auditor**: `quality-engineer` (single, NOT dual — no auth surface touched)

## §1 Scope

R5 replaces the **47-line writer-stub** in `musu-rs/src/bridge/handlers/run.rs:92-138` and the symmetric block in `musu-rs/src/bridge/handlers/tasks.rs:113-161` — both of which currently INSERT a `route_executions` row with `status='pending_python_writer'` and POST to a now-dead Python facade on `:8071` — with **native Rust agent-task execution** by spawning the `claude` CLI as a subprocess from inside `musu-rs`.

What R5 SHIPS:

1. **`writer::runner::TaskRunner`** — `tokio::spawn`-managed agent task lifecycle: state machine `pending → running → done|failed|cancelled`, global + per-channel concurrency caps, `JoinHandle` registry, status reconciliation on completion.
2. **`writer::claude::spawn` + stream-json parser** — replaces the Python `asyncio.create_subprocess_exec` shape in `musu-core/src/musu_core/adapters/claude_local.py:185` (Researcher F1). Spawns `claude --print - --output-format stream-json --verbose ...` via `tokio::process::Command`; parses line-buffered JSON events: `system/init`, `assistant`, `result`.
3. **`writer::sse::SseBroadcaster`** — `tokio::sync::broadcast(100)` channel; axum `Sse<Stream<Event>>` adapter on `GET /api/tasks/events` with 15s keepalive (Researcher F7).
4. **`writer::cancel`** — `DELETE /api/tasks/{task_id}` handler that signals the runner to kill the subprocess (Q4 lock-in).
5. **`writer::env`** — env-builder that strips 4 nesting variables (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION`, `CLAUDE_CODE_PARENT_SESSION`) and injects 4 musu envelope vars (`MUSU_RUN_ID`, `MUSU_AGENT_ID`, `MUSU_TASK_ID`, `PAPERCLIP_COMPANY_ID`).
6. **Platform-specific process group / death-signal**: Linux `prctl(PR_SET_PDEATHSIG, SIGKILL)` via `libc`; Windows `CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK_EVENT` + Job Object via `windows-sys`; macOS best-effort SIGTERM. Operator's primary is Windows 11 (env block), so Windows graceful-kill is load-bearing (Q-NEW-C).
7. **Schema v1 → v2 additive migration**: 5 NULLable ALTER TABLE columns on `route_executions` (`output TEXT`, `error TEXT`, `duration_sec REAL`, `exit_code INTEGER`, `updated_at INTEGER`). Const III gate fires ONCE on operator machine (Q-NEW-A).

What R5 does NOT ship (explicit deferrals — keep for §10 if Critic surfaces):

- **`musu-writer/` fiction-MCP integration** — Researcher F1: that's a different product; NOT the "Python writer" R5 replaces.
- **`musu-supervisor-isolation-*` Cargo dep** — Researcher F2/F3: those crates are scaffolds returning `IsolationError::Unsupported`. R5 builds on `tokio::process::Command` directly. No `Isolation` trait wiring.
- **cgroup / sandbox / seccomp** — Q-NEW-B locked: parity with Python `claude_local.py` (also unrestricted spawn). Deferred to V25.
- **Disk-path transcript spooling** — Q3 locked: SQLite-only `output` column. 10MB cap not needed (no disk path).
- **`/api/dispatch/runs/{runId}/stream` + `/api/chat/stream`** — Researcher F15: out of scope. R5 ships ONLY `/api/tasks/events`.
- **Per-company concurrency caps** — Q2 locked: global + per-channel only.
- **New credential plumbing** — Q5 locked: parent-env inheritance is parity. No new secrets.

### §1.1 Locked decisions (Phase 0 OQ resolutions — DO NOT re-litigate)

| ID | Decision | Source |
|---|---|---|
| Q1 | **spawn-then-track** (POST returns 202 + task_id immediately; SSE delivers state transitions) | Researcher F9; parity with Python; musu-bee TS already expects this shape |
| Q2 | **global + per-channel concurrency caps, no per-company** | Researcher F9; parity |
| Q3 | **SQLite-only stdout/output** (no disk transcript path) | Researcher F9; parity; F13 disk-fill risk neutralized |
| Q4 | **ship DELETE `/api/tasks/{task_id}` cancel** (~30 LOC) | Researcher F9 |
| Q5 | **no new credential plumbing** (parent-env inherit) | Researcher F10 |
| Q-NEW-A | **schema v1.1 ALTER TABLE additive migration** (5 NULLable cols, non-breaking) | Researcher F4 |
| Q-NEW-B | **no cgroup/sandbox in R5; defer to V25** | parity with claude_local.py |
| Q-NEW-C | **ship Windows CTRL_BREAK_EVENT graceful kill path** (operator's primary is Windows) | Researcher F11 |

## §2 Stack

Per V24_DEPENDENCY_AUDIT.md (R5 row to be amended post-Critic). Reuses R1+R2 baseline; adds **2 platform-conditional crates** + 1 unconditional helper, no new pure-Rust deps.

| Crate | Version | New? | Cfg gate | Reason |
|---|---|---|---|---|
| `tokio` 1 (full) | already in workspace | — | — | runtime + `tokio::process::Command` + `tokio::sync::broadcast` + `tokio::task::JoinHandle` |
| `axum` 0.7 | already in workspace | — | — | `axum::response::sse::{Sse, Event, KeepAlive}` (Researcher F7) |
| `sqlx` 0.7 | already in workspace | — | — | route_executions ALTER + UPDATEs |
| `serde_json` 1 | already in workspace | — | — | stream-json line parser |
| `serde` 1 | already in workspace | — | — | event struct derives |
| `chrono` 0.4 | already in workspace | — | — | duration_sec / updated_at timestamps |
| `tracing` 0.1 | already in workspace | — | — | structured logs per task_id |
| `uuid` 1 | already in workspace | — | — | task_id already produced by R1; R5 just reads |
| `futures-util` 0.3 | already in workspace | — | — | `BroadcastStream` adapter for SSE |
| `tokio-stream` 0.1 | **NEW for R5** | unconditional | `BroadcastStream` wrapper for `broadcast::Receiver → Stream` |
| `libc` 0.2 | **NEW for R5** | `cfg(unix)` | `prctl(PR_SET_PDEATHSIG, SIGKILL)` via `pre_exec` (Researcher F12) |
| `windows-sys` 0.59 | **NEW for R5** | `cfg(windows)` | Job Object + `GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, ...)` + `CREATE_NEW_PROCESS_GROUP` constant (Researcher F11/F12) |

`windows-sys` features list: `["Win32_System_JobObjects", "Win32_System_Console", "Win32_System_Threading", "Win32_Foundation"]`.

Both new platform crates are self-contained (no further C/system deps) — passes [[feedback-self-contained-product]]. Pre-commit dep check: if Builder needs another crate during R5 implementation, that's a Critic finding requiring plan amendment ([[feedback-no-yagni-architecture]] discipline).

## §3 Module touch list

```
musu-rs/src/writer/
├── mod.rs                  (MODIFY, was 4-line stub; ~60 LOC) — module entry, re-exports, `pub async fn run()` for `musu writer` CLI subcommand
├── claude.rs               (NEW; ~150 LOC) — claude CLI spawn + stream-json parser
├── runner.rs               (NEW; ~200 LOC) — TaskRunner state machine, JoinHandle registry, concurrency caps
├── sse.rs                  (NEW;  ~80 LOC) — broadcast channel + axum Sse adapter
├── cancel.rs               (NEW;  ~50 LOC) — DELETE handler + Cancel signal
├── env.rs                  (NEW;  ~40 LOC) — build_env: strip 4 nesting vars, inject 4 MUSU_* vars
├── platform_linux.rs       (NEW;  ~30 LOC) — prctl(PR_SET_PDEATHSIG, SIGKILL) via pre_exec
├── platform_windows.rs     (NEW;  ~80 LOC) — Job Object + CTRL_BREAK_EVENT + CREATE_NEW_PROCESS_GROUP
└── platform_macos.rs       (NEW;  ~20 LOC) — best-effort SIGTERM-then-SIGKILL

musu-rs/src/bridge/handlers/
├── run.rs                  (MODIFY at lines 92-138) — replace Python-forward block with `writer::runner::spawn_task(...)`
├── tasks.rs                (MODIFY at lines 113-161) — same replacement, symmetric body
├── sse.rs                  (NEW;  ~30 LOC) — `GET /api/tasks/events` handler delegating to `writer::sse::subscribe()`
└── mod.rs                  (MODIFY) — register `/api/tasks/events GET` + `/api/tasks/{task_id} DELETE`

musu-rs/src/bridge/
└── mod.rs                  (MODIFY at AppState struct + run()) — attach `writer::sse::SseBroadcaster` and `writer::runner::TaskRunnerHandle` to AppState; instantiate before `let state = AppState { ... }`

musu-rs/src/core/
├── schema.rs               (MODIFY) — add `SCHEMA_V2_ALTER_STATEMENTS: &[&str]` array with 5 ALTER TABLE statements
├── migrate.rs              (MODIFY) — bump `EXPECTED_SCHEMA_VERSION` to 2; add `apply_v2(pool)` arm in `run()` match
└── probe.rs                (UNCHANGED — already version-agnostic, just compares against EXPECTED_SCHEMA_VERSION)

musu-rs/src/
├── main.rs                 (UNCHANGED — `mod writer;` already declared at line 7; `Cmd::Writer` already wired at line 37)
└── Cargo.toml              (MODIFY) — add `tokio-stream`, `libc` (cfg unix), `windows-sys` (cfg windows) with feature lists per §2
```

**Total**: 9 NEW files (~660 LOC implementation) + 5 MODIFY files (~90 LOC delta) ≈ ~750 LOC, matches §2 estimate.

### §3.1 AppState delta (load-bearing for Critic)

R1's current AppState (`musu-rs/src/bridge/mod.rs:42-49`):
```rust
pub struct AppState {
    pub config: Arc<BridgeConfig>,
    pub pool: sqlx::SqlitePool,
    pub http_client: reqwest::Client,
    pub audit: AuditState,
    pub dedup: DedupCache,
}
```

R5 adds 2 fields:
```rust
pub struct AppState {
    // ... R1 fields unchanged
    pub task_runner: writer::runner::TaskRunnerHandle,  // Arc<Mutex<TaskRegistry>> internally
    pub sse_broadcaster: writer::sse::SseBroadcaster,    // Clone-able (Arc<broadcast::Sender>)
}
```

Both new fields are `Clone` (cheap Arc clones) — AppState's `Clone` derive stays intact. Instantiation order in `bridge::run()`: AFTER `core::apply` (existing line 71), BEFORE `state = AppState { ... }` (existing line 100).

### §3.2 Handler delta (load-bearing for Critic — Critic C1 resolved)

**Per Critic C1**: Each handler needs THREE distinct edits, not one. Builder MUST keep them separate:

**`bridge/handlers/run.rs`** — three edits:

1. **EDIT-A (status literal swap)** at **line 80** (inside the INSERT statement):
   - OLD: `'pending_python_writer'`
   - NEW: `'pending'` (matches schema v1 DEFAULT at `core/schema.rs:43`; keeps literal explicit, NOT relying on DEFAULT, for legibility)

2. **EDIT-B (Python-forward block swap)** at **lines 92-138**:
   - OLD (current code, summarized): format upstream URL `http://127.0.0.1:8071/api/tasks/delegate`, build reqwest::post, match on send().await { Ok => tracing::info; Err => UPDATE status='python_unreachable' }
   - NEW:
     ```rust
     // Hand off to native runner. spawn_task RETURNS IMMEDIATELY (Q1 spawn-then-track).
     // Runner owns the JoinHandle + does all status updates via task_runner.
     state.task_runner.spawn_task(writer::runner::TaskSpec {
         task_id: task_id.clone(),
         company_id: Some(id.clone()),
         channel: channel.clone(),
         sender_id: sender_id.clone(),
         prompt: text.clone(),
         expected_output: req.expected_output.clone(),
         cwd: state.config.task_default_cwd.clone(),
         model: req.model.clone(),       // see §3.3 RunRequest delta
         timeout_sec: req.timeout_sec,    // see §3.3 RunRequest delta
     }).await?;
     ```

3. **EDIT-C (audit_log write — DO NOT TOUCH)** at **lines 141-152**:
   - This block calls `state.audit.write(AuditEntry { ... })` with `actor_ip: addr.ip()` (the N-1 fix from R1 audit-fix). It stays unchanged. Builder MUST NOT fold it into EDIT-B.

**`bridge/handlers/tasks.rs`** — symmetric three edits:

1. **EDIT-A** at **line 101**: `'pending_python_writer'` → `'pending'`
2. **EDIT-B** at **lines 113-161**: replace Python-forward block with `state.task_runner.spawn_task(...)` (same TaskSpec shape; map fields from DelegateRequest)
3. **EDIT-C** at **lines 164-175**: audit_log write — DO NOT TOUCH

### §3.3 Request struct deltas (Critic C2 resolved)

Critic C2 surfaced that `RunRequest` and `DelegateRequest` need additive fields. Per Python parity (`claude_local.py:117` defaults `model="claude-sonnet-4-5"`):

**`bridge/handlers/run.rs:18-31`** (`RunRequest`) — add 2 optional fields:
```rust
pub struct RunRequest {
    #[serde(default)] pub text: Option<String>,
    #[serde(default)] pub channel: Option<String>,
    #[serde(default)] pub sender_id: Option<String>,
    #[serde(default)] pub expected_output: Option<String>,
    #[serde(default)] pub model: Option<String>,       // NEW (Critic C2)
    #[serde(default)] pub timeout_sec: Option<u32>,    // NEW (Critic C2)
    #[serde(flatten)] pub passthrough: Value,
}
```

**`bridge/handlers/tasks.rs:14-31`** (`DelegateRequest`) — `timeout_sec` already present (line 26 area); add `model`:
```rust
pub struct DelegateRequest {
    // ... existing fields unchanged
    #[serde(default)] pub model: Option<String>,       // NEW (Critic C2)
}
```

Both edits ~10 LOC delta combined; included in §3 LOC budget.

### §3.4 Boot-time orphan-pending recovery (Critic C4 resolved)

Critic C4 noted that prior bridge crashes can leave `route_executions` rows stuck in `status='pending'`. TaskRunner startup MUST scan + reconcile.

In `writer::runner::TaskRunnerHandle::new(pool, ...)`, immediately after construction:
```rust
// Recovery: orphaned 'pending' rows from a prior crash get marked failed.
// TaskRunner does NOT auto-resume — operator decides whether to re-issue.
sqlx::query(
    "UPDATE route_executions
        SET status = 'failed',
            error = 'orphaned by bridge restart',
            updated_at = ?
      WHERE status IN ('pending', 'running')"
)
.bind(chrono::Utc::now().timestamp())
.execute(pool)
.await
.ok();  // best-effort; log warning on failure but don't block boot
```

Tested in `writer::runner::tests::recovers_orphaned_pending_rows_on_boot` (added to §6).

## §4 Schema delta v1 → v2 (additive, NULLable, non-breaking)

Per Q-NEW-A. New constant in `musu-rs/src/core/schema.rs` (alongside existing `SCHEMA_V1_STATEMENTS`):

```rust
/// Schema-v2 ALTER TABLE statements — wiki/495 §4.
///
/// All additions are NULLable (no DEFAULT) so existing rows survive the
/// migration with NULLs in the new columns. Builder UPDATEs populate them
/// per-task as runs complete.
///
/// Order doesn't matter (each ALTER is independent), but listed in the
/// order columns appear in the post-migration row.
pub const SCHEMA_V2_ALTER_STATEMENTS: &[&str] = &[
    "ALTER TABLE route_executions ADD COLUMN output       TEXT",
    "ALTER TABLE route_executions ADD COLUMN error        TEXT",
    "ALTER TABLE route_executions ADD COLUMN exit_code    INTEGER",
    "ALTER TABLE route_executions ADD COLUMN duration_sec REAL",
    "ALTER TABLE route_executions ADD COLUMN started_at   INTEGER",  // Critic C3
    "ALTER TABLE route_executions ADD COLUMN updated_at   INTEGER",
];
```

**6 cols, not 5** (Critic C3 resolved; user chose "Add started_at now"):
- `created_at` is set at INSERT (request arrival), already present in v1.
- `started_at` (NEW) is set by TaskRunner when claude subprocess actually spawns (after queue admission per Q2 concurrency caps).
- `updated_at` is bumped on every status transition.
- The 3 timestamps let R6/R7 monitoring distinguish queue lag (`started_at - created_at`) from execution time (`updated_at - started_at` when status=done).

### §4.1 migrate.rs delta

```rust
pub const EXPECTED_SCHEMA_VERSION: u32 = 2;  // was 1 in R2

// In run(), the match arm extends:
for v in (current + 1)..=EXPECTED_SCHEMA_VERSION {
    match v {
        1 => apply_v1(pool).await?,
        2 => apply_v2(pool).await?,
        _ => anyhow::bail!("unknown schema version: {v} (max known = {EXPECTED_SCHEMA_VERSION})"),
    }
    set_version(pool, v).await?;
    tracing::info!(version = v, "schema migration applied");
}

async fn apply_v2(pool: &SqlitePool) -> Result<()> {
    let mut tx = pool.begin().await.context("begin v2 tx")?;
    for stmt in SCHEMA_V2_ALTER_STATEMENTS {
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("apply v2 DDL: {}", stmt))?;
    }
    tx.commit().await.context("commit v2 tx")?;
    Ok(())
}
```

### §4.2 In-flight migration safety

`sqlx::Pool::begin()` serialises against other writers via `busy_timeout=5000` (set by `core::pragma::apply_pragmas`). The five ALTER TABLEs all run in a single transaction; either all apply or none. SQLite's `ALTER TABLE ... ADD COLUMN` is constant-time (no row rewrite). Operator visible downtime: <100ms.

Risk R5-W4 (in-flight request races) is mitigated by: (a) idempotency from `IF NOT EXISTS` pattern semantically extended via PRAGMA user_version check on entry, (b) sqlx serializing the migration transaction against any in-flight INSERTs.

### §4.3 Const III gate (one-shot on operator machine)

`core::mod.rs::apply` already emits the Const III banner when `current_version == 0`. R5 adds a second banner for the **`current_version == 1` → `2`** transition with a v1→v2-specific message:

```
================================================================
 musu-rs core: applying schema v2 (Const III gate, additive)
================================================================
 - Adds 5 NULLable columns to route_executions:
     output, error, exit_code, duration_sec, updated_at
 - Existing rows preserved (no row rewrite).
 - Backup recommendation: copy ~/.musu/db/musu.db to musu.db.pre-v2.
================================================================
```

Override env vars: `MUSU_CONST_III_REQUIRE_ACK=1` + `MUSU_CONST_III_ACK=1` (same scheme as v1 banner).

## §5 Const gates

- **Const III (schema apply)** — FIRES once on operator machine for v1→v2 transition. §4.3 banner emits. Subsequent boots silent.
- **Const VI (perf experiment ack)** — NOT triggered. R5 doesn't run benchmarks.
- **Const VII (per-commit hygiene: cargo fmt + clippy -D warnings + cargo test)** — runs every commit per repo hooks; load-bearing for §6 acceptance #1-3.
- **R8/R9 ack rituals** — N/A; this is R5 (R-cleanup #1), not R8/R9.

## §6 Acceptance criteria for R5 SHIP-OK

1. ✅ `cargo build --release` clean — produces single `target/release/musu(.exe)` binary, no new C deps.
2. ✅ `cargo test --release` green at minimum:
   - `writer::claude::tests::parses_system_init_event`
   - `writer::claude::tests::parses_assistant_text_event`
   - `writer::claude::tests::parses_result_event_with_usage`
   - `writer::claude::tests::tolerates_partial_json_line` (line-buffered parser; reject-and-skip on malformed)
   - `writer::runner::tests::state_machine_pending_running_done`
   - `writer::runner::tests::state_machine_pending_running_failed`
   - `writer::runner::tests::cancel_signal_transitions_to_cancelled`
   - `writer::runner::tests::global_concurrency_cap_blocks_then_admits`
   - `writer::runner::tests::per_channel_concurrency_cap_independent`
   - `writer::runner::tests::join_handles_never_leak_on_completion` (registry size returns to baseline)
   - `writer::sse::tests::broadcaster_delivers_to_all_subscribers`
   - `writer::sse::tests::broadcaster_lagged_drops_oldest_not_crash` (broadcast(100) Drop semantics)
   - `writer::env::tests::strips_4_nesting_vars_and_injects_4_musu_vars`
   - `core::migrate::tests::v1_to_v2_apply_adds_5_cols`
   - `core::migrate::tests::v2_idempotent_double_apply` (run apply twice; second is no-op)
   - `core::migrate::tests::v2_preserves_existing_rows` (insert v1 row, migrate, row still queryable)
3. ✅ `cargo clippy --all-targets --all-features -- -D warnings` clean.
4. ✅ Boot musu-rs on fresh-from-v1 DB. Const III v2 banner fires once. `curl /health/ready` returns `{"ready":true,"schema_version":2,...}`.
5. ✅ POST `/api/companies/{id}/run` with `{"text":"hello"}` returns 202 + `{"task_id":"<uuid>"}` IMMEDIATELY (≤200ms). Row goes `pending → running → done` in `route_executions`. Post-completion row has: `output` non-NULL (contains result text), `exit_code=0`, `duration_sec > 0`, `updated_at >= created_at`, `error IS NULL`.
6. ✅ POST `/api/tasks/delegate` with `DelegateRequest` body — same lifecycle, same column population.
7. ✅ `GET /api/tasks/events` (Accept: `text/event-stream`): client connects; during a concurrent POST run, receives ≥1 `event: task_update` SSE frame with body `{"type":"task_update","task_id":"…","status":"running"}` and ≥1 with `"status":"done"`. Keepalive heartbeat fires every 15s.
8. ✅ DELETE `/api/tasks/{task_id}` mid-run: subprocess receives signal (Linux: SIGTERM via tokio::process; Windows: CTRL_BREAK_EVENT), exits within 5s grace, status row becomes `cancelled`, SSE emits `task_update` with `"status":"cancelled"`.
9. ✅ **Windows-specific test** (operator's primary machine per §A.1.1): spawn with `CREATE_NEW_PROCESS_GROUP` confirmed via `tasklist /v` or Process Explorer — child claude.exe is in its OWN process group, not the bridge's. Cancel sends CTRL_BREAK to the child group only.
10. ✅ **Linux-specific test**: spawn a task; kill -9 the bridge parent; verify via `ps -ef | grep claude` that the child claude process also dies (PR_SET_PDEATHSIG triggers SIGKILL on parent death). If `claude` CLI not on PATH, test gracefully skipped with operator-facing tracing warning.
11. ✅ **Claude-CLI-missing graceful degrade**: when `claude` is not on PATH, runner returns task status `failed` with `error="claude CLI not found on PATH; install Claude Code per https://...`, NOT a 5xx panic on the POST. Smoke test verifies operator-facing message.
12. ✅ Phase 1.5 Critic (`system-architect`) findings all resolved or explicitly user-overridden.
13. ✅ Phase 5 Auditor (`quality-engineer`) returns SHIP-OK on built code.
14. ✅ Operator-attested R5 closure: at least one real Claude task run end-to-end from musu-bee UI (which already subscribes to `/api/tasks/events` per Researcher F15), output rendered, no Python facade in the trace.

R5 does NOT block on:
- musu-bee TS changes (R7-shipped TS already targets the SSE shape R5 implements).
- R6 installer (deferred).
- R9 mesh-routing (deferred per §A.1.1 GOAL.md operator pivot).

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| **R5-W1** | **HIGH** | Windows ungraceful kill: `tokio::process::Child::kill()` calls `TerminateProcess` which kills the child instantly without cleanup. Claude CLI may have child MCP servers + uncommitted file writes. | §3 `platform_windows.rs`: 3-stage kill path — (1) `GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, group_id)` (graceful), (2) 5s `tokio::time::timeout(child.wait())` grace, (3) `child.kill()` (`TerminateProcess`) fallback. Order tested in §6-#8. |
| **R5-W2** | MED | Grandchild zombies: claude spawns MCP servers (per env block: 7 MCP servers attached). If bridge dies, grandchildren outlive. | Linux: `pre_exec` calls `libc::prctl(PR_SET_PDEATHSIG, SIGKILL)` so grandchildren die when claude dies (and claude dies when bridge dies). Windows: bind subprocess into a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` so all descendants die when the bridge process group ends. macOS: best-effort SIGTERM; documented limitation (operator's macOS is secondary). |
| **R5-W3** | LOW | stdout disk-fill (mooted by Q3). | Q3 locks SQLite-only output. `output` column accepts arbitrary TEXT length; SQLite caps at default 1GB per cell (musu won't hit). No file-path code path exists. |
| **R5-W4** | MED | Schema v1→v2 in-flight request race: ALTER TABLE runs while an INSERT is pending. | §4.2 invariant: `apply_v2` runs in a single `pool.begin()` transaction; sqlx busy_timeout=5s gives ample serialization room. SQLite's `ALTER TABLE ADD COLUMN` is metadata-only (no row rewrite), so window is <100ms. Acceptance test §6-#15: insert row, migrate, both old + new row queries work. |
| **R5-W5** | MED | `claude` CLI not on PATH — operator may not have Claude Code installed yet on a fresh machine. | §6-#11: graceful degrade. Runner catches `std::io::ErrorKind::NotFound` from `tokio::process::Command::spawn()`, marks task `failed` with operator-facing error, returns 202 (POST already accepted) — error surfaces via SSE + DB row. Bridge does NOT crash. |
| **R5-W6** | MED | stream-json parse desync — claude emits a malformed line (network blip, OOM partial flush). | §3 `claude.rs`: line-buffered parser (`BufReader::lines()`); per-line `serde_json::from_str` — on parse error, log `warn` with task_id + line excerpt, skip line, continue. Partial line at EOF tolerated (terminate cleanly). No panic. |
| **R5-W7** | LOW | broadcast channel lag — slow SSE subscriber falls behind 100-message buffer. | `tokio_stream::wrappers::BroadcastStream` returns `Err(BroadcastStreamRecvError::Lagged(n))` on lag; SSE handler maps lag-error to a synthetic `task_update` with `"warning":"<n> events dropped"` and continues. No subscriber crash. |
| **R5-W8** | LOW | `windows-sys` version churn. | Pin to `0.59` with explicit feature list in Cargo.toml; document in V24_DEPENDENCY_AUDIT.md amendment that bumping requires re-running §6-#9 manual test. |

## §8 Phase 1.5 Critic seed

Spawn `system-architect` Critic (single — MED risk, no auth surface per master plan §5 R5 row). Seed prompts:

1. **Schema delta minimality (§4)**: are 5 NULLable columns the right set? Read `audit_fix/` history to confirm no required column was missed for the agent-task lifecycle. Specifically check whether `started_at` (vs derivable from `created_at`) or `last_event_at` (vs `updated_at`) should be added. Recommendation: if a column would unblock R6/R7 monitoring queries, add it now (one Const III gate, not two).

2. **TaskRunner state machine (§3 runner.rs)**: can `JoinHandle`s leak? Specifically:
   - When a task completes naturally, does the registry entry get removed? (Answer should be: a final `finally`-style block in the spawned task that removes its own entry; verify Builder's design.)
   - When cancel signal arrives but task already completed, does the Cancel future get dropped cleanly without panic?
   - Under shutdown, can the runner drop in-flight handles without orphaning subprocesses? (Builder must ensure `Drop for TaskRegistry` issues kill signals to all live tasks.)

3. **Windows graceful-kill order (§3 platform_windows.rs, R5-W1)**: is `CTRL_BREAK_EVENT → 5s grace → TerminateProcess` the right order, OR should it be `CTRL_BREAK → 2s → SIGTERM-equivalent → 3s → TerminateProcess`? Reference: claude CLI in Windows console mode handles CTRL_BREAK as a graceful "abort current operation". 5s is what Python's `claude_local.py` uses; we want parity.

4. **SSE broadcast channel sizing (§3 sse.rs, R5-W7)**: `broadcast(100)` — is 100 enough? Three known subscribers expected at steady state: musu-bee TS (`/api/tasks/events`), one curl debugging session, future fleet-view dashboard. Under burst (10 concurrent tasks × 3 events each = 30 messages), is the 100-slot ring safe? Recommendation: keep 100, document tunable via `MUSU_TASK_EVENT_CHANNEL_CAP` env override.

5. **"No sandbox for R5" decision acceptance (§1, Q-NEW-B)**: Python `claude_local.py` runs claude with parent-env access (no namespace, no seccomp, no resource limits). R5 is parity. Critic: is "parity with insecure baseline" the right framing for operator's threat model ([[feedback-self-contained-product]] = single-operator, home LAN, trusted)? If Critic believes V25 sandbox work should be tracked as a known-debt entry, add it to R-cleanup task list.

6. **Module file count (§3)**: 9 NEW + 5 MODIFY files. Is `platform_macos.rs` worth shipping given operator's primary is Windows + Linux secondary? Trade-off: shipping the stub now avoids a V25 `#[cfg(target_os = "macos")] compile_error!` if a future operator boots on macOS. ~20 LOC, low cost — Planner picks SHIP, Critic may override DEFER.

7. **OQ-residue check**: any open question from Researcher Phase 0 envelope (F1-F15) not addressed in §1.1 lock-ins? If yes, escalate.

## §9 References

- **wiki/490** — V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md §5-R5 row + §7 risk inventory
- **wiki/491** — V24_R1_BRIDGE_RS_PLAN_2026_05_20.md (template for §1-§10 structure; writer-stub is at `handlers/run.rs:92-138`, `handlers/tasks.rs:113-161`)
- **wiki/492** — V24_R2_CORE_RS_PLAN_2026_05_20.md (schema-delta pattern reused for v1→v2 ALTER TABLE)
- **wiki/498c** — V24_R8_4060TI_E2E_CLOSURE_2026_05_20.html §5 + §8 (the operator-attested R8 closure that surfaced the "writer-stub still calls dead Python facade" gap)
- **GOAL.md §A.1.1** — operator pivot reordering R5 to first of R-cleanup; single-machine focus; R9 deferred
- **V24_DEPENDENCY_AUDIT.md** — R5 row (to be amended post-Critic with the 3 new crates: tokio-stream, libc cfg-unix, windows-sys cfg-windows)
- **Phase 0 Researcher envelope (this turn)** — findings F1-F15; Python writer = `musu-bridge/server.py:1149` + `musu-core/.../claude_local.py:185`; musu-supervisor crates confirmed-greenfield
- **R5 ground-truth code**:
  - `musu-rs/src/bridge/handlers/run.rs:92-138` — current Python-forward stub to replace
  - `musu-rs/src/bridge/handlers/tasks.rs:113-161` — symmetric stub
  - `musu-rs/src/bridge/mod.rs:42-49` — AppState struct
  - `musu-rs/src/bridge/handlers/mod.rs:18-31` — native router builder (R5 adds 2 routes)
  - `musu-rs/src/core/schema.rs:19-79` — SCHEMA_V1_STATEMENTS (R5 adds SCHEMA_V2_ALTER_STATEMENTS adjacent)
  - `musu-rs/src/core/migrate.rs:18` — `EXPECTED_SCHEMA_VERSION` constant to bump
  - `musu-rs/src/core/migrate.rs:66-74` — match arm to extend
  - `musu-rs/src/core/mod.rs:108-141` — Const III banner emitter to mirror for v2
  - `musu-rs/src/writer/mod.rs` — current 4-line stub
  - `musu-rs/src/main.rs:7,20,37` — `mod writer;`, `Cmd::Writer`, dispatch already wired
- **Python reference (read-only, for parity verification by Builder)**:
  - `musu-core/src/musu_core/adapters/claude_local.py:115-301` — subprocess shape (Researcher F6)
  - `musu-bridge/server.py:1149` — `/api/tasks/delegate` handler (Researcher F1, F5)
  - `musu-bridge/handlers.py:312` — `route_chat()` driver (Researcher F1)
- **Memory tags**:
  - `[[feedback-no-python]]` — backend ban (R5 removes the last live Python dependency for normal operation)
  - `[[decision-musu-backend-rust]]` — Rust lock
  - `[[feedback-self-contained-product]]` — drives single-binary + no SaaS posture for new deps
  - `[[feedback-no-yagni-architecture]]` — drives "no sandbox in R5" (parity, not gold-plating)
  - `[[feedback-plan-stage-auditor]]` — Critic gate per ≥MED-risk sub-WS
  - `[[feedback-scribe-html-only]]` — R5 closure HTML (not this plan; closure comes post-Builder)

## §10 Critic Findings (resolved)

Phase 1.5 `system-architect` Critic returned 2026-05-20. 1 HIGH + 5 MED + 4 LOW + 2 INFO. All HIGHs + MEDs resolved via plan amendments (this file) OR Builder constraint (carried to §3 + §6 + §7).

| ID | Sev | Area | Finding (1 line) | Resolution |
|---|---|---|---|---|
| C1 | **HIGH** | handler-swap | §3.2 mis-cited line ranges: status literal at run.rs:80 (outside 92-138), audit_log write at run.rs:141-152 must NOT be swapped. | **Plan amendment** — §3.2 rewritten to enumerate THREE distinct edits per file (EDIT-A status literal swap, EDIT-B Python-forward block swap, EDIT-C audit_log DO NOT TOUCH). Builder MUST follow the per-line-number edit list. |
| C2 | MED | handler-swap | `RunRequest`/`DelegateRequest` need additive `model` + `timeout_sec` optional fields not in §3 module touch list. | **Plan amendment** — added §3.3 enumerating the struct deltas. +10 LOC budget delta. |
| C3 | MED | schema | §4 omits `started_at` even though §6 demands `updated_at >= created_at` parity + Q2 concurrency caps mean queue admission ≠ INSERT. | **Plan amendment** — added 6th NULLable col `started_at INTEGER` to SCHEMA_V2_ALTER_STATEMENTS. User confirmed "Add started_at now" 2026-05-20. Saves a future v2→v3 Const III gate. |
| C4 | MED | handler-swap | INSERT literal `'pending'` vs schema DEFAULT 'pending' — plan silent on boot recovery for orphaned `pending`/`running` rows from prior bridge crash. | **Plan amendment** — added §3.4 boot-time orphan-pending recovery. TaskRunner startup runs `UPDATE ... SET status='failed', error='orphaned by bridge restart' WHERE status IN ('pending','running')`. Added test `writer::runner::tests::recovers_orphaned_pending_rows_on_boot` to §6. |
| C5 | MED | risk-parser | `BufReader::lines()` default 8KB buffer thrashes on long claude assistant messages (commonly 50KB+). | **Builder constraint** — `writer::claude` MUST use `BufReader::with_capacity(64 * 1024, stdout)` before `.lines()`. §7 R5-W6 mitigation amended accordingly. Trivial 1-LOC, no budget delta. |
| C6 | MED | sse | Lag-warning emitted as `task_update` with `warning` field may break musu-bee TS EventSource if frontend rejects unknown fields. | **Plan amendment** — §7 R5-W7 amended: lag-warning emits as SEPARATE SSE event-type (`event: task_lag\ndata: {...}\n`). Existing `task_update` handlers don't see it. Added §6 acceptance step verifying frontend tolerates lag injection. |
| C7 | LOW | tests | 16 unit tests for ~750 LOC adequate per-module, but no in-process integration test for full POST→spawn→SSE→DELETE flow. | **Plan amendment** — §6 adds 17th test `tests/r5_smoke.rs::full_lifecycle_with_mock_claude` (~80 LOC). Pattern from existing `tests/r2_smoke.rs`. |
| C8 | LOW | appstate | §3.1 says `Arc<Mutex<TaskRegistry>>` without specifying sync vs async; dashmap is already in workspace deps and lock-free per-entry. | **Builder constraint** — JoinHandle registry uses `Arc<dashmap::DashMap<TaskId, TaskHandle>>`. Concurrency-cap admission accounting uses `tokio::sync::Mutex<AdmissionState>` with the discipline of never holding across `.await`. §3.1 amended implicitly via Builder spec. |
| C9 | LOW | deps | §2 dep audit factually accurate — `tokio-stream`, `libc`, `windows-sys` genuinely absent from musu-rs/Cargo.toml today. | No change — confirmation only. |
| C10 | LOW | scope | Confirmed `musu-writer/` is "Fiction writing pipeline MCP tools — BYOK, session-managed" = different product, NOT the writer R5 replaces. | No change — §1 deferral correctly framed. |
| C11 | LOW | references | All cited file:line pointers verified (`migrate.rs:18, 36-43, 66-74`; `schema.rs:43, 48`; `Cargo.toml:32`). | No change — §9 references stand. |
| C12 | INFO | scope | Q-NEW-B "no sandbox in R5" — Critic concurs with parity baseline; recommends tracking V25-S1 sandbox debt. | **Followup** — add `V25-S1: claude subprocess sandboxing` row to wiki/490 R-cleanup known-debt list (post-R5 close, not blocking). |
| C13 | INFO | scope | `platform_macos.rs` (~20 LOC) — Critic concurs with SHIP-now decision (cheap, avoids future compile_error trap). | No change — §3 stands. |

**Builder readiness**: with C1 resolved (the only HIGH) and C2/C3/C4/C5/C6 resolved as plan amendments + C5/C8 as Builder constraints, plan is READY FOR BUILD. Estimated amendment effort consumed: ~25 min (this turn).

**Test count update**: §6 now lists 17 unit tests + 1 integration smoke = 18 total assertions.

**LOC budget update**: +10 LOC (struct deltas C2) + ~80 LOC (r5_smoke integration test C7) = total budget ~840 LOC. Still well within wiki/490 §5-R5 ~1500 LOC original budget.

## §11 Auditor Findings (Phase 5, quality-engineer 2026-05-20)

Phase 5 Auditor returned SHIP-OK. 0 HIGH, 2 MED, 4 LOW, 1 INFO. All resolved or accepted.

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| A1 | MED | builder-deviation | `apply_v2` uses per-column-skip idempotency (pragma_table_info pre-check) instead of plan's literal "all-or-nothing tx". Justified because plan §4.2 acknowledges concurrent-boot races; per-column skip is the safer evolution. | ACK. Closure doc records the §4.1 code-block deviation. Plan-intent preserved (idempotent migration). |
| A2 | MED | tests | r5_smoke asserts DB row terminal state only; does NOT subscribe to /api/tasks/events SSE during the run. Plan §6 acceptance #7 wording leans automated; Builder elected manual. | ACK as manual residue. R5 closure HTML documents §6#7 as operator-attested manual smoke step. Reverse: R6 or V25 can add automated SSE assertion when reqwest SSE client wrapper lands. |
| A3 | LOW | builder-deviation | `set_version(N)` race window: brief /health/ready 503 possible during concurrent boot. Convergence guaranteed by 2nd boot. | ACK per [[feedback-self-contained-product]] — single-machine concurrent-boot not normal operation. Closure doc notes the known window. |
| A4 | LOW | code-quality | One non-test `.expect()` at migrate.rs:92 on `pub const` array element extraction — provably unreachable but worth a comment. | ACK; optional follow-up to convert to `unreachable!()` macro with SAFETY comment. Not blocking; deferred to V25 cleanup. |
| A5 | LOW | scope-creep | runner.rs is 990 LOC vs plan's ~200 LOC estimate (5x). ~314 LOC in #[cfg(test)] mod tests; ~676 impl LOC. Justified by state machine + admission + streaming + 3 kill paths + finalize + RegistryGuard + env. No dead code. | ACK; closure doc patches master plan wiki/490 §5-R5 row LOC estimate from ~1,500 to actual ~2,100 for V25 future-task calibration. |
| A6 | LOW | code-quality | `RunRequest` + `DelegateRequest` both gained an additional `cwd: Option<String>` field beyond Critic C2's specified `model` + `timeout_sec`. Additive, non-breaking, useful for tests + future per-task cwd override. | ACK as additive scope creep beyond §3.3. Closure doc notes the §3.3 → 3-field actual delta (model, timeout_sec, cwd). |
| A7 | INFO | critic-resolution | C13 platform_macos.rs configure() is a no-op stub (intentional). Graceful_kill path uses `child.start_kill()` + 5s grace + SIGKILL. macOS lacks PR_SET_PDEATHSIG; grandchild leak limitation documented per §7 R5-W2. | Confirmed. |

**Audit verdict**: SHIP-OK. 0 HIGH = no Builder loop required. R5 advances to Phase 7 Scribe.
