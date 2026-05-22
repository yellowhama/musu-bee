# V26-W1 Handoff (CURRENT) - 2026-05-22

## §1 Summary

- **Working Dir**: `F:\workspace\musu-bee`
- **Branch**: `v26/distributed-actor`
- **Latest code commit (local, not pushed)**: `ac6783a` — `V26-W1 handoff current: record commit 1-2 recovery state` (Commit 3 land + closure docs are uncommitted; next push bundles them per Const VII batch approval)
- **Remote base**: `origin/v26/distributed-actor` at `d3cd085`
- **Status**: **W1 SHIP** (Commit 1+2+3 all land locally). M1 cycle of musu /goal master plan closes the W1 chokepoint. M2 (W7 `musu peer register`) unblocked.

## §2 What V26-W1 Closed

### Commits land (local)

1. `979589d` — `V26-W1 commit 1 of 3: trait + registry skeleton + Cargo deps` (Adapter trait + AdapterContext/AdapterError + registry skeleton).
2. `15e07a5` — `V26-W1 commit 2 of 3: OpenAI-compat adapter + wiremock tests` (3-backend `OpenAICompatAdapter` + 10 wiremock tests).
3. `ac6783a` — handoff (superseded by THIS doc).
4. **Pending commit (M1 cycle, uncommitted, this session)**: Commit 3 = ClaudeAdapter shim + registry "claude" arm + TaskSpec.adapter_type + typed AgentRecord + serde_json `preserve_order` + F1 master plan row edit + closure docs.

### Commit 3 + closure deliverables (this session)

- `musu-rs/src/adapter/claude.rs` (NEW, ~250 LOC) — `ClaudeAdapter` shim with two surfaces (runner-callable `build_spawn_spec` + registry-callable `execute`), both converging on `claude::spawn`. Zero subprocess command shape duplication.
- `musu-rs/src/adapter/mod.rs` (EDIT) — `pub mod claude;`.
- `musu-rs/src/adapter/registry.rs` (EDIT) — `"claude" => Box::new(ClaudeAdapter)` arm + `dispatch_claude_returns_claude_adapter` test + clearer error string for unregistered adapter_type.
- `musu-rs/src/writer/runner.rs` (EDIT) — `TaskSpec.adapter_type: String` field; new `claude_dispatch_spawn` helper at file bottom (narrow boundary, returns `Child`); `graceful_kill` elevated to `pub(crate) async fn` so shim reuses; 6 in-file test-site literals patched (L795/825/856/893/931/963); Q6 proactive error-message branch (non-claude dispatch error no longer prints misleading "claude failed to spawn").
- `musu-rs/src/core/companies.rs` + `core/mod.rs` (EDIT) — typed `AgentRecord` with `#[serde(flatten)] extra: serde_json::Value`; `CompanyRecord.agents: Vec<AgentRecord>`; `default_agent_adapter_type` serde default; re-export from `core/mod.rs`.
- `musu-rs/src/bridge/handlers/tasks.rs` + `run.rs` (EDIT) — `adapter_type: Option<String>` field on `DelegateRequest` + `RunRequest`; handler-side canonical default `unwrap_or_else(|| "claude".into())` forwarding to `TaskSpec`.
- `musu-rs/src/lib.rs` (NEW, Builder discovery MEDIUM) — minimal re-export surface so integration tests can `use musu_rs::core::companies::AgentRecord`.
- `musu-rs/src/bridge/dedup.rs` (EDIT, Builder LOW) — scoped `#[allow(clippy::len_without_is_empty)]` for pre-existing `DedupCache::len` (surface exposed by new lib.rs).
- `musu-rs/Cargo.toml` (EDIT) — `[lib]` target + `serde_json features = ["preserve_order"]` (Critic HIGH-3 mandate).
- `musu-rs/tests/agent_record_backward_compat.rs` (NEW, 3 tests) — `deserializes_v24_r6_yaml_without_adapter_type` + `extras_nested_subtree_preserved_as_object` + `roundtrip_preserves_unknown_fields` (with string-level invariants).
- `musu-rs/tests/adapter_real_backend_smoke.rs` (NEW, `#[ignore]`) — operator-attested real Ollama happy path; NOT run in CI (`.github/workflows/test.yml` runs pytest only).
- `docs/V26_MASTER_PLAN_2026_05_22.md` (EDIT) — §2 W1 row Module + Scope cells updated per F1 (Critic HIGH-4).
- `docs/V26_W1_COMMIT3_DETAIL_PLAN_2026_05_22.md` (NEW) — M1 cycle detail plan with §17 Critic Findings table (4 HIGH + 4 MED + 2 LOW + 4 INFO all resolved) + §18 Audit Findings table.
- `docs/V26_W1_CLOSURE_2026_05_22.html` (NEW, wiki/509c) — closure HTML per [[feedback-scribe-html-only]]; intermediate phase docs stay Markdown.
- `docs/V26_W1_QUALITATIVE_EVALUATION_2026_05_22.md` (NEW) — 한국어 정성평가 (this session, score 8.4/10).
- `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md` (EDIT) — V26 status block W1 line → SHIP.
- `docs/WIKI_INDEX.md` §4.5 (EDIT) — W1 row "active" → "SHIP"; wiki/509-c3 row added for the Commit 3 detail plan; wiki/509c row added for closure HTML.
- External `\\wsl.localhost\Ubuntu-22.04\home\hugh51\llm-wiki\wiki\313_MUSU_V26_W1_OPENAI_COMPAT_ADAPTER_2026_05_22.md` (EDIT) — post-Commit-3 amendment with D1/D2/D3 durable decisions + Critic-discipline note + Auditor PASS.
- External `\\wsl.localhost\Ubuntu-22.04\home\hugh51\llm-wiki\wiki\00_INDEX.md` (EDIT) — 313 line updated to W1 SHIP status.

## §3 Verification (run yourself)

```powershell
cd F:\workspace\musu-bee

# 1. Build clean
cargo build --manifest-path musu-rs\Cargo.toml

# 2. Adapter unit tests (10 baseline + 3 claude shim + 1 dispatch_claude = 14)
$env:RUSTFLAGS = "-D warnings"; $env:CARGO_INCREMENTAL = "0"
cargo test --manifest-path musu-rs\Cargo.toml --bin musu adapter -- --nocapture

# 3. AgentRecord backward-compat (3 tests)
cargo test --manifest-path musu-rs\Cargo.toml --test agent_record_backward_compat -- --nocapture

# 4. Writer regression (run serial — pre-existing env-var race documented as LOW, not introduced by Commit 3)
cargo test --manifest-path musu-rs\Cargo.toml --bin musu writer -- --test-threads=1

# 5. Clippy
cargo clippy --manifest-path musu-rs\Cargo.toml -- -D warnings

# 6. async-openai absence
cargo metadata --manifest-path musu-rs\Cargo.toml --locked --no-deps --format-version 1 `
  | Select-String -Pattern '"async-openai"'   # expected: no match

# 7. Indexer searchability
musu-rs\target\debug\musu.exe indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
musu-rs\target\debug\musu.exe indexer search --work-dir F:\workspace\musu-bee --query "ClaudeAdapter" --limit 3
musu-rs\target\debug\musu.exe indexer search --work-dir F:\workspace\musu-bee --query "AgentRecord" --limit 3

# 8. (Operator-attested only — NOT in CI)
# $env:OLLAMA_URL = "http://localhost:11434/v1"; $env:OLLAMA_MODEL = "qwen2.5-coder:7b"
# cargo test --manifest-path musu-rs\Cargo.toml --test adapter_real_backend_smoke -- --ignored --nocapture
```

### Verification results captured this session

- `cargo build` clean (3m 02s cold)
- `cargo test --bin musu adapter`: **14 passed, 0 failed, 0 ignored** (matches detail plan §16 expectation of ≥13)
- `cargo test --test agent_record_backward_compat`: **3 passed, 0 failed**
- `cargo test --bin musu writer -- --test-threads=1`: **14 passed, 0 failed** (V24-R5 subprocess regression intact)
- `cargo clippy -- -D warnings`: clean (no warnings)
- `cargo metadata`: `async-openai` ABSENT (confirms Commit 2 audit lock)
- `grep 'adapter_type: "claude"' musu-rs/src/writer/runner.rs`: 6 hits (Critic HIGH-1 mass fix verified)
- `musu indexer sync`: 1395 files / 5339 symbols indexed (delta from LG37 baseline 1389/5324 = +6 files / +15 symbols)
- `musu indexer search "ClaudeAdapter"`: hits at `musu-rs/src/adapter/claude.rs:struct + impl Adapter`
- `musu indexer search "AgentRecord"`: hit at `musu-rs/src/core/companies.rs:struct`

## §4 Critic + Auditor Findings

### Phase 1.5 Critic (`system-architect`) — 4 HIGH + 4 MED + 2 LOW + 4 INFO

All 4 HIGH and 3 actionable MED patched into detail plan §17 BEFORE Builder spawn:

- **C1 (HIGH)**: 6 in-file `TaskSpec { ... }` test literals in `runner.rs::tests` would `E0063` after adding `adapter_type: String` field. Patched by adding `adapter_type: "claude".into(),` at each site.
- **C2 (HIGH)**: `runner::graceful_kill` was `async fn` private to runner module; shim claimed reuse but couldn't call it. Patched by elevating to `pub(crate) async fn`.
- **C3 (HIGH)**: `#[serde(flatten)] extra` does NOT recurse into nested objects; doc comment misleading. Patched with explicit doc rewrite + `extras_nested_subtree_preserved_as_object` sub-test + `serde_json features = ["preserve_order"]` Cargo.toml addition.
- **C4 (HIGH)**: F1 master plan row edit conflated Module + Scope cells. Patched §10 with full row markdown + explicit Module / Scope cell split.
- **C5 (MED)** — canonical default lock at handler-side, `default_adapter_type()` helper removed from plan.
- **C6 (MED)** — `claude_dispatch_spawn` placement explicit (inside `runner.rs` module for private `Inner` access).
- **C7 (MED)** — pre-existing `activate()` wipe at `bridge/handlers/companies.rs:322` carved out as out-of-scope for M1.
- **C8 (MED)** — `AdapterError::Unknown("cancelled by operator")` string-couples to runner.rs:393; tracked as M3 cleanup.

### Phase 5 Auditor (`quality-engineer`) — PASS

0 HIGH / 0 MED / 3 LOW / 9 INFO. Verdict: PASS. Explicit C1/C2/C3/C4 addressal confirmed with file:line evidence in audit handoff:
- C1 PASS: grep `adapter_type: "claude"` = 6 hits at L873/904/936/974/1013/1046 (post-edit line numbers).
- C2 PASS: `graceful_kill` at runner.rs:597 is `pub(crate) async fn`; shim calls it 3× at adapter/claude.rs:167/174/178; grep `Command::new` / `start_kill` in shim = 0 hits (no duplicate kill).
- C3 PASS: AgentRecord with `#[serde(flatten)] extra` AS LAST FIELD at companies.rs:73-93; preserve_order at Cargo.toml:40; 3 tests all green; nested subtree preserved as `Value::Object`.
- C4 PASS: V26 master §2 W1 row Module + Scope cells both edited; Risk/LOC/Existing-infra unchanged.

LOW findings (all M3 tracked):
- Shim's local `handle_event`/`ShimOutcome` duplicates runner's logic (registry-callable surface only, narrow-boundary contract).
- `build_spawn_spec` carries `#[allow(dead_code)]` until M3 routes through it.
- `"cancelled by operator"` string-couple.

## §5 Remaining Work — Out of M1 Scope (next cycles per musu /goal master plan)

- **M2**: W7 `musu peer register` — worker helper + capability autodetect + systemd/launchd/SCM. Wiki `wiki/510` reserved.
  - **Phase 0 Researcher**: SHIP (R1 V24-R6 installer surface + R2 main.rs CLI/Cargo/test pattern; findings captured in detail plan §3 reuse table)
  - **Phase 1 Planner**: SHIP. `docs/V26_W7_PEER_REGISTER_DETAIL_PLAN_2026_05_22.md` (46 KB) — full structure mirroring M1 detail plan
  - **Phase 1.5 Critic** (system-architect): SHIP. Returned **6 HIGH + 4 MED + 5 LOW + 2 INFO**; all 6 HIGH + actionable MED patched into detail plan §14 Critic Findings table. Builder spawn unblocked.
    - H1 `lib.rs` `pub mod peer;` (M1 lib.rs surprise recurrence prevention)
    - H2 `PeerServiceContext.unit_dir_override` + Test 6 Const VII guard (`dirs::home_dir()` hardcoded in V24-R6 platform impls would otherwise pollute real `~/.config/systemd/user/` from test runs)
    - H3 file-only manifest + integration seam log (bridge doesn't read `node.toml` until W10)
    - H4 runtime-String per-peer label (NO hardcoded `SERVICE_LABEL` const reuse)
    - H5 Capability TOML roundtrip Test 5 promoted to MANDATORY spawn-blocker
    - H6 Plan-flagged `/api/nodes/add` semantic mismatch confirmed
  - **Phase 3 Builder**: PENDING. Next session resumes here per detail plan §2 deliverable table + §14 Critic Findings (no further plan work needed).
  - **Estimated LOC**: ~1,290 net touch (within ~1,140 target +13%; M2.a/M2.b split trigger at +1,400 actual per Critic I1 + [[feedback-loc-estimate-x2]])
- **M3**: W12 axum tower deadline middleware (+ X1 fold: `audit.db` `cross_machine: bool` column for V27 trigger measurement). Wiki `wiki/511`.
- **M4**: W9 LLM DAG builder (single-pass, §9.12 attestation gate enforced). Wiki `wiki/512`. MED risk.
- **M5**: W13 MCP HTTP+SSE external surface (+ X2 fold: 4-layer ↔ musu-rs/src/* mapping doc). Wiki `wiki/513`. **HIGH** risk — dual-audit gate (security-engineer × 2) + operator LAN/internet decision.
- **M6**: W10 registry hardening (+ X3 fold: SSOT 1page compaction) + V26 close. Wiki `wiki/514` + `wiki/515`. **HIGH** risk — cross-repo + auth-touching + system invariant doc.

After M6 SHIP → V27 trigger 측정 시작 (14-day window, cross-machine task delegation ≥5/week).

## §6 Const VII Push Gate (PENDING USER APPROVAL)

This session left 3 commits + closure docs uncommitted. Next session OR same session (with user OK) does:

```powershell
# 1. Stage Commit 3 code + closure docs
cd F:\workspace\musu-bee
git add musu-rs\src\adapter\claude.rs `
        musu-rs\src\adapter\mod.rs `
        musu-rs\src\adapter\registry.rs `
        musu-rs\src\writer\runner.rs `
        musu-rs\src\core\companies.rs `
        musu-rs\src\core\mod.rs `
        musu-rs\src\bridge\handlers\tasks.rs `
        musu-rs\src\bridge\handlers\run.rs `
        musu-rs\src\bridge\dedup.rs `
        musu-rs\src\lib.rs `
        musu-rs\Cargo.toml `
        musu-rs\Cargo.lock `
        musu-rs\tests\agent_record_backward_compat.rs `
        musu-rs\tests\adapter_real_backend_smoke.rs `
        docs\V26_W1_COMMIT3_DETAIL_PLAN_2026_05_22.md `
        docs\V26_W1_CLOSURE_2026_05_22.html `
        docs\V26_W1_QUALITATIVE_EVALUATION_2026_05_22.md `
        docs\V26_W1_HANDOFF_CURRENT.md `
        docs\V26_MASTER_PLAN_2026_05_22.md `
        docs\WIKI_INDEX.md `
        docs\PRODUCT_CHARTER\SSOT_1PAGE_2026-04-09.md

# 2. Single commit (or two — Commit 3 code, then closure batch — operator choice)
git commit -m "V26-W1 commit 3 of 3: ClaudeAdapter shim + registry dispatch + typed AgentRecord (M1 SHIP)"

# 3. Push (user explicit Const VII gate)
git push origin v26/distributed-actor

# 4. External wiki push (WSL side recommended to avoid Windows safe.directory friction)
# In WSL:
#   cd ~/llm-wiki && git add wiki/313_MUSU_V26_W1_OPENAI_COMPAT_ADAPTER_2026_05_22.md wiki/00_INDEX.md
#   git commit -m "V26-W1 SHIP: closure note + 00_INDEX status" && git push
```

`Const VII batched approval` per [[feedback-const-vii-batched-approval]] — one user OK covers both repos for this M1 bundle.

## §7 Score (this session, self-evaluated)

**8.4 / 10 — PASS (W1 chokepoint closed)**.

Details: `docs/V26_W1_QUALITATIVE_EVALUATION_2026_05_22.md` (한국어).

Highest-value moves this session:
1. Phase 1.5 Critic (`system-architect`) returned 4 HIGH; ALL of them were build-breakers or correctness ambiguities (especially C1 = 6 silent E0063 compile errors). Without Critic, Builder would have hit them at first `cargo build`.
2. Narrow dispatch boundary §4.6 contract — preserves V24-R5 hot path bit-for-bit; defers full Adapter::execute integration to M3/W12 where it belongs.
3. Real `cargo build` + `cargo test` + `cargo clippy` + `cargo metadata` re-run after Builder finished — caught nothing new (Auditor PASS), but the discipline of orchestrator-side re-verification (not just trusting Builder's self-report) is the right pattern.

Watches (next cycle):
- W1 LOC actual is ~870 (Commit 3 alone, not counting Commit 1+2) vs M1 target ~750. Builder discovery `src/lib.rs` (Builder MEDIUM) accounts for ~30 LOC of the overrun; rest is bigger shim than estimated. Tracked but not blocking.
- 3 Auditor LOW findings (shim handle_event duplicate / dead_code allow / string-couple) all M3 cleanup targets — explicit so they don't get forgotten.
- 1 pre-existing parallel-test flake (state_machine_pending_running_failed env-var race) PRE-DATES Commit 3; flagged for V27 test hygiene cycle, not blocking M2.
