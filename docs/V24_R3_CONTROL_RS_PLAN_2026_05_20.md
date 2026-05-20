# V24-R3 CONTROL-RS — Phase 1 Plan

| Field | Value |
|---|---|
| Wiki ID | wiki/493 |
| Created | 2026-05-20 |
| Phase | 1 (plan) |
| Status | DRAFT — awaiting Phase 1.5 Critic (system-architect, single per master plan §5-R3) |
| Risk | MED (single Critic, single Auditor; no auth surface, no schema change) |
| LOC est | ~900-1,200 implementation + ~250 tests = ~1,150-1,450 total |
| Predecessors | wiki/491 (R1 BRIDGE — shipped), wiki/492 (R2 CORE — shipped), wiki/495 (R5 WRITER — shipped), wiki/496 (R6 INSTALLER — shipped) |
| Successor | R4 INDEXER (per master plan §5) |
| Critic | `system-architect` (single, MED-risk per master plan §5-R3 row) |
| Auditor | `quality-engineer` (single, NOT dual — no auth surface touched) |

---

## §1 Scope

R3 (CONTROL-RS) is the third of the four R-cleanup ranges in V24. It replaces the **standalone Python `musu-control` MCP stdio process** (`musu-control/src/musu_control/server.py`, registered by Claude Code via `.mcp.json` and invoked as `python -m musu_control`) with a native Rust **`musu control` subcommand** of the single `musu-rs` binary. The new subcommand serves Anthropic's `rmcp` 1.7 stdio JSON-RPC, exposes a thin tool surface (T1 native + T2 deprecated stubs), and proxies T1 tool calls through `reqwest` to the R1 Rust bridge over loopback HTTP.

**Frame correction (load-bearing for Critic and Builder)**: musu-control is NOT a set of `/api/control/*` HTTP routes on musu-bridge. It is its own MCP stdio process registered in `.mcp.json` as a separate command. R3 ports THAT process to Rust. R3 does NOT add HTTP routes under `/api/control/*` to the bridge. The Python `musu-control` itself calls musu-bridge HTTP — Rust `musu control` does the same, just via `reqwest` instead of `httpx`.

### In scope

- **`musu control` subcommand** on the `musu-rs` binary. Boots an rmcp-based stdio MCP server, with stderr-routed `tracing` (so MCP JSON frames on stdout stay clean).
- **~15 tool surface** (per F6/F8 + §1.1 Q3): ~8 T1 strictly-native tools that proxy to R1 endpoints + ~5-7 T2 facade-dependent tools shipped as DEPRECATED-V25 stubs.
- **rmcp 1.7 substrate** (Anthropic-blessed, May 13 2026 release; per F3, F4 + §1.1 Q1). Pinned to `"1.7"` minor.
- **`control::transport` abstraction** — thin trait layer over rmcp's transport so a future substrate swap (hand-rolled stdio JSON-RPC fallback if rmcp churns) is a one-file change.
- **`control::bridge_client`** — single shared `reqwest::Client` (`OnceLock`) reads `MUSU_BRIDGE_URL` (default `http://127.0.0.1:8070`) and the bearer token via the R6 install-side resolver (`MUSU_BRIDGE_TOKEN` env → `~/.musu/bridge.env` fallback per F9/F14, Q5).
- **Small R1 patch — GET `/api/companies/:id`** (single-row read, ~30 LOC).
- **T1 tool definitions** (~8 tools, definitive list in §3.1): `list_companies`, `get_company`, `create_company`, `activate_company`, `run_company`, `delegate_task`, `cancel_task`, `list_nodes`.
- **T2 deprecated stubs** (~5 tools, §3.1): `list_agents`, `get_agent`, `get_dashboard`, `list_runs`, `get_activity`. Each returns `Ok("endpoint not yet ported to Rust (V25 candidate)")` without calling the bridge.
- **Integration tests** — `r3_mcp_smoke`, `r3_stdout_clean`, `r3_companies_get`.
- **`.mcp.json` example** in docs.

### Out of scope (explicitly NOT in R3)

- HTTP / SSE MCP transport (Q2 lock). stdio only.
- Full 80-tool port. V25 alongside endpoint ports.
- Write-side tools against non-native endpoints (pause_agent, create_issue, ralph_*, etc.).
- New auth surface.
- Persistent state, caches, queues, or local DB.
- Schema changes.

### §1.1 Locked decisions

| ID | Question | Locked answer | Source |
|---|---|---|---|
| Q1 | Substrate | **rmcp 1.7** pinned minor. `control::transport` abstraction for fallback. | F3, F4 |
| Q2 | Transport | **stdio ONLY**. | F12 |
| Q3 | Tool surface count | **~15**: 8 T1 + 5-7 T2 deprecated stubs. | F6, F8 |
| Q4 | State | **Stateless**. OnceLock reqwest::Client. | Researcher F-equiv |
| Q5 | Auth | `MUSU_BRIDGE_TOKEN` env → `~/.musu/bridge.env`. Reuse R6 resolver. | F9, F14 |
| Q6 | Log routing | **stderr-only** init BEFORE rmcp serves. | F5, F7 |
| Q7 | T2 contract | Description suffix ` (deprecated, will be removed in V25 unless ported to native Rust endpoint)` + body `Ok("endpoint not yet ported to Rust (V25 candidate)")`. | Q7-NEW |
| Q8 | Error mapping | `Ok(human_string)`, never JSON-RPC error frame. | F10 |

---

## §2 Stack

| Crate | Version | New? | Reason |
|---|---|---|---|
| tokio, serde, serde_json, tracing, anyhow, thiserror, uuid, reqwest, clap, chrono | existing | — | Reused R1-R6 baseline |
| **`rmcp`** | `"1.7"` pinned | **NEW** | Anthropic-blessed MCP SDK (F3). Pin minor to avoid 1.8+ churn. |
| `schemars` | transitive | — | Tool input-schema derive via rmcp |

**Binary growth**: ~200-400KB. Self-contained-product compliant (single crates.io crate, no SaaS).

---

## §3 Module touch list

Target: ~870 impl + ~250 tests ≈ ~1,150 LOC.

### NEW under `musu-rs/src/control/`

| File | LOC | Purpose |
|---|---|---|
| `mod.rs` | ~80 | Subcommand entrypoint. stderr tracing init BEFORE rmcp::Server::serve. |
| `transport.rs` | ~40 | Thin trait over rmcp Transport (substrate-swap escape hatch). |
| `bridge_client.rs` | ~120 | Shared `OnceLock<BridgeClient>` with reqwest::Client + token resolver. Per-method async fns. Error mapping per F10 → always `Ok(String)`. |
| `tools/mod.rs` | ~50 | `register_all(&mut ServerBuilder)` re-exports + registration. |
| `tools/companies.rs` | ~200 | T1: list_companies, get_company, create_company, activate_company, run_company. |
| `tools/tasks.rs` | ~150 | T1: delegate_task, cancel_task. |
| `tools/nodes.rs` | ~80 | T1: list_nodes. |
| `tools/t2_deprecated.rs` | ~150 | T2 stubs: list_agents, get_agent, get_dashboard, list_runs, get_activity. |

### MODIFY

- `musu-rs/Cargo.toml` — add `rmcp = "1.7"`.
- `musu-rs/src/main.rs` — subcommand-aware tracing init (route to stderr when `Cmd::Control`).
- `musu-rs/src/bridge/handlers/companies.rs` — add `get` handler (~30 LOC).
- `musu-rs/src/bridge/handlers/mod.rs` — register `GET /api/companies/:id`.

### NEW tests

- `tests/r3_mcp_smoke.rs` (~150 LOC) — spawn subprocess + JSON-RPC initialize/list/call with wiremock-mocked bridge.
- `tests/r3_stdout_clean.rs` (~50 LOC) — empty stdin → zero stdout bytes.
- `tests/r3_companies_get.rs` (~50 LOC) — `/api/companies/:id` 200 + 404.

### §3.1 Tool surface (load-bearing)

**T1 strictly-native (8)**:
1. `list_companies` → GET /api/companies
2. `get_company` → GET /api/companies/:id (R1 patch)
3. `create_company` → POST /api/companies
4. `activate_company` → POST /api/companies/:id/activate
5. `run_company` → POST /api/companies/:id/run
6. `delegate_task` → POST /api/tasks/delegate
7. `cancel_task` → DELETE /api/tasks/:task_id (R5)
8. `list_nodes` → GET /api/nodes

**T2 deprecated stubs (5)**:
1. `list_agents`
2. `get_agent`
3. `get_dashboard`
4. `list_runs`
5. `get_activity`

**Total**: 13 tools.

### §3.2 `.mcp.json` example

```json
{
  "mcpServers": {
    "musu-control": {
      "command": "musu",
      "args": ["control"],
      "env": {
        "MUSU_BRIDGE_URL": "http://127.0.0.1:8070"
      }
    }
  }
}
```

---

## §4 Contract (Builder constraints)

- **C1** — MCP framing is newline-delimited JSON (F5). rmcp handles.
- **C2** — `tracing` writer = `std::io::stderr` for control subcommand, init BEFORE rmcp serves. Test `r3_stdout_clean.rs` is the gate.
- **C3** — Tool errors return `Ok(human_readable_string)`, NOT JSON-RPC error frames. Log full reqwest error to stderr (F10).
- **C4** — T2 tool description ends with literal ` (deprecated, will be removed in V25 unless ported to native Rust endpoint)`.
- **C5** — T2 tools return `Ok("endpoint not yet ported to Rust (V25 candidate)")` without HTTP call.
- **C6** — Tool input structs use `schemars` derive + `#[serde(deny_unknown_fields)]`.
- **C7** — Single shared `OnceLock<BridgeClient>` (R6 connection-pool pattern).

---

## §5 Const gates

- Const III: NOT triggered (no schema change).
- Const VI: NOT triggered.
- Const VII: per-push, R-cleanup bundle approval via [[feedback-const-vii-batched-approval]].

---

## §6 Acceptance criteria

1. `cargo build --release` clean.
2. `cargo clippy --workspace --all-targets -- -D warnings` clean.
3. `cargo test --release` green incl. new r3_* tests.
4. `musu control` accepts MCP initialize, returns server info.
5. `tools/list` returns 13 tools with expected names.
6. `tools/call list_companies` with wiremock-mocked bridge returns valid response.
7. `tools/call list_agents` returns `"endpoint not yet ported to Rust (V25 candidate)"`.
8. Every T2 description ends with the literal suffix (C4).
9. Stdin closed → clean exit within 2s.
10. Bridge unreachable → `Ok("musu bridge not running at http://127.0.0.1:8070; start with `musu install` or `musud`")`.
11. Missing token → exit with clear stderr BEFORE any MCP frame on stdout.
12. `r3_stdout_clean` — zero stdout bytes with empty stdin.
13. `GET /api/companies/:id` 200 + 404 (R1 patch, `r3_companies_get`).
14. `.mcp.json` example documented in closure HTML.
15. Phase 1.5 Critic findings resolved.
16. Phase 5 Auditor SHIP-OK.

---

## §7 Risks

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| R3-W1 | MED | rmcp 1.x churn | `control::transport` abstraction + `"1.7"` minor pin |
| R3-W2 | MED | stdout corruption from accidental println! | C2 contract + `r3_stdout_clean` test |
| R3-W3 | LOW | T2 stubs confuse operator | C4 description suffix in tools/list |
| R3-W4 | MED | Bridge unavailable at spawn | Acceptance #10 graceful Ok-string return |
| R3-W5 | LOW | Tool schema drift | C6 `deny_unknown_fields` |
| R3-W6 | LOW | Missing env on Claude Code spawn | R6 token resolver fallback + acceptance #11 stderr message |

---

## §8 Critic seed (system-architect, single)

1. Verify T1/T2 split + names match §3.1.
2. Confirm C1-C7 constraints observable in §3 design.
3. R1 patch (GET `/api/companies/:id`) doesn't break R1/R5 invariants (audit_log not written for GETs; 404 vs 500 distinction).
4. rmcp 1.7 transitive deps (serde, tokio, serde_json) intersect cleanly with R1-R6 Cargo.lock.
5. `transport.rs` realistic — if abstraction forces async_trait lifetime ugliness, drop and document fallback path in §7 R3-W1.
6. Pick subcommand-aware tracing init Option A (per-subcommand re-init) vs Option B (main.rs branch) — C2 invariant depends on it.
7. OQ residue from Researcher F1-F14.

Critic should NOT re-litigate Q1-Q8 locks.

---

## §9 References

- wiki/490 §5-R3 + §6 facade scope
- wiki/491 R1 + wiki/492 R2 + wiki/495 R5 + wiki/496 R6 (predecessors)
- wiki/495c + wiki/496c closures
- GOAL.md §A.1.1
- musu-control/src/musu_control/server.py (Python predecessor, read-only)
- musu-rs/src/bridge/handlers/companies.rs (R1 list pattern)
- musu-rs/src/install/runner.rs (R6 token resolver)
- Phase 0 Researcher envelope (F1-F14 + Q1-Q8 + T1/T2 enumeration)
- Memory tags: [[feedback-no-python]], [[decision-musu-backend-rust]], [[feedback-self-contained-product]], [[feedback-no-yagni-architecture]], [[feedback-plan-stage-auditor]], [[feedback-const-vii-batched-approval]], [[feedback-scribe-html-only]]

---

## §10 Critic Findings

Phase 1.5 `system-architect` Critic returned 2026-05-20. 4 HIGH + 4 MED + 2 LOW + 2 INFO. All HIGHs + MEDs resolved as plan amendments or Builder constraints.

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| **C1** | **HIGH** | tracing-init | `main.rs:60` calls `tracing_subscriber::fmt().init()` BEFORE `Cli::parse` at line 64. Plan §3 "subcommand-aware tracing init" is structurally impossible — global subscriber already installed writing to stdout by the time `control::run()` executes. `tracing_subscriber::set_global_default` panics on re-init. | **Plan amendment**: §3 MODIFY `main.rs` — move `tracing_subscriber` init INSIDE each `Cmd::*` arm (or per-subcommand fn). For `Cmd::Control`, use `.with_writer(std::io::stderr)` explicitly. Other arms preserve current behavior. ~10 LOC main.rs refactor; LOAD-BEARING for `r3_stdout_clean`. |
| **C2** | **HIGH** | tool-count-drift | §1 says ~15, §1.1 Q3 says "8 + 5-7", §3.1 enumerates 13, §6 #5 says "exactly the ~15". Contradictory. | **Plan amendment**: Lock at **exactly 13** (canonical §3.1 enumeration). Replace §1 "~15" → "exactly 13 (8 T1 + 5 T2)". Replace §1.1 Q3 "5-7 T2" → "exactly 5 T2". Replace §6 #5 "exactly the ~15" → "exactly 13". T2 additions = V25 scope. |
| **C3** | **HIGH** | r1-patch | GET `/api/companies/:id` audit-policy unspecified. R1 invariant: mutations → audit, reads → no-audit. Builder may copy-paste from create() and incorrectly add audit. | **Plan amendment**: §3 R1 patch row spec: "MUST mirror `list()` shape (schema_applied guard → fetch_optional → row_to_company → Json), MUST NOT call `state.audit.write`". §6 #13 add sub-bullet: audit_log row count unchanged after 100 successful GETs. |
| **C4** | **HIGH** | token-resolver | Token resolution duplicated in install/auto_update.rs:422-448 + install/uninstall.rs:185-201. R3 control would be 3rd copy. R6 Auditor QB2 already flagged. | **Plan amendment**: §3 MODIFY list: extract to `musu-rs/src/install/token.rs` (`pub fn read_bridge_token(home: &Path) -> Option<String>`); replace call-sites in auto_update.rs + uninstall.rs + new control/bridge_client.rs. Net -30 LOC. Treat as part of R3. |
| C5 | MED | transport-abstraction | transport.rs ~40 LOC over rmcp::Transport is theater — abstraction either leaks lifetimes (generic) or boxes futures (dyn). One-file substrate swap impossible. | **Plan amendment**: DROP transport.rs from §3. Replace §7 R3-W1 with: "(a) minor-pin rmcp = `1.7`; (b) if rmcp 1.7 yanks or 2.0 breaks, fallback = rewrite control/ against jsonrpc-core + tokio stdin/stdout (~300 LOC delta, one PR), no prophylactic abstraction needed." Saves 40 LOC. |
| C6 | MED | once-lock | OnceLock<BridgeClient> init failure semantics broken: closure panic poisons; lazy init runs AFTER first MCP frame, breaking acceptance #11. | **Plan amendment**: Eager `BridgeClient::try_new() -> Result<Self>` at control::run() entry, BEFORE rmcp::Server::serve. Store in `Arc<BridgeClient>` threaded through ServerBuilder context. On Err → return Err with stderr, no MCP frame written. OnceLock removed. |
| C7 | MED | substrate-deps | rmcp 1.7 transitive deps not verified against current Cargo.lock. Potential tokio/serde/tower major-version collisions. | **Builder constraint**: After `cargo add rmcp = "1.7"`, run `cargo tree -p musu-rs` and confirm no duplicate major versions of tokio, serde, serde_json, tower. §6 add #17 acceptance for cargo tree check. Escalate before code commit if duplicates appear. |
| C8 | MED | stdin-eof | Acceptance #9 assumes rmcp 1.7 serve_stdin_stdout returns on stdin EOF. Implementation-specific. | **Builder constraint**: Add belt-and-suspenders `tokio::select!` with explicit stdin-EOF watcher; r3_mcp_smoke asserts hard 2s timeout. |
| C9 | LOW | error-shape | GET handler should use `fetch_optional` + `ok_or_else NotFound`, not `fetch_one` (which errors on absent row). | **Builder constraint**: spec in plan §3 R1 patch: `sqlx::query(...).bind(&id).fetch_optional(&state.pool).await.map_err(MusuError::Sqlx)?.ok_or_else(|| MusuError::NotFound(...))`. |
| C10 | LOW | tool-surface | T2 description suffix may truncate if base description grows. | **Builder constraint**: Acceptance #8 add `assert tool.description.ends_with(EXPECTED_SUFFIX)` for each T2 tool with const. T2 tools use `concat!()` or `format!()` with the const, never inline string. |
| C11 | INFO | tests | r3_mcp_smoke covers only 1 T1 + 1 T2; remaining 11 tools have no per-call test. | **Plan amendment**: Parameterize r3_mcp_smoke over `[(tool, body, expected_substring)]` table covering all 13 tools. OR document in §6 that R3 ships 1+1 covered + manual MCP inspector for remaining 11 in Auditor phase. Pick parameterize. |
| C12 | INFO | tool-surface | Acceptance #10 conflates "bridge unreachable" with "bridge running but rejecting token". | **Plan amendment**: Split #10 into (a) connection-refused → "musu bridge not running at <url>; start with `musu install` or `musud`"; (b) 401 → "musu bridge rejected our token; verify MUSU_BRIDGE_TOKEN env / ~/.musu/bridge.env match the bridge". |

**Builder readiness**: With C1-C4 resolved as plan amendments + C5-C12 as Builder constraints, R3 plan is READY FOR BUILD.

**LOC delta from C-resolution**: +10 LOC (main.rs refactor C1) + 0 (C2 doc-only) + 5 (C3 audit-test assert) + -30 net (C4 token dedup) + -40 (C5 drop transport.rs) + 5 (C6 eager init) + 5 (C7 cargo tree CI step) + 10 (C8 stdin watch) = NET ~ -35 LOC. Plan still ~1,100 LOC.

---

## §11 Auditor Findings

Phase 5 `quality-engineer` Auditor returned 2026-05-20. **SHIP-OK** verdict — 0 HIGH, 2 MED (docs/test improvements, non-blocking), 3 LOW, 4 INFO. All Critic HIGHs (C1-C4) explicitly confirmed resolved at file:line.

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| QA1 | MED | code-quality | `tools/params.rs:4-6` doc-comment described T2_SUFFIX as `concat!`-concatenated, contradicting actual implementation (rmcp macro accepts only literals; suffix is byte-exact hand-written + runtime test gate). | **Resolved** in audit-fix: doc-comment now describes the literal-only macro restriction + the runtime test gate at `tools/params.rs:3-10`. |
| QA2 | MED | tests | `r3_mcp_all_13_tools_callable` reboots subprocess + wiremock 13× sequentially; ~60-130s on Windows CI. | **ACK** — current passes; if CI flake emerges, refactor to shared harness in V25. |
| QA3 | LOW | code-quality | `bridge_client` empty-id check is defense-in-depth bypass that smoke test doesn't exercise. | **ACK** — code already safe; V25 polish. |
| QA4 | LOW | code-quality | `control/mod.rs:331` swallows service.waiting() join error as Ok(()) for clean Claude Code exit. | **ACK** — `tracing::warn!` at line 328 provides operator visibility. |
| QA5 | LOW | tests | r3_stdout_clean's 5s timeout panic message conflates C8 watcher vs rmcp EOF regression. | **ACK** — diagnostic polish, optional. |
| QA6 | INFO | builder-deviation | Builder envelope said "11 NEW files" but actual is 8 NEW + 7 MODIFY — plan's 4 `tools/*.rs` sub-files consolidated into `control/mod.rs` via `#[tool_router]` for `&self` access. Architecturally sound. | **Documented** in closure HTML — deliberate consolidation matches mod.rs:64-67 inline comment. |
| QA7 | INFO | code-quality | `control::ok_text` bug-path returns `CallToolResult::error()` for serde failures on own structs — contradicts §1.1 Q8 "always Ok(text)". | **Documented** — should-never-happen invariant; smoke test asserts `is_error never true`. |
| QA8 | INFO | scope-creep | None detected. R3 stayed within §1 scope. | Confirmed. |
| QA9 | INFO | tests | `r3_companies_get_does_not_audit` 500ms sleep is empirically tuned; potential CI false-positive under load. | **ACK** — 154 tests pass; if flake emerges, replace with explicit audit.flush in V25. |

**Auditor verdict**: SHIP-OK. All 4 Critic HIGHs (C1 stderr init, C2 13 tools exact, C3 no audit on GET, C4 token dedup) explicitly verified at file:line. Proceed to Phase 7 Scribe.

**Pre-existing dep dup**: tower 0.4/0.5 + tower-http 0.5/0.6 git-confirmed pre-R3 (from R1 baseline + reqwest 0.12 transitive). rmcp 1.7 introduces NO new duplicate majors.
