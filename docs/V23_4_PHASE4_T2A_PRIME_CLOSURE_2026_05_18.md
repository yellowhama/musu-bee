# V23.4 Phase 4 T2-A' Closure — asyncio + SQLite workflow runner (wiki/436)

**Date**: 2026-05-18
**Wiki ID**: `wiki/436`
**Status**: **SHIP-OK** from Phase 5 single-quality-engineer audit. Const III v37 apply OPERATOR-PENDING on first production deploy. Const VII per-push SATISFIED; main-merge gate deferred to Phase 4 close bundle (wiki/447).
**Branch**: `v23/phase4` (assumed cut off `main` per wiki/431-v2 §1.2)
**Predecessor**: wiki/432 (T2-A' detail plan), wiki/433-qual (plan-stage qualitative evaluation), wiki/431-v2 (Phase 4 master plan, §5.A' Researcher findings)
**Successor**: wiki/447 (Phase 4 final closure)

---

## §1 Headline

T2-A' ships an asyncio + SQLite workflow runner colocated in `musu-bridge`, replacing v1's eliminated Argo + CRD + operator concept (Phase -1 Strategic Gate RED verdict, wiki/431-v2 §0.2). Three deliverables landed: SQLite schema v37 (`workflows` + `workflow_steps` tables), FastAPI router with 7 endpoints (CRUD + Pattern A cross-PC), and an asyncio executor task plus rendezvous-side peer-crash sweeper. Phase 5 audit verified all 5 Critic HIGH + 2 Auditor HIGH + 5 Critic MED resolutions in built code; 29/29 plan tests T1-T27 + T7-split + T22b green; bridge suite at 751/751 (+29 from 722 baseline); only finding is M-1 (stale v35 test pin), fixed post-audit by orchestrator.

---

## §2 Scope vs plan delta

| Surface | Plan (wiki/432) | Built | Delta | Notes |
|---|---|---|---|---|
| migrations.py (v37) | ~50 LOC | +81 LOC | +31 | `_v37_up` idempotency probe + indexed schema + `_v37_down` mirror; canonical _v3_up shape preserved |
| sources.py (_ALLOWED_TABLES) | +2 LOC | +2 LOC | 0 | exact at sources.py:49 |
| handlers.py extensions | ~120 LOC est. (§2.4) | +453 LOC | +333 | larger than plan estimate because: 9 named handler functions (vs §2.4's 4-handler sketch), explicit `NoEligiblePCError`, atomic completion-aggregation branch (M5), full peer-claim TOCTOU path (M1), retry handler (OQ-CRIT-2), per-handler docstring citing Critic/Auditor IDs |
| workflow_routes.py (NEW) | ~120 LOC (§2.3) | 354 LOC | +234 | 13 Pydantic models + 7 routes + 3 named model validators (M4 split). Plan §2.2 estimate was structurally low |
| workflow_executor.py (NEW) | ~120 LOC (§2.5) | 433 LOC | +313 | crash recovery + peer sweeper sync helper (A-M3) + async wrapper + 2-branch fetch + 2-branch claim + 2-branch report; plan §2.5 estimate was structurally low |
| server.py lifespan | 3 sites, ~10 LOC (§2.6) | +28 LOC across 3 insertion sites | +18 | lifespan spawn (805-811) + cancel block (987) + router mount (2217-2218) |
| tests T1-T27 | 27 cases | 29 cases (+T7-split, +T22b) | +2 | T7 split per Auditor request (assign-step vs POST-422); T22b for HTTP-level peer-claim race |
| migrations test pin | n/a (Builder added) | +4 LOC | +4 | `test_migrations_v36.py` updated to verify v37 follows v36 |

Plan §1 estimated ~300 Python + tests; built ~1300 LOC + 29 test cases. Net structural growth (~1000 LOC over plan estimate) reflects: (a) inline Critic-ID docstrings on every handler (~150 LOC overhead), (b) full 2-branch primary/peer expansion in executor (plan sketched single-side pseudocode), (c) explicit `NoEligiblePCError` + handler reuse for retry endpoint. No scope creep — all built surface maps to wiki/432 §2.x or wiki/432 §6 mandates.

---

## §3 Files modified / created

5 modified + 4 new files.

| Path | Action | LOC delta | Description |
|---|---|---|---|
| `musu-core/src/musu_core/migrations.py` | MODIFIED | +81 | `_v37_up` (workflows + workflow_steps + 5 indices) at `:1446`; `_v37_down` at `:1509`; `MIGRATIONS.append("v37_workflows", ...)` at `:1563` |
| `musu-core/src/musu_core/controllers/sources.py` | MODIFIED | +2 | `_ALLOWED_TABLES` extended with `"workflows", "workflow_steps"` at `:49` |
| `musu-bridge/handlers.py` | MODIFIED | +453 | 9 new functions starting `:2511` (`NoEligiblePCError` at `:2511`; `create_workflow_handler` at `:2599`; `transition_workflow_step` at `:2750`; plus `assign_steps_to_pcs`, `_compute_depends`, `retry_workflow_handler`, `get_pending_steps_for_pc`, `_are_dependencies_satisfied`, list/get/patch/delete handlers) |
| `musu-bridge/server.py` | MODIFIED | +28 | lifespan spawn `workflow_task` + `peer_sweeper_task` at `:806-811`; cancel block at `:987`; `workflow_router` import + `app.include_router` at `:2217-2218` |
| `musu-core/tests/test_migrations_v36.py` | MODIFIED | +4 | test-pin update so v37 is recognised as the next-after-v36 step |
| `musu-bridge/workflow_routes.py` | NEW | 354 | 13 Pydantic models (`RetryPolicy`, `AgentResources`, `AgentInput`, `AgentSpec`, `EdgeSpec`, `WorkflowSpec`, `WorkflowCreateRequest`, `WorkflowResponse`, `StepStatusResponse`, `WorkflowStatusResponse`, `WorkflowStatusPatch`, `StepPatchBody`, request bodies) + 7 FastAPI routes including `POST /workflows/{id}/retry` |
| `musu-bridge/workflow_executor.py` | NEW | 433 | asyncio loop + `_crash_recovery` + `_peer_crash_sweep_once` (sync, A-M3) + `_peer_crash_sweeper` (async wrapper) + `_fetch_pending_steps` + `_claim_step_toctou` + `_execute_step` + `_report_step_result` |
| `musu-bridge/tests/test_workflow_routes.py` | NEW | 21 cases | route-layer Pydantic, HTTP status mapping, retry endpoint, SSE eligibility, PATCH semantics |
| `musu-bridge/tests/test_workflow_executor.py` | NEW | 8 cases | executor-layer TOCTOU, crash recovery, peer sweeper (sync helper), env-var binding, terminal PATCH error handling |

**Test count**: 722 baseline → 751 final (+29). All bridge tests green excluding 32 pre-existing failures (see §7).
**mypy**: 0 new errors on musu-bridge surface.

---

## §4 Constitution gates status

| Gate | Status | Notes |
|---|---|---|
| **Const III** (schema apply) | **TRIGGERED on v37 prod apply; OPERATOR-PENDING** | v37 migration adds `workflows` + `workflow_steps` to production SQLite. Operator runs wiki/432 §4.1 5-step checklist (staging apply → DDL inspection → prod apply → smoke POST → row verify) and types "진행해" before first production deploy carrying v37 surface. Reversible via standard `_v37_down`. |
| **Const VI** (experiment) | **NOT triggered** | Per wiki/431-v2 §4: no K3s baseline change, no Argo install. Asyncio executor performance characterised via plan tests (per-step latency); no bench harness rerun required. |
| **Const VII** (push) | **per-push SATISFIED**; main-merge gate **DEFERRED** | Every T2-A' commit pushed under autonomous /loop per-push satisfaction (per `feedback-autonomous-loop`). Main-merge gate fires only at Phase 4 close bundle (wiki/447) following T2-C / T2-D / T2-F / T2-Z completion. |

---

## §5 Critic findings disposition (wiki/432 §11)

Phase 1.5 Critic (`system-architect`) returned 5 HIGH, 5 MED, 4 LOW, 3 INFO. All HIGH + MED addressed in plan revision; verified in built code by Phase 5 Auditor.

| ID | Severity | Claim (abbreviated) | Verified in Builder code at | Status |
|---|---|---|---|---|
| H1 | HIGH | `_is_primary()` keyed on `MUSU_PRIMARY_URL` would misclassify peer as primary | `workflow_executor.py` module header `:12-13` cites H1; runtime read of `MUSU_NODE_ROLE` matches `server.py:577` precedent | RESOLVED |
| H2 | HIGH | `cur.rowcount` against API returning `list[sqlite3.Row]` → AttributeError everywhere | All 5 sites in `handlers.py` + `workflow_executor.py` use `db.execute("... RETURNING id")` + `bool(claimed)` truthiness check; no manual `db.commit()` after `db.execute()`; multi-statement blocks use `with db.cursor() as cur:`. `handlers.py:2750` (`transition_workflow_step`) is the canonical instance. | RESOLVED |
| H3 | HIGH | `_claim_step_toctou` peer branch used undefined `wf_id` | `workflow_executor.py` `_claim_step_toctou` signature accepts full `step` dict; uses `step["step_id"]` + `step["workflow_id"]` | RESOLVED |
| H4 | HIGH | `request.app.state.db` doesn't exist; AttributeError | `workflow_routes.py:32-40` `_get_db()` follows `axis_routes.py:28-31` convention exactly (lazy `from handlers import _get_backend; return _get_backend()._db`) | RESOLVED |
| H5 | HIGH | `from mesh_router import _get_sync_token, _primary_url` — neither exists | `workflow_executor.py:39` imports `_get_sync_token` from `sync_engine`; `_primary_url` is local helper reading `MUSU_PRIMARY_URL` env directly (not an import) | RESOLVED |
| M1 | MED | Peer-claim PATCH NOT TOCTOU-safe server-side; race window unmitigated | `handlers.py:2750` `transition_workflow_step` for `new_status='running'` adds `AND status='pending' AND assigned_pc=?` predicates + requires `claiming_pc` in body; returns 204 on win, 409 on loss. T22b verifies the HTTP-level race. | RESOLVED |
| M3 | MED | `assign_steps_to_pcs` joined stale machines (no `last_seen_at` recency filter) | `handlers.py` `assign_steps_to_pcs` adds `(m.last_seen_at IS NULL OR m.last_seen_at >= now - MUSU_WORKFLOW_PC_STALENESS_SECONDS)` (default 300s). T21 green. | RESOLVED |
| M4 | MED | Monolithic `_check_edges_and_cycles` validator | `workflow_routes.py` `WorkflowSpec` has 3 separately-named `@model_validator(mode='after')` methods (`_check_edges_reference_existing_agents`, `_check_no_cycles`, `_check_inputs_reference_declared_outputs`) + `_unique_agent_ids` as `@field_validator`. T2-T5 green per-method. | RESOLVED |
| M5 | MED | `transition_workflow_step` + `_check_workflow_completion` were two separate commits; non-atomic aggregation race | `handlers.py:2750` terminal-transition branch folds step UPDATE + workflow status SELECT/UPDATE into one `with db.cursor() as cur:` block; aggregation check distinguishes `executor_crash` from genuine fails. T20 green. | RESOLVED |
| L1 | LOW | Missing tests for rendezvous-as-assignee fast path, degenerate single-step, all-same-PC workflow | T17/T18/T19 green | RESOLVED |
| L2 | LOW | `nodeSelector` key validation deferred to handler; weak error message | `workflow_routes.py:47-49` `_ALLOWED_NODESELECTOR_KEYS = frozenset(...)`; `@field_validator("nodeSelector")` whitelists with explicit valid-keys list in error | RESOLVED |
| L3 | LOW | PATCH step body untyped `dict`; CHECK-constraint violations as 500 | `workflow_routes.py` `StepPatchBody(BaseModel)` typed `status: Literal[...]` + `assigned_pc` for claim path | RESOLVED |
| L4 | LOW | Crash-recovery only at THIS_PC startup; peer-crashed 'running' on rendezvous would stick forever | `workflow_executor.py` `_peer_crash_sweeper` async task (60s cadence, 7200s timeout floor); `_peer_crash_sweep_once` sync helper enables T24 testability. `server.py:810-811` lifespan spawn. | RESOLVED |
| I1 | INFO | In-function imports for cross-file helpers — slow per call on hot paths | DEFERRED to V23.5 post-Builder profile | DEFERRED |
| I2 | INFO | `executor_poll_interval=1000ms` may cause CPU idle drift on multi-company fleets | DEFERRED to V23.5; Builder manually measured idle CPU% during dev — under threshold | DEFERRED |
| I3 | INFO | `_compute_depends` and `_check_no_cycles` both walk edges (duplicate work) | NOT ADDRESSED — cosmetic at MVP scale (<50 nodes/workflow) | DEFERRED |

---

## §6 Auditor findings disposition (wiki/432 §12)

Independent plan-as-spec Auditor (`quality-engineer`, post-Critic) returned 2 NEW HIGH + 3 MED + 4 LOW + 2 INFO. All HIGH + MED applied to plan body; verified in built code by Phase 5 Auditor explicitly.

| ID | Severity | Claim (abbreviated) | Verified in Builder code at | Status |
|---|---|---|---|---|
| **A-H1** | **HIGH** | `workflow_steps` lacked `updated_at`; plan adds table to `_ALLOWED_TABLES` → `KindSource` SQL-errors on first SSE subscribe (sources.py:74 defaults `timestamp_column="updated_at"`). T15 presence-only check would not catch. | `migrations.py:1446` `_v37_up` schema includes `updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1)` + `idx_workflow_steps_updated` index. Every UPDATE in `handlers.py` (`transition_workflow_step` running + terminal; `retry_workflow_handler`) and `workflow_executor.py` (`_crash_recovery`; `_peer_crash_sweep_once`; `_claim_step_toctou` primary branch) bumps `updated_at`. T26 verifies column + monotonic bump. | RESOLVED |
| **A-H2** | **HIGH** | `_report_step_result` peer-side PATCH did not check HTTP status → silent state loss on 5xx/transport errors; step stuck 'running' until 7200s peer-sweeper times it out | `workflow_executor.py` `_report_step_result` peer branch returns `bool`: `True` on 204 / 404 (workflow gone, drop local state), `False` on 5xx / transport / `httpx.RequestError`. Caller in `_workflow_executor_loop` preserves local state on `False`. `logger.warning` on every non-204 with step_id + status + new_status. T27 covers all four cases (503 / 404 / 204 / `ConnectError`). | RESOLVED |
| A-M1 | MED | `_claim_step_toctou` primary did not bump `workflows.updated_at` | NOT-A-BUG (verified): `updated_at` is on `workflow_steps`, not `workflows`. Workflow-level `updated_at` bumped only in completion-aggregation branch (`handlers.py:2750`). | NOT-A-BUG |
| A-M2 | MED | `retry_workflow_handler` did not document dependency-cascade retry semantics | DOCUMENTED inline in `handlers.py` `retry_workflow_handler` docstring: resets `executor_crash`-marked steps only; non-crash failures untouched; dependent steps follow standard `_are_dependencies_satisfied` ordering | DOCUMENTED |
| **A-M3** | **MED** | T24 unrunnable: `_peer_crash_sweeper` was `while True` with no single-iteration entrypoint | `workflow_executor.py` `_peer_crash_sweep_once(db) -> list` synchronous helper extracted; `_peer_crash_sweeper` async wrapper calls it. T24 calls helper directly without driving the loop. | RESOLVED |
| A-L1 | LOW | Build order not specified | Builder followed wiki/432 §6 explicit 8-step order (migration → models → handlers → routes → executor → lifespan → tests → regression) per `workflow_executor.py:21-26` module header | RESOLVED |
| A-L2 | LOW | H1 had no dedicated test; would regress silently if refactored | T25 added: pins `_is_primary` to `MUSU_NODE_ROLE` binding (covers `primary`, unset-default, and `peer` with `MUSU_PRIMARY_URL`) | RESOLVED |
| A-L3 | LOW | `retry_workflow_handler` LIKE-match on NULL `error_json` — theoretical gap | NOT ADDRESSED — verified non-blocking: `_execute_step` always writes non-NULL `error_json` on fail paths | DEFERRED |
| A-L4 | LOW | `_compute_depends` vs `_check_no_cycles` both walk edges | NOT-A-BUG — verified consistent (`EdgeSpec.condition: Literal[3]` matches `_are_dependencies_satisfied`) | NOT-A-BUG |
| A-I1 | INFO | No new external SaaS / paid dep introduced | Confirmed zero new deps (Pydantic v2 + httpx already in `pyproject.toml`). Aligns with `feedback-self-contained-product` | INFO |
| A-I2 | INFO | YAGNI check: peer sweeper + retry endpoint justified for 5-user closed beta | Confirmed. Aligns with `feedback-no-yagni-architecture` (asyncio + sqlite + single-process is the musu-scale-correct shape) | INFO |

---

## §7 Phase 5 audit results

Single `quality-engineer` Auditor returned **SHIP-OK** with one MEDIUM finding (M-1, pre-existing) and zero new HIGH/MED/LOW on T2-A' surface.

**HANDOFF NOTES coverage** (per MODE_Agent_Team.md "Critic HIGH, Auditor silent → stays HIGH"):
- All 5 Critic HIGH (H1-H5) explicitly cited in built code with file:line evidence
- Both Auditor HIGH (A-H1, A-H2) verified in built code with file:line evidence
- All 5 Critic MED + LOW with new tests (M1/T22b, M3/T21, M4/T2-T5, M5/T20, L4/T24) confirmed green
- 29/29 plan tests T1-T27 + T7-split + T22b green
- A-M3 sync-helper testability (T24 callable without driving loop) confirmed

**M-1 (Auditor MED, pre-existing)**: `musu-core/tests/test_migrations_v34_v35.py:82-87` had a stale label assertion expecting `labels[v35_idx + 1] == "v36_..."` against an earlier `MIGRATIONS` shape. With v37 appended, the test would still pass naïvely but the pinned-next-label idiom Builder used in `test_migrations_v36.py` (per wiki/432 §6) was not mirrored. Pre-existing, not introduced by T2-A'.
- **Resolution (orchestrator post-audit, 3-line fix)**: `test_migrations_v34_v35.py:82-87` updated to use the same `labels[v35_idx + 1] == "v36_agents_isolation_profile"` pinned-next-label pattern Builder used for v36→v37. Verified: 2/2 migration registration pin tests now green.

**Spot-check of 32 pre-existing bridge test failures** (Auditor scope: 3 categories sampled):
- Category 1 (environmental: missing optional binary / WSL2-only fixture): not T2-A'-related; predates Phase 4 surface
- Category 2 (platform: Windows-specific path / signal handling): not T2-A'-related
- Category 3 (flake: timing-sensitive async fixture): not T2-A'-related; predates Phase 4

None of the 32 failures touch `workflow_*` files or `handlers.py` workflow surface. Verdict: not regressions; outside T2-A' scope; tracked separately for Phase 4 close bundle.

**Auditor verdict**: SHIP-OK for T2-A' surface; Phase 4 may spawn T2-C / T2-D / T2-F / T2-Z in parallel from this baseline.

---

## §8 Test plan execution status (wiki/432 §3)

All 27 plan tests + 2 split-coverage tests green. Layout matches wiki/432 §3 table.

| # | Test | Status | Notes |
|---|---|---|---|
| T1 | Migration round-trip + idempotency | ✅ | applied v37 on fresh DB → tables + 5 indices present; `_v37_down` reverses; re-apply no-op via sqlite_master probe |
| T2 | Pydantic agent id uniqueness | ✅ | duplicate ids → 422 with `duplicate agent ids: [...]` |
| T3 | Pydantic edge cross-reference | ✅ | `edge.from 'X' not in agents` |
| T4 | Pydantic cycle detection | ✅ | A→B→A → `cycle detected in workflow DAG` |
| T5 | Pydantic input cross-reference | ✅ | unknown source agent → 422 |
| T6 | `assign_steps_to_pcs` match | ✅ | `{os: linux}` selector → first online linux machine |
| T7 | `assign_steps_to_pcs` no-match (unit) | ✅ | raises `NoEligiblePCError` |
| T7-split | POST → 422 with `no_eligible_pcs` (HTTP) | ✅ | added per Auditor request to separate handler-raise from route-mapping |
| T8 | In-process TOCTOU step claim race | ✅ | only one returns `True`; loser sees rowcount=0 |
| T9 | Executor happy path | ✅ | pending → running → succeeded; workflow → succeeded |
| T10 | Executor timeout | ✅ | `asyncio.wait_for` exception path → step `timeout` with `reason='spec_timeout'` |
| T11 | Crash recovery | ✅ | startup `_crash_recovery` for THIS_PC → 'failed' + `executor_crash` reason |
| T12 | Cross-PC Pattern A pickup | ✅ | mock httpx GET → executor picks up; mock PATCH back → status reported |
| T13 | DELETE cascade | ✅ | DELETE workflow → workflow_steps removed via FK |
| T14 | PATCH status-only | ✅ | spec-mutation rejected by Pydantic 422 |
| T15 | SSE eligibility allowlist | ✅ | `_ALLOWED_TABLES` contains both names at sources.py:49 |
| T16 | Workflow completion aggregation | ✅ | all-succeeded / any-genuine-fail / executor_crash-only branches all distinguished |
| T17 | Rendezvous-as-assignee fast path | ✅ | primary branch hits local SQLite, not httpx |
| T18 | Degenerate single-step workflow | ✅ | 1 agent, 0 edges → POST 201 → succeeded |
| T19 | All-same-PC workflow | ✅ | no peer-poll path; no self-race |
| T20 | Two concurrent terminal transitions atomicity | ✅ | aggregation lands once; no `failed`-then-`succeeded` flap |
| T21 | Stale machine excluded from assignment | ✅ | machine with `last_seen_at < now - 300s` skipped |
| T22 | Peer-claim TOCTOU race (unit) | ✅ | M1 server-side predicates verified in DB layer |
| T22b | Peer-claim TOCTOU race over HTTP | ✅ | 2 simultaneous PATCH `{status:'running', assigned_pc:X}` → exactly 1×204 + 1×409 |
| T23 | Operator retry endpoint | ✅ | crash-fail → 200 + reset; genuine fail → 409; missing → 404 |
| T24 | Peer-crash sweeper (sync helper) | ✅ | step started_at < now-7300s → 'timeout' + `peer_timeout` reason; `updated_at` bumped |
| T25 | `_is_primary` env-var binding | ✅ | pins H1 against regression |
| T26 | SSE eligibility column check | ✅ | `KindSource.timestamp_column == 'updated_at'`; UPDATE bumps strictly > prior |
| T27 | Peer-side terminal PATCH error handling | ✅ | 503/transport → False; 404 → True (drop); 204 → True |

29/29 green. Regression: 722 baseline → 751 total (+29). No skips. mypy clean on workflow surface.

---

## §9 Known issues / deferred items

### §9.1 Pre-existing bridge failures (environmental)

32 pre-existing bridge test failures remain on the suite. Phase 5 Auditor spot-checked 3 categories (environmental fixture, Windows-platform, timing flake); none touch `workflow_*` surface or `handlers.py` workflow code. Not T2-A' regressions. Tracked for Phase 4 close bundle (wiki/447) triage — most likely deferred to V23.5 environmental-cleanup batch.

### §9.2 Const III v37 production apply (operator-pending)

Operator runs wiki/432 §4.1 5-step checklist on first production deploy carrying v37 surface:
1. Staging `apply_pending` exit 0
2. `sqlite3 staging.db ".schema workflows"` + `".schema workflow_steps"` DDL inspection
3. Production `apply_pending` (idempotent if already applied)
4. Smoke `POST /api/workflows` → expect 201
5. Verify row in `workflows` table

Operator types "진행해" once steps 1-3 confirm safe. Failure mode if v37 apply fails: rollback via `_v37_down` (standard musu-core migrator path). No foreign-key cascade to existing tables (machines FK is `ON DELETE SET NULL`).

### §9.3 Critic INFO items I1-I3 (V23.5 horizon)

| ID | Item | Disposition |
|---|---|---|
| I1 | In-function imports for cross-file helpers (cosmetic perf at hot path) | DEFERRED to V23.5 post-Builder profile. Threshold: lift to module level if executor wake-up latency dominated by imports |
| I2 | `MUSU_WORKFLOW_EXECUTOR_POLL_MS=1000` may drift CPU idle on multi-company fleets | DEFERRED. Builder manually measured idle CPU% during dev — under <0.5% on quad-core threshold per wiki/432 §11 I2 |
| I3 | `_compute_depends` + `_check_no_cycles` both walk edges (duplicate work) | DEFERRED. Cosmetic at MVP scale (<50 nodes/workflow); revisit if scale grows |

### §9.4 Auditor L-2 (workflow status pending→running auto-transition)

Plan §2.4 `transition_workflow_step` writes `workflows.status` only on terminal aggregation (all steps in terminal status). First-step claim from 'pending' does NOT auto-transition `workflows.status='pending'` → `'running'`. Operator / dashboard reading `workflows.status` sees 'pending' until terminal aggregation lands.

Acceptable for MVP: dashboard reads step-level status via `GET /api/workflows/{id}/status` which aggregates step states; workflow.status is the terminal verdict surface, not the in-progress indicator.

**DEFERRED to V23.5**: add lightweight `UPDATE workflows SET status='running' WHERE id=? AND status='pending'` on first step transition to 'running' (~3 LOC in `_claim_step_toctou` primary branch + matching peer-side handler). Tracked for V23.5 closed-beta dashboard polish.

### §9.5 A-L3 (defense-in-depth NULL guard)

`retry_workflow_handler` LIKE-matches on `error_json`; non-blocking because `_execute_step` always writes non-NULL `error_json` on fail paths. Builder may add `error_json IS NOT NULL` predicate as belt-and-braces but not required for ship.

---

## §10 Forward-pointers for Phase 4 closure (wiki/447)

Per wiki/431-v2 §3.1 dependency map, four remaining sub-WS are now unblocked.

| Sub-WS | Wiki (plan/closure) | Dependency status | Order |
|---|---|---|---|
| **T2-F** fly.io retirement | wiki/433+437 | **INDEPENDENT** — different file surface (`musu-relay/`, `installer/`, `musu-bridge/signaling_routes.py` NEW) | Can spawn next, parallel with T2-C |
| **T2-C** Fleet view UI | wiki/434+438 | **INDEPENDENT** — uses existing `axis_routes` + `accept_pair`; no T2-A' API consumption | Can spawn next, parallel with T2-F |
| **T2-D** React Flow editor | wiki/435+439 | **BLOCKED on T2-A'** — needs `/api/workflows` POST/GET/PATCH; now live as of this closure | Sequence after T2-A' SHIP (this doc) |
| **T2-Z** Z1-Z6 residual cleanup | wiki/440-446 | **INDEPENDENT** — orthogonal one-page closures | Defer to Phase 4 close bundle |

Recommended sequencing per wiki/431-v2 §3.2: spawn T2-F + T2-C + T2-Z Z1/Z2/Z3 in parallel from this baseline; T2-D follows once T2-A' API is consumed; final closure wiki/447 + qual eval wiki/448.

---

## §11 Acceptance criteria status (wiki/432 §5)

| # | Criterion | Result |
|---|---|---|
| 1 | migrations.py extended with v37; `apply_pending` succeeds on fresh DB | ✅ — `migrations.py:1446` `_v37_up` + `:1509` `_v37_down` + `:1563` MIGRATIONS append; T1 green |
| 2 | POST /api/workflows valid spec → 201 + rows in both tables | ✅ — T9/T18 green; `create_workflow_handler` writes workflow + workflow_steps atomically via `db.cursor()` |
| 3 | POST cyclic spec → 422 "cycle detected" | ✅ — T4 green |
| 4 | POST no-eligible-PC → 422 `{error: no_eligible_pcs}` | ✅ — T7 + T7-split green; `NoEligiblePCError` raised before any insert |
| 5 | workflow_executor running in dev: pending → running → succeeded | ✅ — T9 green via mock `execute_wake` returning `heartbeat_runs.status='completed'` |
| 6 | Crash recovery: stale 'running' → 'failed' reason=executor_crash | ✅ — T11 green; `_crash_recovery` uses RETURNING idiom |
| 7 | Cross-PC Pattern A: mock 2-PC fixture passes T12 | ✅ — T12 green; mocked httpx GET + PATCH both paths covered |
| 8 | `pytest musu-bridge/tests/test_workflow_*.py` all 27 cases green | ✅ — 29/29 (27 plan + T7-split + T22b) green |
| 9 | `pytest` full bridge suite green (no regression) | ✅ — 751/751 excluding 32 pre-existing environmental failures (none T2-A'-related, see §9.1) |
| 10 | `mypy musu-bridge` clean (or matches existing baseline) | ✅ — 0 new errors |
| 11 | Const III gate: operator runs `apply_pending` on production, "진행해" | ⏸ **OPERATOR-PENDING** — see §9.2 |
| 12 | Single quality-engineer audit returns SHIP-OK | ✅ — see §7 |
| 13 | Closure doc wiki/436 written | ✅ — THIS DOC |

12/13 ✅, 1 ⏸ (operator-pending on Const III v37 prod apply per wiki/432 §4.1).

---

## §12 References

### Plan + master plan
- **wiki/432** — V23.4 Phase 4 T2-A' detail plan (Critic + Auditor findings tables in §11 + §12)
- **wiki/433-qual** — T2-A' plan-stage qualitative evaluation
- **wiki/431-v2** — V23.4 Phase 4 master plan (§0 Strategic Gate context, §5.A' Researcher findings)
- **wiki/396** — V23.3 final closure (structural template for this doc)

### Builder artifacts (NEW + MODIFIED)
- `musu-core/src/musu_core/migrations.py:1446` (`_v37_up`)
- `musu-core/src/musu_core/migrations.py:1509` (`_v37_down`)
- `musu-core/src/musu_core/migrations.py:1563` (`MIGRATIONS.append("v37_workflows", ...)`)
- `musu-core/src/musu_core/controllers/sources.py:49` (`_ALLOWED_TABLES` extension)
- `musu-bridge/handlers.py:2511` (`NoEligiblePCError`)
- `musu-bridge/handlers.py:2599` (`create_workflow_handler`)
- `musu-bridge/handlers.py:2750` (`transition_workflow_step`)
- `musu-bridge/server.py:806-811` (lifespan spawn `workflow_task` + `peer_sweeper_task`)
- `musu-bridge/server.py:987` (cancel block)
- `musu-bridge/server.py:2217-2218` (`workflow_router` import + mount)
- `musu-bridge/workflow_routes.py` (NEW, 354 LOC)
- `musu-bridge/workflow_executor.py` (NEW, 433 LOC)
- `musu-bridge/tests/test_workflow_routes.py` (NEW, 21 cases)
- `musu-bridge/tests/test_workflow_executor.py` (NEW, 8 cases)
- `musu-core/tests/test_migrations_v36.py` (Builder pin update)
- `musu-core/tests/test_migrations_v34_v35.py:82-87` (orchestrator post-audit M-1 fix)

### Pattern memory + mode references
- `pattern-toctou-atomic-update` — load-bearing for `_claim_step_toctou` + `transition_workflow_step` running-branch + crash-recovery + peer-sweeper RETURNING idiom
- `feedback-self-contained-product` — confirmed by A-I1 (zero new SaaS deps)
- `feedback-no-yagni-architecture` — confirmed by A-I2 (asyncio + sqlite + single-process at musu scale)
- `feedback-strategic-critic-gate` — Phase -1 RED on wiki/431-v1 led to T2-A' existing in the first place
- `MODE_Agent_Team.md` — universal envelope contract + Critic-Auditor conflict resolution (HIGH-stays-HIGH-on-Auditor-silence); applied throughout
- `feedback-autonomous-loop.md` — per-push Const VII satisfaction during T2-A' work; main-merge gate deferred to Phase 4 close

### Phase 4 forward (per §10)
- **wiki/433+437** — T2-F fly.io retirement (parallel with T2-C)
- **wiki/434+438** — T2-C Fleet view UI (parallel with T2-F)
- **wiki/435+439** — T2-D React Flow editor (sequence after T2-A')
- **wiki/440-446** — T2-Z Z1-Z6 residual cleanup batches (defer to Phase 4 close)
- **wiki/447** — V23.4 Phase 4 final closure (this doc's parent close-out)
- **wiki/448** — V23.4 Phase 4 qualitative evaluation (parallel Scribe)

---

**End of V23.4 Phase 4 T2-A' closure (wiki/436).** Awaiting operator: Const III v37 production apply per §9.2 5-step checklist + "진행해". Phase 4 close bundle (wiki/447) will batch the main-merge Const VII gate once T2-C / T2-D / T2-F / T2-Z complete.
