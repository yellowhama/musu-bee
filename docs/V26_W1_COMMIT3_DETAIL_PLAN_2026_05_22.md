# V26-W1 Commit 3 Detail Plan — claude shim + registry dispatch + typed AgentRecord

**Wiki ID**: wiki/509 (W1 plan) ← this is the Commit 3 detail; closure = wiki/509c
**Date**: 2026-05-22
**Branch**: `v26/distributed-actor`
**Cycle**: M1 (closes W1 chokepoint per `~/.claude/plans/shimmying-plotting-hamster.md`)
**Master plan**: `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W1 row + §3 strict sequential
**W1 plan v2**: `docs/V26_W1_OPENAI_COMPAT_ADAPTER_2026_05_22.md` (Commit 1 + 2 SHIP, Commit 3 = this)
**Prior handoff**: `docs/V26_W1_HANDOFF_AFTER_COMMIT2_AUDIT_2026_05_22.md`
**LOC target**: ~200 est × 3.8 = **~750 actual** (M1 cycle remainder of W1's 2,280-LOC ceiling, ~550 LOC already consumed by Commits 1+2 net of plan/test docs)
**Builder**: `backend-architect` (Rust-experienced; not python-expert)
**Critic**: `system-architect` single (no auth/install/migration/one-way trigger per [[feedback-dual-audit-trigger-narrow]])
**Auditor**: `quality-engineer` single

---

## §1 Recap — what Commit 3 closes, why W1 is the chokepoint

V26 master plan §3 declares **strict sequential** `W1 → W7 → W12 → W9 → W13 → W10`. W7/W12/W9/W13/W10 cannot start until W1's adapter trait + dispatch surface land, because every downstream sub-WS depends on `AdapterContext` shape (W12 populates `deadline_unix_ms`+`cancel`, W9 passes LLM calls through it, W13 mounts MCP tools that fan out via the registry). Commits 1+2 shipped the `Adapter` trait, `OpenAICompatAdapter` (Ollama/vLLM/LM Studio), and 10 wiremock tests, but the **existing claude subprocess path at `writer/runner.rs:273` still calls `claude::spawn` directly** — it's not yet a registered adapter. Until that boundary is registered, `TaskSpec` has no `adapter_type` field, `CompanyRecord.agents` is untyped `Vec<Value>`, and the V26 master plan §2 W1 row still describes "2 variants" instead of "1 unified + 3 BackendKind enum + claude shim". Commit 3 closes those four gaps and unblocks M2.

Commit 3 is intentionally surgical: it inserts a *narrow dispatch boundary* (returns `Child`, not `AdapterResult`) so the runner's 100-line stream loop, admission accounting, and SSE publish flow stay bit-for-bit identical to V24-R5 SHIP. Full `Adapter::execute` integration into the hot path is deferred to M3 (W12) when deadline+cancel propagation needs to unify across adapter types.

---

## §2 Deliverable file list

| # | Path | Action | LOC est | Notes |
|---|---|---|---|---|
| 1 | `musu-rs/src/adapter/claude.rs` | new | ~140 | `ClaudeAdapter` struct + `impl Adapter` + `claude_dispatch()` helper |
| 2 | `musu-rs/src/adapter/mod.rs` | edit | +2 / -0 | `pub mod claude;` |
| 3 | `musu-rs/src/adapter/registry.rs` | edit | +6 / -3 | add `"claude" => Box::new(ClaudeAdapter)` arm; remove the TODO comment |
| 4 | `musu-rs/src/writer/runner.rs` | edit | +47 / -2 | `TaskSpec.adapter_type: String` field; dispatch at line 273 via new `claude_dispatch_spawn()` helper that preserves stream loop; **6 in-file test-site literals at L795/825/856/893/931/963 each need `adapter_type: "claude".into()` added** (Critic HIGH-1); `graceful_kill` at L576 must be marked `pub(crate)` for shim reuse (Critic HIGH-2) |
| 5 | `musu-rs/src/core/companies.rs` | edit | +60 / -3 | `AgentRecord` typed struct; `agents: Vec<serde_json::Value>` → `Vec<AgentRecord>` (line 54); `record_from_create` updated |
| 6 | `musu-rs/src/bridge/handlers/tasks.rs` | edit | +6 / -0 | `DelegateRequest.adapter_type: Option<String>`; forward to `TaskSpec` at line 130 |
| 7 | `musu-rs/src/bridge/handlers/run.rs` | edit | +6 / -0 | `RunRequest.adapter_type: Option<String>`; forward to `TaskSpec` at line 115 |
| 8 | `musu-rs/tests/agent_record_backward_compat.rs` | new | ~110 | V24-R6 synthetic YAML deserialize + round-trip + `extra` preservation |
| 9 | `musu-rs/tests/adapter_real_backend_smoke.rs` | new (optional) | ~90 | `#[ignore = "operator-attested; real Ollama required"]` happy-path |
| 10 | `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W1 row | edit | ~2 lines | F1 frame correction |

**Total**: ~457 LOC + new-test scaffolding ~200 = **~660 net touch**, within M1's ~750 target (master plan §"M1 Detail" LOC est).

**Out of LOC accounting**: V26 master §2 W1 row update is ~2 lines doc-only (F1).

---

## §3 Reuse must — do NOT re-implement these

The shim's job is to be **thin**. The following 7 items at exact file:line are LOCKED for re-use. Re-implementing any of them is an Auditor HIGH finding. Evidence is the existing V24-R5 SHIP that runs in production today.

| # | API | File:line | Why re-use |
|---|---|---|---|
| R1 | `claude::spawn(spec) -> io::Result<Child>` | `musu-rs/src/writer/claude.rs:154-197` | Subprocess command shape (`--print -`, stream-json, env_clear, kill_on_drop, platform configure); V24-R5 SHIP semantics |
| R2 | `claude::buffered_stdout(&mut Child) -> Option<BufReader<...>>` | `musu-rs/src/writer/claude.rs:215-220` | 64KB BufReader (Critic C5 from R5); >50KB lines safe |
| R3 | `claude::next_event(reader, &mut line_buf)` | `musu-rs/src/writer/claude.rs:223-236` | Async stream-json line read + parse |
| R4 | `claude::parse_line(line)` | `musu-rs/src/writer/claude.rs:204-212` | RawEvent → ClaudeEvent classification |
| R5 | `env::build_env(envelope)` | `musu-rs/src/writer/env.rs:32-48` | 4-nesting-var strip + 4 MUSU envelope inject (`MUSU_TASK_ID/AGENT_ID/RUN_ID/PAPERCLIP_COMPANY_ID`) |
| R6 | `platform_windows::JobObject::assign(pid)` + `platform_windows::send_ctrl_break(pid)` + `platform_linux::configure(cmd)` + `platform_macos::configure(cmd)` + `runner::graceful_kill` (elevated to `pub(crate)` in M1) | `musu-rs/src/writer/platform_*.rs` (windows.rs:40,52,116; linux.rs:17; macos.rs:13) + `musu-rs/src/writer/runner.rs:576` | Cross-platform process group + graceful-kill. Critic HIGH-2: `graceful_kill` was `async fn` (private to runner module); M1 elevates it to `pub(crate)` so the shim's `execute()` can reuse the same kill path. Re-exported from `writer/mod.rs` |
| R7 | `runner.rs` admission control + graceful_kill + stream_until_done | `musu-rs/src/writer/runner.rs:430-468` (admission), `:576-600` (graceful_kill), `:477-534` (stream_until_done) | All of this stays in `run_one`, untouched by Commit 3 |

**Anti-pattern (must NOT do)**: Re-implementing the claude subprocess `Command::new(...).args([...])` inside `ClaudeAdapter::execute`. The shim **calls** `claude::spawn(spec)`; it does not duplicate the command shape.

---

## §4 ClaudeAdapter shim design

### §4.1 Module layout

```rust
// musu-rs/src/adapter/claude.rs

use super::{Adapter, AdapterContext, AdapterError, AdapterResult};
use crate::writer::claude::{self, ClaudeEvent, SpawnSpec};
use async_trait::async_trait;

/// Zero-state shim — V26-W1 Commit 3 wiki/509.
///
/// The shim's job is to register "claude" as an Adapter so the registry
/// dispatch is uniform across providers. The production hot path remains
/// `writer/runner.rs:273 → claude_dispatch_spawn() → claude::spawn()`,
/// which preserves the V24-R5 stream loop bit-for-bit.
///
/// `Adapter::execute` is provided for trait-completeness (and for downstream
/// W9/W13 callers that need a unified `execute()` surface), but it builds
/// the same `SpawnSpec` and drives the same `next_event` loop the runner
/// drives — just without the SSE/DB integration that lives in `run_one`.
pub struct ClaudeAdapter;
```

### §4.2 Two integration surfaces

The shim exposes **two** entry points:

**(a) `Adapter::execute(&self, ctx) -> Result<AdapterResult, AdapterError>`** — registry-callable.
Used by W9/W13 downstream tooling that needs a uniform `execute()`. Builds a `SpawnSpec` from `AdapterContext`, spawns, drains stream, returns `AdapterResult`.

**(b) `pub fn build_spawn_spec(ctx: &AdapterContext, default_command: &str) -> SpawnSpec`** — runner-callable.
Used by `writer/runner.rs:273` (replacing the inline `SpawnSpec { ... }` literal). Returns a `SpawnSpec` so the runner's existing stream loop, admission, SSE, and finalize flow stays intact.

This dual surface is the *narrow dispatch boundary* decision: M1 keeps runner.rs:325-358 intact. M3 (W12) may unify both surfaces once deadline+cancel propagation is plumbed through.

### §4.3 AdapterContext → SpawnSpec mapping

| `AdapterContext` field | `SpawnSpec` field | Notes |
|---|---|---|
| `ctx.run_id` | `task_id` | runner's existing usage |
| `ctx.prompt` | `prompt` | direct |
| `ctx.agent_id` | `agent_id` | wrapped in `Some(_)` |
| `ctx.cwd.clone().unwrap_or_else(\|\| current_dir())` | `cwd` | falls back to `std::env::current_dir()` |
| `ctx.config_json.get("model").and_then(...)` | `model` | typed parse, optional |
| `ctx.config_json.get("timeout_sec").and_then(...)` | `timeout_sec` | typed parse, optional |
| `ctx.config_json.get("company_id").and_then(...)` OR `ctx.extra["company_id"]` | `company_id` | optional |
| `ctx.session_id.clone()` | `run_id` | claude `--session` if present (note SpawnSpec calls it `run_id`) |
| `ctx.extra["claude_binary"].as_str().unwrap_or("claude")` | `command` | env-var fallback `MUSU_CLAUDE_BINARY` lives at runner construction time, not in shim |

### §4.4 Cancellation wiring

`AdapterContext.cancel: Option<Arc<Notify>>` is the W12 preempt slot (currently `None` in W1).
For Commit 3, the shim's `execute()`:
- If `ctx.cancel.is_some()`, `tokio::select!` on `cancel.notified()` alongside `next_event(...)`.
- On cancel: invoke `runner::graceful_kill(&mut child, pid)` — **the SAME function the runner uses** (per R6, elevated to `pub(crate)` in M1). Shim does NOT duplicate kill logic.
- If `ctx.cancel.is_none()`, just drive the loop to completion (W1-equivalent behavior).

This satisfies §4.2 of the W1 plan (D2 W12 preempt field) without M1 having to wait for W12. **Critic HIGH-2 resolution**: `graceful_kill` at `runner.rs:576` was `async fn` private to the runner module; M1 changes signature to `pub(crate) async fn` so the shim can call it as `crate::writer::runner::graceful_kill(...)` or via a `writer/mod.rs` re-export.

### §4.5 Error mapping table — subprocess outcome → `AdapterError`

| Subprocess outcome | `AdapterError` variant |
|---|---|
| exit code 0, `had_error=false` | `Ok(AdapterResult { success: true, ... })` |
| exit code N!=0 OR `had_error=true` (claude `is_error` flag in result event) | `Err(AdapterError::Unknown(format!("claude exited code {N}; had_error={...}")))` |
| `StreamOutcome::Timeout` (per-iter deadline elapsed) | `Err(AdapterError::Timeout)` (retriable per `is_retriable()`) |
| `StreamOutcome::Cancelled` (cancel.notified) | per [[adapter-error-shape]] note: `Err(AdapterError::Unknown("cancelled by operator"))` — there is no `Cancelled` variant in the 5-variant enum per Critic C5 lock |
| `StreamOutcome::IoError(e)` | `Err(AdapterError::Unknown(format!("stdout read error: {e}")))` |
| `claude::spawn` `ErrorKind::NotFound` | `Err(AdapterError::ModelUnavailable)` — semantically "the requested adapter cannot run because the underlying CLI is unavailable" (retriable so operator-fix loop works) |
| `claude::spawn` other io error | `Err(AdapterError::Unknown(format!("spawn failed: {e}")))` |

Note: the runner's existing `run_one` at `writer/runner.rs:273-310` keeps its current finer-grained error handling (it writes `route_executions.error=...` strings, not `AdapterError`). The `AdapterError` mapping above only applies to `ClaudeAdapter::execute()` — i.e., the registry-callable path, not the runner-callable path.

### §4.6 Two-surface contract (locked)

```
                          runner.rs:273 (existing hot path)
                                  |
                                  v
                  ClaudeAdapter::build_spawn_spec(ctx, default_command)
                                  |
                                  v  returns SpawnSpec
                       claude::spawn(&spawn_spec) ──► Child
                                  |
                       runner.rs:325-358 stream loop (unchanged)
                                  |
                                  v
                       runner.rs:411-421 finalize (unchanged)


                          adapter::registry::dispatch("claude", &ctx)
                                  |
                                  v
                          ClaudeAdapter::execute(&ctx)
                                  |
                                  v
                          (internally: build_spawn_spec → claude::spawn →
                           buffered_stdout → next_event loop → return AdapterResult)
```

Both surfaces converge on `claude::spawn`. The shim **does not** re-build the `Command::new(...)` literal anywhere.

---

## §5 Registry dispatch edit — `adapter/registry.rs`

Current (`registry.rs:10-23`):
```rust
match adapter_type {
    "openai_compat_local" | "openai_compat_remote" => Ok(Box::new(OpenAICompatAdapter)),
    // Commit 3 populates this with the claude shim.
    // "claude" => { ... }
    _ => Err(AdapterError::Unknown(format!(
        "adapter type not yet implemented in commit 1 skeleton: {}",
        adapter_type
    ))),
}
```

After Commit 3:
```rust
match adapter_type {
    "openai_compat_local" | "openai_compat_remote" => Ok(Box::new(OpenAICompatAdapter)),
    "claude" => Ok(Box::new(crate::adapter::claude::ClaudeAdapter)),
    _ => Err(AdapterError::Unknown(format!(
        "adapter type not registered: {}",
        adapter_type
    ))),
}
```

Also: update `adapter/mod.rs` to include `pub mod claude;`.

**Acceptance**: existing `dispatch_unknown_returns_unknown_error` test (`registry.rs:45-56`) still passes (uses literal `"unknown"`). New test `dispatch_claude_returns_claude_adapter` asserts `dispatch("claude", &ctx).is_ok()`.

---

## §6 TaskSpec.adapter_type edit — `writer/runner.rs:78-90`

Insert after line 88 (`pub model: Option<String>,`):

```rust
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
    /// = "claude" applied at the HTTP handler boundary via
    /// `req.adapter_type.unwrap_or_else(|| "claude".into())`. Inside the
    /// runner this field is a required `String`, never `None`.
    pub adapter_type: String,
}
```

**Canonical default (Critic MEDIUM-1 lock)**: handler-side `unwrap_or_else("claude")` is the ONE place the default lives. There is no `default_adapter_type()` helper function — Builder must NOT add one. Test-site literals in `runner.rs::tests` (L795/825/856/893/931/963 per Critic HIGH-1) initialize `adapter_type: "claude".into()` explicitly, NOT via a helper.

`TaskSpec` is `#[derive(Debug, Clone)]` only (no Serialize/Deserialize today). The struct is purely internal — `bridge/handlers/{tasks,run}.rs` is the wire-format boundary. If a future M2/M3 adds Serialize/Deserialize to `TaskSpec`, the field would gain `#[serde(default = "default_adapter_type")]` at that time AND add the helper. M1 deliberately keeps the surface minimal.

### §6.1 Test-site literal fixes (Critic HIGH-1)

The following 6 test-site literals in `runner.rs::tests` MUST add `adapter_type: "claude".into(),` as the LAST field before the closing brace:

| Line | Test fn | Current last field | Add |
|---|---|---|---|
| ~795 | `state_machine_pending_running_done` | `timeout_sec: Some(10),` | `adapter_type: "claude".into(),` |
| ~825 | `state_machine_pending_running_failed` | `timeout_sec: Some(10),` | same |
| ~856 | `cancel_signal_transitions_to_cancelled` | `timeout_sec: Some(120),` | same |
| ~893 | `global_concurrency_cap_blocks_then_admits` | `timeout_sec: Some(10),` | same |
| ~931 | `per_channel_concurrency_cap_independent` | `timeout_sec: Some(10),` | same |
| ~963 | `join_handles_never_leak_on_completion` | `timeout_sec: Some(10),` | same |

LOC impact: +6 lines (one per test). Reflected in §2 row 4 LOC est now +47/-2.

---

## §7 runner.rs:273 dispatch call edit

**Before** (`writer/runner.rs:261-273`):
```rust
let spawn_spec = SpawnSpec {
    command: inner.claude_command.clone(),
    task_id: task_id.clone(),
    prompt: spec.prompt.clone(),
    cwd: spec.cwd.clone(),
    model: spec.model.clone(),
    timeout_sec: spec.timeout_sec,
    company_id: spec.company_id.clone(),
    agent_id: None,
    run_id: None,
};
let start = Instant::now();
let mut child = match claude::spawn(&spawn_spec).await {
```

**After**:
```rust
let start = Instant::now();
let mut child = match claude_dispatch_spawn(&inner, &spec, &task_id).await {
```

with a new helper at runner.rs (bottom of file or module):
```rust
/// V26-W1 Commit 3: narrow dispatch boundary. For adapter_type="claude" we
/// build the spec via the existing path and spawn — preserving runner.rs's
/// existing stream loop. For non-claude adapters today, we error out with
/// a clear message — those execute via the registry path, not via this hot
/// path. M3 (W12) will unify both paths once deadline+cancel propagation
/// lands.
async fn claude_dispatch_spawn(
    inner: &Inner,
    spec: &TaskSpec,
    task_id: &str,
) -> std::io::Result<tokio::process::Child> {
    match spec.adapter_type.as_str() {
        "claude" => {
            let spawn_spec = SpawnSpec {
                command: inner.claude_command.clone(),
                task_id: task_id.into(),
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
                "adapter_type {other:?} not yet wired into runner hot path \
                 (only 'claude' supported in W1; OpenAI-compat lives in \
                 registry.dispatch() and is exercised by adapter_openai_compat tests)"
            ),
        )),
    }
}
```

**Critical**: the existing stream loop at `runner.rs:325-358`, the admission accounting at `:430-468`, the SSE publish at `:258` (running) + `:656` (final), and the `finalize` at `:622-657` ALL stay untouched. This is the §4.6 contract.

For Commit 3, only `adapter_type="claude"` actually runs through `run_one`. The `openai_compat_*` adapters work via the registry path (tested by `adapter/openai_compat.rs` wiremock tests, which call `dispatch(...).execute(...)` directly). M3 (W12) is when we unify.

### §7.1 Helper placement (Critic MEDIUM-2)

The `claude_dispatch_spawn` helper MUST live INSIDE `musu-rs/src/writer/runner.rs` (same module as the private `Inner` struct at L115). It cannot be moved to `adapter/claude.rs` because `Inner` is private to the runner module — the helper needs `&inner.claude_command`. This is intentional per the §4.6 narrow-boundary contract: the runner-callable surface stays inside the runner module; the registry-callable surface (`ClaudeAdapter::execute`) lives in `adapter/claude.rs` and gets the binary name via `AdapterContext.extra["claude_binary"]`.

---

## §8 AgentRecord D9 edit — `core/companies.rs:54`

### §8.1 New typed struct

Insert (between line 54 and validate impl, or in a new sub-module):

```rust
/// V26-W1 D9 (wiki/509). Typed agent record. `extra` captures any
/// top-level unknown keys from V24-R6-era YAML as a JSON object. Nested
/// subtrees (e.g. `extras_nested: { foo: bar, tools: [search] }`) are
/// preserved as Value subtrees inside `extra` — flatten does NOT recurse
/// into nested objects (Critic HIGH-3 clarification).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentRecord {
    pub id: String,
    /// Adapter type discriminator. Defaults to "claude" for V24-R6 yaml
    /// written before adapter_type existed. Must match a registry entry.
    #[serde(default = "default_agent_adapter_type")]
    pub adapter_type: String,
    /// Optional per-agent model override (claude model name, ollama model
    /// tag, etc). When `None`, adapter uses its own default.
    #[serde(default)]
    pub model: Option<String>,
    /// Adapter-specific config blob (passed to the adapter via
    /// `AdapterContext.config_json`). Defaults to Null.
    #[serde(default)]
    pub config: serde_json::Value,
    /// Captures top-level unknown keys as a JSON object. Each unknown key's
    /// value is stored as-is (object subtrees preserved, arrays preserved).
    /// MUST come last so its `flatten` captures everything not matched above.
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

fn default_agent_adapter_type() -> String {
    "claude".into()
}
```

**Critic HIGH-3 note**: `#[serde(flatten)]` on a `serde_json::Value` field captures top-level unknown keys as `Value::Object` map entries. It does NOT recursively flatten nested objects. The §8.4 test asserts both behaviors explicitly: (a) top-level capture, (b) nested subtree preservation as `Value` (still queryable via `Value::pointer("/extras_nested/foo")`). Roundtrip stability depends on `serde_json` `preserve_order` feature — verify in `Cargo.toml` (see §8.5).

### §8.2 CompanyRecord change

Line 54 changes:
```rust
#[serde(default)]
pub agents: Vec<serde_json::Value>,
```
to:
```rust
#[serde(default)]
pub agents: Vec<AgentRecord>,
```

### §8.3 record_from_create call sites

Line 268 (`agents: vec![]`) — no change needed since `vec![]` is type-inferred.
Line 305 (test sample `agents: vec![]`) — no change needed.

R2 (Phase 0 R2) confirmed **iteration sites = 0**; only initialization sites at line 268 + 305. Backward-compat risk is at the **deserialize** boundary, not the **use** boundary.

### §8.4 Backward-compat acceptance test — `tests/agent_record_backward_compat.rs`

Since R2 confirmed no live V24-R6 yaml fixture exists in the repo, the test embeds a synthetic V24-R6-shape YAML inline:

```rust
// musu-rs/tests/agent_record_backward_compat.rs

use musu_rs::core::companies::{AgentRecord, CompanyRecord};

const V24_R6_SYNTHETIC: &str = r#"
schema_version: 1
id: legacy-co
name: legacy
workspace_id: ws-1
status: active
created_at: 1700000000
updated_at: 1700000001
purpose: ""
work_dir: ""
test_cmd: "pytest -q"
template_key: default
meta: {}
agents:
  - id: agent-1
    role: ceo                          # V24-R6 unknown field
    invocation: "claude --print"       # V24-R6 unknown field
    extras_nested:
      foo: bar
      tools: [search, edit]
  - id: agent-2
    adapter_type: openai_compat_local
    model: qwen2.5-32b
    config:
      base_url: "http://localhost:11434/v1"
      backend: ollama
"#;

#[test]
fn deserializes_v24_r6_yaml_without_adapter_type() {
    let rec: CompanyRecord = serde_yaml::from_str(V24_R6_SYNTHETIC).expect("deserialize");
    assert_eq!(rec.agents.len(), 2);

    // Agent 1: had no adapter_type field → default "claude"
    assert_eq!(rec.agents[0].id, "agent-1");
    assert_eq!(rec.agents[0].adapter_type, "claude"); // backward-compat default
    assert_eq!(rec.agents[0].model, None);

    // Unknown V24-R6 fields preserved in `extra`
    let extra = &rec.agents[0].extra;
    assert_eq!(extra.get("role").and_then(|v| v.as_str()), Some("ceo"));
    assert_eq!(
        extra.get("invocation").and_then(|v| v.as_str()),
        Some("claude --print")
    );
    assert_eq!(
        extra.pointer("/extras_nested/foo").and_then(|v| v.as_str()),
        Some("bar")
    );

    // Agent 2: explicit modern shape
    assert_eq!(rec.agents[1].adapter_type, "openai_compat_local");
    assert_eq!(rec.agents[1].model.as_deref(), Some("qwen2.5-32b"));
}

#[test]
fn extras_nested_subtree_preserved_as_object() {
    // Critic HIGH-3 sub-test: serde flatten does NOT recurse into nested
    // objects, but stores them as Value::Object subtrees. Verify the
    // subtree is queryable via Value::pointer.
    let rec: CompanyRecord = serde_yaml::from_str(V24_R6_SYNTHETIC).unwrap();
    let extra = &rec.agents[0].extra;
    let extras_nested = extra
        .get("extras_nested")
        .expect("extras_nested should be a top-level entry in extra");
    assert!(
        extras_nested.is_object(),
        "extras_nested should be preserved as Value::Object, not flattened away"
    );
    assert_eq!(
        extras_nested.pointer("/tools/0").and_then(|v| v.as_str()),
        Some("search"),
        "deep pointer into the preserved subtree should work"
    );
}

#[test]
fn roundtrip_preserves_unknown_fields() {
    let rec: CompanyRecord = serde_yaml::from_str(V24_R6_SYNTHETIC).unwrap();
    let yaml_out = serde_yaml::to_string(&rec).unwrap();
    let rec2: CompanyRecord = serde_yaml::from_str(&yaml_out).unwrap();
    assert_eq!(rec.agents, rec2.agents,
        "round-trip must preserve all fields including `extra` (Value PartialEq is order-independent for maps)");
    // Critic HIGH-3 string-level invariant: regardless of map key ordering,
    // the V24-R6 unknown fields must appear in the emitted YAML.
    assert!(yaml_out.contains("role"), "V24-R6 `role` field must survive round-trip");
    assert!(yaml_out.contains("extras_nested"), "V24-R6 `extras_nested` field must survive round-trip");
    assert!(yaml_out.contains("invocation"), "V24-R6 `invocation` field must survive round-trip");
}
```

This satisfies W1 plan acceptance #13 (`(Critic HIGH-4 D9) pre-commit failing test`) AND Critic HIGH-3 (nested-subtree preservation explicit + string-level roundtrip invariant).

### §8.5 `serde_json` `preserve_order` feature flag check

Critic HIGH-3 also flagged that `serde_json::Map` insertion order is only stable when the `preserve_order` feature is enabled. Builder must verify `musu-rs/Cargo.toml` `[dependencies] serde_json` either has `features = ["preserve_order"]` OR documents why the current behavior is acceptable. The `roundtrip_preserves_unknown_fields` test above uses string-level `contains()` assertions (order-independent) so it passes either way, but operator-edited YAML diff stability requires `preserve_order`.

If `preserve_order` is absent, Builder adds it as a Cargo.toml edit (LOC est +1).

---

## §9 HTTP handler forwarding

### §9.1 `bridge/handlers/tasks.rs:14-37` DelegateRequest

Add field (after line 36 `pub cwd: Option<String>,`):
```rust
#[serde(default)]
pub adapter_type: Option<String>,
```

Update TaskSpec construction at line 130-140:
```rust
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
        adapter_type: req.adapter_type.clone().unwrap_or_else(|| "claude".into()),
    })
```

### §9.2 `bridge/handlers/run.rs:19-39` RunRequest

Add field (after line 36 `pub cwd: Option<String>,`, before `passthrough`):
```rust
#[serde(default)]
pub adapter_type: Option<String>,
```

Update TaskSpec construction at line 115-125 with the same `req.adapter_type.clone().unwrap_or_else(|| "claude".into())` forwarding pattern.

**Note**: Both handlers already use `#[serde(flatten)] passthrough` (run.rs:37-38) or implicit passthrough (tasks.rs); R2 confirmed minimal edit. The explicit `adapter_type: Option<String>` field is for clarity, not for forwarding mechanics. Backward-compat: clients sending V24-R5 wire format omit `adapter_type` entirely → `None` → `unwrap_or_else("claude")` default → V24-R5 behavior unchanged.

---

## §10 F1 master plan §2 W1 row edit

`docs/V26_MASTER_PLAN_2026_05_22.md` §2 W1 row (around line 86).

The row has SIX columns: Phase | Sub-WS | Wiki | **Module** | **Scope** | Risk | LOC est ×2 (×3.8 actual) | Existing infra (Phase 1). M1 edits **Module** and **Scope** cells only (Critic HIGH-4).

**Before** (full row):
```
| V26-W1 | Rust OpenAI-compat adapter | wiki/509 | `musu-rs/src/adapter/openai_compat.rs` + trait | Ollama/vLLM/LM Studio (OpenAI-style `/v1/chat/completions`) — local + remote variant. V24 R5 writer adapter trait reference (Python `musu-core/adapters/base.py` AdapterContext + claude_local 패턴) | LOW | 600 → **2,280** | V24 R5 writer Rust adapter start, Python musu-core 9 adapter pattern |
```

**After** (full row, with Module + Scope cells changed):
```
| V26-W1 | Rust OpenAI-compat adapter | wiki/509 | `musu-rs/src/adapter/openai_compat.rs` + trait + `musu-rs/src/adapter/claude.rs` shim | **1 unified `OpenaiCompatAdapter` + 3 `BackendKind` enum (Ollama/vLLM/LmStudio) + `ClaudeAdapter` shim wrapping V24-R5 writer subprocess**. V24 R5 writer adapter trait reference (Python `musu-core/adapters/base.py` AdapterContext + claude_local 패턴) | LOW | 600 → **2,280** | V24 R5 writer Rust adapter start, Python musu-core 9 adapter pattern |
```

Two cell-specific changes:
- **Module cell**: append ` + `musu-rs/src/adapter/claude.rs` shim` after `+ trait`.
- **Scope cell**: replace `Ollama/vLLM/LM Studio (OpenAI-style `/v1/chat/completions`) — local + remote variant.` with `**1 unified `OpenaiCompatAdapter` + 3 `BackendKind` enum (Ollama/vLLM/LmStudio) + `ClaudeAdapter` shim wrapping V24-R5 writer subprocess**.` (bold portion only). The rest of the Scope cell (V24 R5 reference + Python parity sentence) stays intact.

Risk/LOC/Existing-infra cells stay unchanged.

---

## §11 Optional Ollama smoke test

Per master plan M1 scope item 5, this is *optional* and gated by operator-attestation. Convention follows existing `tests/r4_scanner_perf.rs:78` (`#[ignore = "perf gate; run with cargo test --release -- --ignored"]`).

**Location**: new file `musu-rs/tests/adapter_real_backend_smoke.rs` (cleaner than inline `#[cfg(test)]` block in `adapter/openai_compat.rs`; keeps the inline tests deterministic).

**Test**:
```rust
//! Operator-attested real-backend smoke. NOT run in CI (see V26_W1
//! COMMIT3 detail plan §11 + master plan M1 Verification section).
//! CI only runs Python tests per .github/workflows/test.yml — cargo test
//! is operator-local.
//!
//! Run with:
//!   $env:OLLAMA_URL = "http://localhost:11434"  # default if unset
//!   cargo test --manifest-path musu-rs/Cargo.toml \
//!     --test adapter_real_backend_smoke -- --ignored --nocapture

use musu_rs::adapter::{AdapterContext, openai_compat::OpenAICompatAdapter, Adapter};
use serde_json::json;

#[tokio::test]
#[ignore = "operator-attested; requires real Ollama on $OLLAMA_URL (default http://localhost:11434). \
            Not run in CI. Smoke proof for W1 closure operator-attest evidence."]
async fn real_ollama_happy_path() {
    let base_url = std::env::var("OLLAMA_URL")
        .unwrap_or_else(|_| "http://localhost:11434/v1".into());
    let model = std::env::var("OLLAMA_MODEL")
        .unwrap_or_else(|_| "qwen2.5-coder:7b".into());

    let ctx = AdapterContext {
        run_id: "smoke".into(),
        prompt: "Reply with exactly the word OK.".into(),
        agent_id: "smoke".into(),
        adapter_type: "openai_compat_local".into(),
        config_json: json!({
            "base_url": base_url,
            "model": model,
            "backend": "ollama"
        }),
        session_id: None,
        cwd: None,
        deadline_unix_ms: None,
        cancel: None,
        extra: serde_json::Value::Null,
    };

    let res = OpenAICompatAdapter
        .execute(&ctx)
        .await
        .expect("real Ollama happy path");
    assert!(res.success);
    assert!(!res.summary.trim().is_empty(),
        "Ollama returned empty summary; check {} / {}", base_url, model);
}
```

**Self-skip behavior**: if Ollama is unreachable, `reqwest` returns an error and the test fails fast. Operator either runs with Ollama up, or doesn't run with `--ignored`. Default `cargo test` doesn't include this test (Rust's `#[ignore]` semantics).

**CI safety**: `.github/workflows/test.yml` runs `pytest` only (no `cargo test`). Even if a future CI change adds `cargo test`, the test stays gated unless `-- --ignored` is added. M1 closure documents this in operator-attest section.

---

## §12 Verification commands

Per master plan M1 Verification section:

```bash
cd /f/workspace/musu-bee

# 1. Dependency sanity
cargo metadata --manifest-path musu-rs/Cargo.toml --locked --no-deps

# 2. Adapter unit tests (shim + registry + openai_compat regression)
RUSTFLAGS='-D warnings' CARGO_INCREMENTAL=0 \
  cargo test --manifest-path musu-rs/Cargo.toml --bin musu adapter -- --nocapture

# 3. AgentRecord backward-compat
RUSTFLAGS='-D warnings' CARGO_INCREMENTAL=0 \
  cargo test --manifest-path musu-rs/Cargo.toml \
  --test agent_record_backward_compat -- --nocapture

# 4. Writer regression (subprocess semantics)
RUSTFLAGS='-D warnings' CARGO_INCREMENTAL=0 \
  cargo test --manifest-path musu-rs/Cargo.toml --bin musu writer -- --nocapture

# 5. Clippy
CARGO_INCREMENTAL=0 cargo clippy --manifest-path musu-rs/Cargo.toml -- -D warnings

# 6. (Optional) operator-attested real Ollama smoke — NOT in CI
# OLLAMA_URL=http://localhost:11434/v1 OLLAMA_MODEL=qwen2.5-coder:7b \
#   cargo test --manifest-path musu-rs/Cargo.toml \
#   --test adapter_real_backend_smoke -- --ignored --nocapture

# 7. Indexer searchability (M1 Completion Criteria)
musu-rs/target/debug/musu indexer sync --work-dir F:/workspace/musu-bee --name musu-bee
musu-rs/target/debug/musu indexer search --work-dir F:/workspace/musu-bee "ClaudeAdapter" --limit 5
musu-rs/target/debug/musu indexer search --work-dir F:/workspace/musu-bee "AgentRecord" --limit 5
```

All `-D warnings` clean; clippy clean; >= 13 adapter tests pass (10 baseline + claude shim + dispatch_claude + AgentRecord round-trip ≥ 13); writer regression unchanged.

---

## §13 Out of scope (must NOT do)

Per master plan M1 + V26 §3 strict sequential lock:

- Real Ollama smoke test MUST NOT be CI-gated. CI runs `pytest` only per `.github/workflows/test.yml`; even when CI gains `cargo test`, `#[ignore]` keeps it out by default.
- No mutation of `~/.musu/companies/*.yaml` (Const VII). M1 only **deserializes** legacy YAML via the backward-compat test; the test uses inline synthetic content, never touches operator state.
- No schema change in `core/migrate.rs` or `bridge/db.rs` (Const III). M1 does not touch the SQLite schema. `route_executions` columns stay identical.
- No rewriting of `writer/claude.rs` subprocess command shape. The shim re-uses `claude::spawn` (R1 in §3); re-implementing the `Command::new(...)` block is an Auditor HIGH.
- No collapsing of `runner.rs:325-358` stream loop into the shim. The §4.6 narrow boundary is locked; full `Adapter::execute` integration is M3 (W12) work.
- W7/W12/W9/W13/W10 stay plan-only. M1 only closes W1. Even if Builder discovers a clean way to land part of W7 alongside, it's deferred to M2 cycle entry per V26 §3 sequence.
- No new dependencies in `Cargo.toml`. Commits 1+2 already removed `async-openai`; `async-trait` + existing `reqwest` + dev-`wiremock` are sufficient. (Possible exception per §8.5: adding `features = ["preserve_order"]` to existing `serde_json` dependency if absent — that's a flag addition, not a new dep.)
- No `unsafe` blocks. The shim is pure async + standard tokio.
- **Pre-existing V24 wipe behavior carve-out** (Critic MEDIUM-3): `bridge/handlers/companies.rs:322-334` `activate()` calls `record_from_create(...)` which sets `agents: vec![]`, then `write_yaml(&yaml_record)` overwrites the on-disk YAML. With M1's typed `AgentRecord`, this silently wipes any operator-added agents — but this V24 behavior PRE-DATES M1. M1 does NOT introduce or fix this wipe. Tracked for M2+. M1 closure doc records this as a known issue, NOT a regression. Auditor must NOT blame M1 for the wipe.

---

## §14 Critic seed (for Phase 1.5 system-architect)

Question-only — Critic provides answers, not the Planner.

1. **Subprocess semantics preservation**: Does the shim preserve V24-R5 writer subprocess semantics bit-for-bit? Specifically (a) env via `env::build_env` per R5, (b) cancellation via existing `graceful_kill` path (Windows `send_ctrl_break` + 5s grace + `child.kill()`), (c) SSE event order via existing `handle_event` in `runner.rs:536-564` accumulating `Init/Assistant/Result/Other`. If the shim's `execute()` re-implements this loop without SSE/DB, is the behavioral diff documented? Is the diff acceptable given that production hot path stays via the runner-callable surface (§4.6 contract)?

2. **Dispatch boundary width**: §7 picks a *narrow* boundary (returns `Child`, keeps runner's stream loop intact). Should M1 instead pick the *wide* boundary (full `Adapter::execute` returns `AdapterResult`, stream loop moves into shim)? Trade-off: narrow boundary means M3/W12 re-does this work; wide boundary means SSE publish + admission accounting move out of `run_one` now. Which is the correct call given V26 §3 sequence locks W12 *after* W1?

3. **Default fallback both directions**: §6 adds `TaskSpec.adapter_type: String`. §5 adds `"claude" => Box::new(ClaudeAdapter)` in registry. §9 adds `req.adapter_type.unwrap_or_else(|| "claude".into())` in handlers. Multiple layers of `"claude"` default. Is one of these the *true* defense, or do all need to exist? If a V24-R5 client sends a JSON payload with no `adapter_type`, which layer catches it first?

4. **AgentRecord `#[serde(flatten)] extra` round-trip**: §8 asserts `extra` preserves V24-R6 yaml unknown fields under `deserialize → serialize → deserialize`. Does `#[serde(flatten)] extra: serde_json::Value` cleanly capture nested fields (e.g. `extras_nested.foo`)? Or does flatten only work on top-level unknown keys? Does the test embed nested unknown fields or only top-level?

5. **Ollama smoke `#[ignore]` CI safety**: R3 confirmed `.github/workflows/test.yml` runs `pytest` only — no `cargo test`. If a future contributor adds `cargo test` to CI, does `#[ignore]` truly skip the test by default? What's the failure mode if someone adds `cargo test -- --ignored` to a future CI step?

6. **SSE ordering at runner.rs:258 vs :656**: Does the dispatch helper at §7 break the SseBroadcaster publish ordering — `:258` (running) before `claude::spawn` returns, `:656` (final status) after `finalize`? If the dispatch helper returns `Err(io::ErrorKind::Unsupported)` for non-claude adapters, does the existing `Err` arm at runner.rs:294-309 (`tracing::error!(... "spawn failed")`) print a misleading message about "claude failed to spawn" for an `openai_compat_local` request? Should the error message branch on `adapter_type`?

7. **Backward-compat at the `TaskSpec` serde layer**: §6 notes `TaskSpec` is `#[derive(Debug, Clone)]` only (no Serialize/Deserialize today). If a future M2 work adds Serialize/Deserialize to `TaskSpec`, does the `#[serde(default = "default_adapter_type")]` documentation-as-code activate correctly? Or should §9's handler-side `unwrap_or_else` remain the canonical default?

8. **LOC budget realism**: M1 master target = ~750 LOC actual. This plan estimates ~660 net touch. If Builder discovers the typed `AgentRecord` migration ripples through `bridge/handlers/companies.rs` or other consumers, does the budget hold? At what trigger point should M1 split into M1.a (shim+registry) + M1.b (AgentRecord+F1)?

---

## §15 Risks + mitigations

| ID | Sev | Risk | Mitigation |
|---|---|---|---|
| M1-R1 | MED | Shim's `execute()` re-implements stream loop subtly differently from `runner.rs:477-534 stream_until_done` (different timeout/cancel select shape, different `handle_event` accumulation) | Shim's loop is private. Production hot path uses `build_spawn_spec()` only (§4.6 contract). Add unit test that drives shim `execute()` against a fake stdin/stdout pair (tokio `duplex`) and asserts the same `AdapterResult.summary` as the runner's `accumulated`/`result_text` flow would produce on the same event stream |
| M1-R2 | MED | `TaskSpec.adapter_type` missing in old musu-bridge clients → dispatch panic | Multi-layer defense per Critic Q3: handler `unwrap_or_else("claude")` + dispatch-helper `match` on `"claude"` + registry `"claude"` match arm. Unit test: HTTP POST without `adapter_type` field → 202 + task spawned via claude path. Backward-compat with V24-R5 clients explicit |
| M1-R3 | MED | `AgentRecord` `#[serde(flatten)] extra` loses nested unknown fields | Test `roundtrip_preserves_unknown_fields` (§8.4) embeds `extras_nested.foo` 2-level nesting. If flatten only captures top-level, test fails and Builder splits `extra` into a dedicated `HashMap<String, Value>` (worst-case +20 LOC) |
| M1-R4 | LOW | Real Ollama smoke flakes per operator env | `#[ignore]` keeps it out of default; closure doc records the single happy-path attestation (operator runs locally, pastes output into wiki/509c) |
| M1-R5 | LOW | LOC actual >1,500 forces M1.a + M1.b split | Builder checkpoint at +800 actual LOC. If trajectory >2× plan, split: M1.a = shim + registry + TaskSpec.adapter_type + handlers (~450 LOC) lands first; M1.b = AgentRecord typed + backward-compat test + F1 doc (~300 LOC) lands second. Both within same Const VII batch push (1 push, 2 commits) |
| M1-R6 | LOW | `tasks.rs` / `run.rs` handler edits ripple to musu-bee TS frontend wire format | The `adapter_type` field is purely additive + `Option<String>`; V24-R5 clients omit it. No breaking change to wire format. musu-bee TS no edit required for M1 |
| M1-R7 | INFO | Builder may be tempted to inline `Command::new("claude")` in shim for "clarity" | §3 R1 lock + Auditor HIGH if re-implemented. Plan explicitly forbids in §13 |

---

## §16 Completion criteria

Per master plan M1 Completion Criteria (tightened):

- [ ] `musu-rs/src/adapter/claude.rs` exists; `ClaudeAdapter` implements `Adapter` trait; **does not duplicate** `writer/claude.rs` `Command::new` shape (§3 R1)
- [ ] `musu-rs/src/adapter/mod.rs` exports `pub mod claude;`
- [ ] `musu-rs/src/adapter/registry.rs` match has `"claude" => Ok(Box::new(ClaudeAdapter))` arm; existing `dispatch_unknown_returns_unknown_error` test still passes; new `dispatch_claude_returns_claude_adapter` test passes
- [ ] `musu-rs/src/writer/runner.rs` line 273 calls `claude_dispatch_spawn(&inner, &spec, &task_id).await` (or equivalent narrow helper); existing stream loop at `:325-358` byte-identical
- [ ] `TaskSpec.adapter_type: String` field exists with `default_adapter_type()` → `"claude"`
- [ ] `bridge/handlers/tasks.rs` `DelegateRequest.adapter_type: Option<String>` + forward
- [ ] `bridge/handlers/run.rs` `RunRequest.adapter_type: Option<String>` + forward
- [ ] `core/companies.rs` `AgentRecord` struct defined with `adapter_type / model / config / #[serde(flatten)] extra`
- [ ] `CompanyRecord.agents: Vec<AgentRecord>` (line 54 changed); `record_from_create` + sample compiles
- [ ] `tests/agent_record_backward_compat.rs` exists; both test fns (`deserializes_v24_r6_yaml_without_adapter_type`, `roundtrip_preserves_unknown_fields`) pass
- [ ] V26 master plan `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W1 row "Scope" cell rewritten per §10 (F1)
- [ ] `cargo build --manifest-path musu-rs/Cargo.toml` clean
- [ ] `RUSTFLAGS='-D warnings' cargo test --manifest-path musu-rs/Cargo.toml --bin musu adapter -- --nocapture` ≥ 13 cases pass (10 baseline + claude shim + dispatch_claude + …)
- [ ] `RUSTFLAGS='-D warnings' cargo test --manifest-path musu-rs/Cargo.toml --test agent_record_backward_compat` green
- [ ] `cargo clippy --manifest-path musu-rs/Cargo.toml -- -D warnings` green
- [ ] `cargo test --manifest-path musu-rs/Cargo.toml --bin musu writer` regression — V24-R5 tests still pass (no breaking change to subprocess semantics)
- [ ] No `async-openai` in `Cargo.lock` trace (Commits 1+2 audit lock; verify with `cargo metadata` or `cargo tree`)
- [ ] No `~/.musu/companies/*.yaml` mutated (Const VII) — backward-compat test uses inline synthetic content only
- [ ] `musu indexer sync` succeeds; `musu indexer search "ClaudeAdapter"` and `"AgentRecord"` return hits
- [ ] (Optional) `cargo test --test adapter_real_backend_smoke -- --ignored` operator-attested happy path captured in closure wiki/509c
- [ ] All Critic HIGH + Auditor HIGH resolved (recorded in §17 + §18)
- [ ] Closure `docs/V26_W1_CLOSURE_2026_05_22.md` (wiki/509c) drafted; WIKI_INDEX §4.5 W1 "active" → "SHIP"; external `\\wsl.localhost\Ubuntu-22.04\home\hugh51\llm-wiki\wiki\313_...md` post-Commit-3 amend
- [ ] Const VII push approval (user) before `v26/distributed-actor` push

---

## §17 Critic Findings (resolved)

Phase 1.5 `system-architect` review (2026-05-22). 4 HIGH + 4 MEDIUM + 2 LOW + 4 INFO returned.

| # | Sev | Finding | Resolution | Patch location |
|---|---|---|---|---|
| C1 | HIGH | §2 file list omits 6 in-file `TaskSpec { ... }` literals in `runner.rs::tests` at L795/825/856/893/931/963 — adding non-Option `adapter_type` field breaks them with E0063 | §2 row 4 LOC est +35→+47. New §6.1 "Test-site literal fixes" table lists each line + the required `adapter_type: "claude".into()` addition | §2 row 4 + §6.1 |
| C2 | HIGH | §4.4 promises shim reuses `runner::graceful_kill`, but that fn is `async fn` private to runner module — shim cannot call it without privacy elevation | §3 R6 row + §4.4 explicitly state `graceful_kill` is elevated to `pub(crate) async fn` in M1 (so the shim can call `crate::writer::runner::graceful_kill(...)`). Re-export from `writer/mod.rs` for ergonomics | §3 R6, §4.4 |
| C3 | HIGH | `#[serde(flatten)] extra: serde_json::Value` does NOT recurse into nested objects — it captures top-level unknown keys whose values are Value subtrees. §8.4 test passes for misleading reason | §8.1 doc comment rewritten to clarify behavior. New §8.4 sub-test `extras_nested_subtree_preserved_as_object` makes the subtree-preservation explicit. `roundtrip_preserves_unknown_fields` augmented with string-level invariant (`yaml_out.contains("role")` etc.). New §8.5 `serde_json` `preserve_order` feature flag verification | §8.1, §8.4, §8.5 |
| C4 | HIGH | §10 F1 master plan §2 W1 row edit conflates Module cell and Scope cell — Builder following verbatim would edit wrong cell | §10 rewritten to show the FULL row markdown with explicit Module + Scope cell changes called out separately | §10 |
| C5 | MED | §6 + §9 multi-layer "claude" default — which is canonical? Plan introduces ambiguity with `default_adapter_type()` helper | §6 locks canonical default = handler-side `unwrap_or_else("claude")`. `default_adapter_type()` helper REMOVED from plan (was unused dead code). Test-site literals use explicit `"claude".into()` | §6 |
| C6 | MED | §7 helper signature references private `Inner` struct without explicit placement guidance | New §7.1 "Helper placement" explicitly mandates helper lives INSIDE `runner.rs` module (private Inner access) | §7.1 |
| C7 | MED | Pre-existing `activate()` wipe (`handlers/companies.rs:322`) makes M1's typed AgentRecord migration silently destructive at activate time | §13 explicit pre-existing-V24-carve-out: M1 does NOT introduce or fix the wipe; tracked for M2+; closure records as known issue | §13 |
| C8 | MED | §4.5 `AdapterError::Unknown("cancelled by operator")` string-couples to `runner.rs:379` literal — future refactor risk | Optional polish: extract const if Builder finds it ergonomic. Not a blocker for M1 spawn. Tracked as note | §4.5 note |
| C9 | LOW | §11 Ollama smoke env var read pattern may race with future tests in same file | §11 comment added: "single-test file; if future tests added, share `ENV_LOCK` per `companies.rs` pattern" | §11 |
| C10 | LOW | §15 risk M1-R5 split trigger "+800 actual LOC" — LOC counting methodology unstated | M1-R5 clarified to "+800 net touch LOC" matching [[feedback-loc-estimate-x2]] convention | §15 M1-R5 |
| INFO-1 | INFO | §3 R5 (`env::build_env`) reuse is automatic via `claude::spawn` — shim doesn't need to call build_env directly | Plan correct, no change | — |
| INFO-2 | INFO | §4.6 narrow-boundary contract is the correct M1 choice given V26 §3 W12-after-W1 lock | Plan correct | — |
| INFO-3 | INFO | CI safety (`#[ignore]` cargo test default behavior) confirmed via `.github/workflows/test.yml` (pytest only) | Plan correct | — |
| INFO-4 | INFO | `ctx.session_id → SpawnSpec.run_id` rename collision in §4.3 is intentional and parenthetically called out | Plan correct, consider M2 rename `SpawnSpec.run_id → session_id` | §4.3 note |

**Builder spawn unblocked** — all 4 HIGH + 3 actionable MEDIUM patched. C8 (string constant) and the LOW/INFO findings are non-blocking polish; Builder may apply inline.

---

## §18 Audit Findings (resolved)

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| _to be populated by Phase 5 quality-engineer_ | | | | |

---

## §19 References

- Master plan: `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W1 row + §3 strict sequential
- Master /goal plan: `C:\Users\empty\.claude\plans\shimmying-plotting-hamster.md` §"M1 Detail" + §"M1 Risks & Mitigations"
- W1 plan v2: `docs/V26_W1_OPENAI_COMPAT_ADAPTER_2026_05_22.md` (§D9 typed AgentRecord, §F1 master row update, §6 acceptance #13)
- Handoff: `docs/V26_W1_HANDOFF_AFTER_COMMIT2_AUDIT_2026_05_22.md`
- V24-R5 writer SHIP: `musu-rs/src/writer/runner.rs` + `musu-rs/src/writer/claude.rs` + `musu-rs/src/writer/env.rs` + `musu-rs/src/writer/platform_*.rs`
- V26-W1 Commit 1+2 SHIP: `musu-rs/src/adapter/mod.rs` + `musu-rs/src/adapter/registry.rs` + `musu-rs/src/adapter/openai_compat.rs`
- CI workflow: `.github/workflows/test.yml` (Python pytest only — confirms `#[ignore]` Ollama smoke safety)
- Phase 0 Researcher R1 (claude subprocess shape) + R2 (TaskSpec + CompanyRecord) + R3 (test infra + CI) per orchestrator brief
- Memory: [[feedback-no-yagni-architecture]] (narrow dispatch boundary), [[feedback-dual-audit-trigger-narrow]] (single Critic + single Auditor), [[feedback-loc-estimate-x2]] (M1 ~750 actual budget), [[decision-musu-backend-rust]] (V24 Rust lock)
