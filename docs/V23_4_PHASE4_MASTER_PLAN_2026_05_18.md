# V23.4 Phase 4 Master Plan (wiki/431) — Revision 2

**Date**: 2026-05-18
**Wiki ID**: `wiki/431`
**Revision**: 2 (v1 superseded by Phase -1 Strategic Gate verdict — see §0)
**Branch**: `v23/phase4` (NEW; cut off `main` after V23.3+V23.4-Tier-1 main-merge)
**Predecessor**: V23.4 Tier-1 SHIPPED at `08b0c1a` on `v22/gap-analysis` (wiki/429); main-merge OPERATOR-PENDING
**Scope**: V23 master §V23.4 Phase 4 RESHAPED — asyncio+SQLite workflow runner (NOT Argo/CRD/Operator) + Fleet view + React Flow editor + fly.io retirement + Tier-1 residual cleanup
**Successor**: V23.5 closed beta (5 users running multi-PC workflows)

---

## §0 Strategic Gate Findings (Phase -1, 2026-05-18)

### §0.1 Gate result

Phase -1 Strategic Gate (per MODE_Agent_Team.md) invoked retroactively on wiki/431-v1 at 2026-05-18 with `business-panel-experts` in debate mode (Christensen + Taleb + Kim&Mauborgne + Drucker).

**Verdict: 🚨 RED** — thesis itself failed on two independent grounds.

**Reshape mandate**: plan body revised below. All 4 frameworks convergent across all 8 HIGH findings; user accepted full reshape.

### §0.2 Why v1 was RED

| # | Finding | Framework | wiki/431-v1 section |
|---|---|---|---|
| **SG-1** HIGH | Wrong product shape: K8s+Argo+CRD+Operator is platform-engineering infra inside personal-productivity-tool positioning. Job-execution chart doesn't intersect solution-feature chart. K8s vocabulary hiding (§5.C) is necessary but insufficient — install size + EOL clock + maintenance burden leak regardless. | Christensen JTBD + Kim ERRC | v1 §1.1, §2, §5.A, §5.B |
| **SG-2** HIGH | fly.io paid SaaS retained in critical-path signaling despite user objection 4 phases ago. "Provisional" hedge from V23.1 T1.7 survived V23.1/2/3/4. Every Phase 4 code path that ships with fly grows removal cost. | All 4 frameworks | v1 §4 row 4 |
| **SG-3** HIGH | 5 compounding new fragilities in single phase: Argo upstream + Argo EOL clock + Go toolchain + controller-runtime + AdmissionWebhook with `failurePolicy: Fail` (downtime blocks CRD apply by design). | Taleb + Drucker | v1 §5.A, §5.B |
| **SG-4** HIGH | Industry mis-import: K8s+Argo+CRD+operator correct for orchestration-platform industry (Kubeflow/Flyte/Prefect). musu is not in that industry. Boundary error. | Christensen + Kim | v1 §1.1 thesis |
| **SG-5** HIGH | Effectiveness ≠ efficiency: 11-week plan is internally efficient but moves further from "5 working users by V23.5" than 4-6 week lightweight version would. Two-language codebase for one-developer org = organizational scope creep before org exists. | Drucker | v1 §3.4 |
| **SG-6** MED | Plan explicitly schedules future damage-management work ("plan v4.0 upgrade workstream") and ships anyway. Self-acknowledged perpetual upstream-tracking burden. | Drucker + Taleb | v1 §2.1 Argo pin |
| **SG-7** MED | 17 Critic findings (6 HIGH adjudicated) all lived within unquestioned thesis frame. tech-only Critic structurally cannot ask "should this exist". Phase -1 gate adoption confirmed correct on first run. | All 4 | v1 §11 |
| **SG-8** LOW | K8s-vocabulary lint (§5.C) treats symptom not cause; can't rename "300MB Argo OCI failed to pull" in user log files. | Kim | v1 §5.C |

### §0.3 Reshape applied

| Sub-WS | v1 status | v2 (this revision) | LOC delta |
|---|---|---|---|
| **T2-A** Argo + CRD + Python webhook | KEEP ~600 | **ELIMINATE entire concept** | -600 |
| **T2-A'** asyncio + SQLite workflow runner | (didn't exist) | **NEW: ~300 LOC Python in musu-bridge** | +300 |
| **T2-B** Go operator | KEEP ~1300 | **ELIMINATE entire concept** | -1300 |
| **T2-C** Fleet view | KEEP ~1000 | **KEEP unchanged** | 0 |
| **T2-D** React Flow editor | KEEP ~1500 | **KEEP, simplified** (workflow-crd.ts → workflow-spec.ts; CRD encode/decode → JSON encode/decode) | -100 |
| **T2-Z** Residual cleanup | KEEP ~300 | **KEEP unchanged** | 0 |
| **T2-F** fly.io retirement | (didn't exist) | **NEW: ~400 LOC, signaling rendezvous on user's first PC + STUN/TURN fallback; delete musu-relay/Dockerfile + fly.toml** | +400 |
| **Total** | ~4400 | **~3400** | **-1000 (-23%)** |

Other deltas vs v1:
- **Languages**: 3 (Python + TS + Go) → 2 (Python + TS)
- **Timeline**: 9-11 weeks → 8 weeks max (6-7 core + buffer)
- **External SaaS deps in critical path**: 1 (fly.io) → **0**
- **Upstream-tracking burden**: 1 (Argo EOL clock) → 0
- **Const VI triggers**: 1 (Argo install bench) → 0 (no K3s baseline change)
- **Const III triggers**: 1 (CRD apply) → 1 (SQLite migration; same gate weight)

### §0.4 What this revision is NOT changing

- T2-C Fleet view user-facing design + UX + K8s-vocabulary lint (load-bearing for product positioning, kept as defense-in-depth even though K8s leakage surface shrinks dramatically)
- T2-D React Flow editor user-facing design + parity-verification methodology (R5)
- T2-Z residual cleanup batches (Z1-Z6, all orthogonal to thesis)
- Branch strategy (main-merge first → cut v23/phase4)
- §11 Critic findings table (6 retire with eliminated sub-WS; 11 carry forward to T2-C/D/Z scope)

### §0.5 Inaugural Phase -1 gate record

This is the **first invocation** of Phase -1 Strategic Gate after MODE_Agent_Team.md update of 2026-05-18. The gate caught:
- A 4-phase-old user policy violation (fly.io)
- A 1300 LOC Go operator + new language commitment that all 4 frameworks rejected
- An EOL-clock subscription (Argo v3.7) that v1 acknowledged in writing and shipped anyway

Pattern fits `feedback-strategic-critic-gate` memory exactly: tech-only Critics reliably catch tactical gaps and structurally miss thesis-level errors. Gate works as designed. Recommend permanent adoption for all master plans + thesis-extension sub-WSs.

---

## §1 Scope + main-merge precondition

### 1.1 Scope statement (rewritten per SG-1 + SG-4)

V23.4 Phase 4 ships personal multi-PC AI workflow execution. Three dimensions:

1. **Backend workflow execution**: asyncio workflow runner + SQLite workflow state in musu-bridge (Python). Cross-PC dispatch via existing WebRTC/signaling channel (post-T2-F: signaling via user's first installed PC, NOT fly.io).
2. **Frontend user-facing**: Fleet view (list of user's PCs with capacity heat-map) + React Flow workflow editor (drag-connect DAG → JSON spec → POST `/api/workflows`).
3. **Self-contained product**: fly.io retired from critical path. musu installs as a single unit on user's PCs; first-installed PC owns signaling rendezvous role. STUN/TURN public servers only as failover when direct WebRTC fails.

K3s remains as deployed (proven substrate for company-namespace isolation, useful for process isolation between agent containers). **K3s is NOT used for workflow orchestration** in v2 — workflow state is in SQLite, scheduling is in asyncio, dispatch is over the existing channel.

V23.5 closed beta (V23 master §V23.5) is **fully blocked** on Phase 4 completion — there's no closed beta until users can design + run multi-PC workflows in a UI.

### 1.2 Branch strategy

Unchanged from v1: V23.3 + V23.4 Tier-1 main-merges first (operator action), then `v23/phase4` cut off `main`. Single operator-driven bundle for the predecessor.

### 1.3 Language stance (revised per SG-1 + SG-3 + SG-5)

**Python (musu-bridge) + TypeScript (musu-bee) only.** Go operator concept eliminated. Two-language burden avoided. No new toolchain (controller-gen, golangci-lint, envtest, setup-envtest) introduced.

### 1.4 V23.4 Tier-1 precondition status

- V23.4 Tier-1 SHIPPED on `v22/gap-analysis` HEAD `08b0c1a` (wiki/429 final closure)
- 228/228 jest green, tsc clean, pwsh AST clean
- 3 MEDIUMs from V23.3 wiki/391 §4 NEW-MED-1/2/3 closed
- 2 NEW forward-pointers added: F-B2-1-FOLLOW-1 (LOW hatch observability), F-B2-1-FIRST-RUN (INFO operator runbook)
- 17 V23.3 wiki/396 §5 forward-pointers + F-B2-1-FOLLOW-1 = **18 residual items** for T2-Z cleanup
- main-merge OPERATOR-PENDING — gates Phase 4 start

---

## §2 Sub-workstreams (revised per §0.3)

| ID | Scope | File paths | LOC est. | Parallel-with | Const-gates | agent-team | Audit type |
|---|---|---|---|---|---|---|---|
| **T2-A'** | musu-bridge gains `workflow_routes.py` (POST/GET/DELETE/PATCH `/api/workflows` backed by SQLite tables) + asyncio executor task that polls `workflow_steps WHERE status='pending' AND assigned_pc=THIS_PC LIMIT N` and dispatches to existing agent invocation machinery. Schema migration via existing v22 SQLite migrator (new schema version adds `workflows` + `workflow_steps` tables). Cross-PC dispatch via existing WebRTC/signaling channel; PC-B fetches its assigned steps from shared workflow state. NO K8s, NO CRD, NO webhook, NO operator. | `musu-bridge/workflow_routes.py` (NEW FastAPI module, ~120 LOC); `musu-bridge/workflow_executor.py` (NEW asyncio task, ~120 LOC); `musu-bridge/handlers.py` (extended — workflow CRUD + step transitions, ~40 LOC); `musu-bridge/schema/v43_workflows.sql` (NEW migration, ~30 LOC); `musu-bridge/tests/test_workflow_routes.py` + `test_workflow_executor.py` (NEW tests) | ~300 Python + tests | T2-C, T2-F, T2-Z | **III** (SQLite schema migration v43) | YES (control plane, but bounded scope) | **Single quality-engineer** (no CRD blast radius, no RBAC surface, no new auth — auth via existing global Bearer; downgraded from v1's DUAL because removed CRD/operator surface) |
| **T2-C** | musu-bee Fleet view: new `/fleet` route — list-of-PCs with capacity heat-map; "Add new PC" wizard calls existing `POST /api/admin/pair/accept` (per T2-A v1 Researcher finding 2026-05-18 — URL was wrong in v1); `/dashboard` 301-REDIRECT to `/fleet` for 1 release cycle + 10-reference audit (sidebar/CommandPalette/middleware/nested deep-link migration); real-time SSE updates from existing `/api/watch/subscribe`; K8s-vocabulary lint as defense-in-depth (load-bearing dropped per §0.4 — but kept). | `musu-bee/src/app/fleet/page.tsx`, `fleet/FleetClient.tsx`, `fleet/AddPcWizard.tsx`, `fleet/PcCapacityCard.tsx`; `musu-bee/src/app/page.tsx` (redirect); `musu-bee/src/middleware.ts` (301 redirect rules); `musu-bee/src/app/dashboard/` + `app/app/dashboard/` (both → 301 stubs for 1 release); 10 referencing files (sidebar, CommandPalette, etc.); `musu-bee/src/lib/vocabulary-audit.ts` + Jest test | ~1000 TS/React | T2-A', T2-D, T2-F, T2-Z | **VII** only (read-mostly) | YES (UI + onboarding flow) | **Single quality-engineer** |
| **T2-D** | musu-bee React Flow workflow editor: add `@xyflow/react` dependency; `/c/[company]/workflows` list + `/c/[company]/workflows/[id]` edit routes; node palette from `/api/agents`; drag-connect edge → JSON spec → POST `/api/workflows`; run/pause/view live execution graph polling `/api/workflows/[id]/status` (SQLite rows, no Argo polling); **Local+SaaS parity verification** (same SPA on localhost:8070; `<user>.musu.pro` deferred to V23.5 — make parity a smoke gate, not blocking). | `musu-bee/package.json` (+@xyflow/react ^12.x); `musu-bee/src/app/c/[company]/workflows/page.tsx`, `[id]/page.tsx`, `EditorClient.tsx`, `NodePalette.tsx`, `AgentNode.tsx`, `RunPanel.tsx`; `musu-bee/src/lib/workflow-spec.ts` (NEW — encode React Flow graph → plain JSON, decode JSON → graph; NOT CRD shape); `musu-bee/src/app/api/workflows/route.ts` (proxy to bridge); `__tests__/workflow-spec.test.ts` (encode/decode round-trip); `__tests__/workflows-editor.spec.ts` (Playwright) | ~1400 TS/React | T2-C, T2-F, T2-Z (sequential after T2-A' for API endpoints) | **VII** only | YES (UI + API) | **Single quality-engineer** + parity smoke |
| **T2-F** | fly.io retirement: delete `musu-relay/Dockerfile` + `musu-relay/fly.toml` from repo; signaling rendezvous moved to user's first-installed PC (acts as broker for that user's fleet); STUN/TURN public-server failover for direct-WebRTC-fails cases (Google STUN free, no TURN dep unless NAT pathologically strict — defer TURN self-host to V23.5 if needed); installer/install-wsl2.ps1 detects first-install vs subsequent and sets `MUSU_SIGNALING_ROLE=rendezvous` or `MUSU_SIGNALING_ROLE=peer` accordingly; musu-bridge gains `signaling_routes.py` (WebRTC SDP/ICE exchange + room model — same shape as existing musu-relay/src/signaling/ but in-process); cross-PC handshake uses local network mDNS first, then user's dynamic DNS or Tailscale magic DNS (operator chooses at install). | `musu-relay/Dockerfile` (DELETE); `musu-relay/fly.toml` (DELETE); `musu-bridge/signaling_routes.py` (NEW — port musu-relay/src/signaling/ shape into bridge process, ~250 LOC); `installer/install-wsl2.ps1` (rendezvous role detection, ~30 LOC); `musu-bridge/handlers.py` (signaling state model, ~50 LOC); `musu-bee/src/lib/signaling-client.ts` (point at `${BRIDGE_URL}/signaling` not `signaling.musu.pro`); `musu-bridge/tests/test_signaling.py` | ~400 Python + small TS + installer edits | T2-A', T2-C, T2-D, T2-Z (orthogonal — different file surface) | **VII** only; **NOT a Const III** (signaling state is in-memory, no DB schema) | YES (cross-host coordination + WebRTC) | **Single quality-engineer** + smoke test "signaling works PC-to-PC without fly in deploy path" |
| **T2-Z** | Tier-1 residual cleanup — 18 items grouped into **6 micro-batches** (Z1-Z6); each batch own wiki ID + closure. Z1: F-B2-1-FOLLOW-1 hatch observability + FO-A1a-1 GIT_SHA OCI label; Z2: F-A1c-1..4 bench tool ergonomics; Z3: F-A1c-5..8 bench schema; Z4: F-A1c-9/10 bridge-bench.sh full §5.6 schema + bench-windows.ps1; Z5: FO-A1a-3 distroless pivot (re-evaluate post-T2-F since one less image to distroless); Z6: FO-A1a-4/5 image trim + FO-A1a-6 plan template post-mortem. Note: F-A1c bench-tooling sub-batches may have reduced value post-T2-F (Argo benchmark scenario eliminated); reassess at Z2 start. | per-batch — see §5.Z | ~300 total | parallel with T2-A'/C/D/F (orthogonal) | **VII** only per batch | NO per batch (one-page closure precedent from V23.3 B7/B8 + V23.4 F-B2-2) | one-page closure per batch |

Total: ~3400 LOC across 5 sub-WS over ~6-7 weeks core + buffer.

### 2.1 Architectural decisions (revised per §0)

- **Workflow execution substrate**: **asyncio + SQLite + single FastAPI process** (musu-bridge). Same proven pattern as V23.4 Tier-1 `install_attempt` sweeper (wiki/426). Workflow state in SQLite, scheduling in asyncio, dispatch over existing WebRTC channel. NO K3s native orchestration, NO Argo, NO CRD, NO operator, NO admission webhook.
- **K3s role (UNCHANGED from before V23.4 Phase 4)**: stays as already-deployed substrate for company-namespace isolation + agent process isolation. Phase 4 does not extend or shrink K3s usage. K3s is *available* if a workflow step needs containerized agent isolation, but workflow *orchestration* lives above K3s in musu-bridge.
- **Cross-PC dispatch**: via existing WebRTC/signaling channel (T2-F retires fly.io, moves signaling rendezvous to user's first PC).
- **Signaling rendezvous (T2-F)**: first-installed PC in a user's fleet plays rendezvous role (static assignment in v1 of T2-F; dynamic election deferred). User's other PCs connect to rendezvous PC for SDP/ICE exchange. STUN public servers (Google `stun:stun.l.google.com:19302`) as ICE candidate gatherer (free, stateless). Self-hosted TURN deferred to V23.5 if needed.
- **musu-bee routing**: `/` → `/fleet` (default), `/c/[company]/workflows` (list), `/c/[company]/workflows/[id]` (edit). `/dashboard` 301-REDIRECT to `/fleet` for 1 release cycle. `/c/[id]` + `/m/[id]` KEPT.
- **Workflow API surface**: `/api/workflows` (POST create, GET list), `/api/workflows/[id]` (GET, PATCH, DELETE), `/api/workflows/[id]/status` (GET — polled by RunPanel; also SSE-eligible via existing `/api/watch/subscribe?table=workflows`). All under existing global Bearer auth via `apply_musu_middlewares`.
- **Workflow spec shape (JSON, NOT CRD)**: `{name, agents: [{id, image, command, nodeSelector?, timeoutSeconds?, retry?, resources?, inputs?, outputs?}], edges: [{from, to, condition?}]}`. Same fields as v1 CRD plan would have had — just stored as JSON in a SQLite column, validated by Pydantic on POST, no Kubernetes OpenAPI schema constraint surface.
- **musu-pro coordination**: NOT in Phase 4 scope. V23.5 will add Paddle + `<user>.musu.pro` provisioning. **Pre-flag**: Phase -1 panel SG-9 noted Paddle is another paid SaaS dep about to be locked in by V23.5; V23.5's own Phase -1 will RED that unless installer-optional or self-hostable from day one.

---

## §3 Sequence + parallelization map (revised — simpler than v1)

### 3.1 Dependencies

```
T2-A' (asyncio + SQLite workflow runner + /api/workflows)
  └─→ T2-D (React Flow editor — needs /api/workflows endpoint)

T2-C (Fleet view) ── independent — uses existing axis_routes + accept_pair
T2-F (fly retirement) ── independent — different file surface (musu-relay/ + installer/)
T2-Z (residual cleanup) ── independent — orthogonal
```

Single hard dependency: T2-D after T2-A'. T2-B + T2-A→T2-B chain ELIMINATED with T2-B itself.

### 3.2 Recommended commit ordering

1. wiki/431-v2 (this revision) — single commit on `v22/gap-analysis` BEFORE branch cut, so revision survives main-merge
2. main-merge V23.3 + V23.4 Tier-1 (operator action, per §1.4)
3. `git checkout -b v23/phase4 main`
4. **T2-A'** Researcher → Planner → Critic → Builder → Auditor (single quality-engineer) → Scribe (wiki/432 detail + wiki/436 closure)
5. **Parallel from here**: T2-C (wiki/434+438), T2-F (wiki/433+437 — IDs freed by T2-B elimination), T2-Z micro-batches (wiki/440-445)
6. **T2-D** (after T2-A' ships): wiki/435+439
7. V23.4 Phase 4 final closure (wiki/447) + qual eval (wiki/448) + CHANGELOG 1.12.0 + V23 master §V23.4 SHIPPED hook

### 3.3 Timeline (revised — was 9-11 weeks, now 8 weeks max)

| Week | Activity |
|---|---|
| W1 | Operator main-merge (fly secrets + deploy + smoke + 진행해 + git merge); v23/phase4 branch cut; wiki/431-v2 committed pre-merge |
| W2 | T2-A' Researcher + Planner + Critic + Builder start |
| W3 | T2-A' Audit + audit-fix + Scribe → SHIP (Const III gate — SQLite migration only) |
| W4-5 | Parallel: T2-C (Fleet view) + T2-F (fly retirement) + T2-Z Z1/Z2/Z3 — different file surfaces, no merge conflict |
| W6-7 | T2-D Builder + audit + parity smoke; T2-Z Z4/Z5/Z6 finalize |
| W8 | V23.4 Phase 4 final closure + qual eval; CHANGELOG 1.12.0; main-merge gate |

Buffer: W9-W10 for audit-fix cascades. Total: 8 weeks core + 2 buffer = 10 weeks max (was 11+ in v1).

### 3.4 Operator pre-Phase 4 checklist

Unchanged from v1 except (e) revised:

(a) `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` — still needed to authorize current production
(b) `fly deploy` + smoke 204/400/429 — last fly deploy before T2-F retires it
(c) A1.c bench EXECUTION on Windows host (captures baseline for V23.5+ — Const VI no longer needed for Phase 4 since no Argo install)
(d) Confirm 2-PC gate test rig (still needed for end-to-end gate test §9 #9)
(e) ~~Const VII "진행해"~~ + main-merge

**NOTE on (a) + (b)**: these are last-time-touching-fly operations; T2-F retires fly entirely. Operator may choose to skip (a) + (b) if comfortable letting current fly deploy run as-is until T2-F SHIPs and replaces it. Recommended: do (a) + (b) anyway so production telemetry has v42 authorized for the few weeks until T2-F deploys self-hosted signaling.

---

## §4 Constitution gates predicted (revised — fewer triggers)

| Gate | Prediction | Reasoning + mitigation |
|---|---|---|
| **Const III** (schema apply) | **TRIGGERED on T2-A'** | SQLite schema migration v37 (per T2-A' Phase 0 Researcher 2026-05-18: current max is v36, next free is v37) adds `workflows` + `workflow_steps` tables. Operator "진행해" required at first production deploy. Lower blast radius than v1's CRD apply — SQLite migration is reversible via standard musu-core migrator rollback (`_v37_down` defined alongside `_v37_up`). |
| **Const VI** (experiment) | **NOT triggered** (was TRIGGERED in v1) | No Argo install. No K3s baseline change. asyncio executor task overhead measured during T2-A' Builder phase via per-test timings, NOT a full A1.c bench rerun. |
| **Const VII** (push) | **Per-push ACTIVE**; **main-merge gate at Phase 4 close** | Unchanged. Every commit push satisfies per-push. Main-merge bundle at Phase 4 close = single operator "진행해". |
| **Pre-Phase 4** | Operator main-merge of V23.3 + V23.4 Tier-1 to `main` (gates Phase 4 start) | See §3.4 checklist (a)-(e). |

### §4.1 ~~Const VI baseline~~ (REMOVED — no Argo install in v2)

v1 §4.1 added Const VI baseline + 30% threshold to gate Argo install regression. v2 eliminates Argo, so this section is moot. Asyncio executor performance characterized via T2-A' Builder-phase tests (per-step latency, executor poll interval impact on CPU idle).

---

## §5 Sub-WS specs (concise)

### §5.A' T2-A': asyncio + SQLite workflow runner + /api/workflows

**Files** (revised per §0.3 — was v1 §5.A "Argo + CRD + webhook"):

- `musu-bridge/workflow_routes.py` (NEW FastAPI router — POST/GET/DELETE/PATCH /api/workflows + /api/workflows/[id]/status; mounted in server.py beside system_router per T2-A v1 Researcher convention)
- `musu-bridge/workflow_executor.py` (NEW asyncio task — polls `workflow_steps WHERE status='pending' AND assigned_pc=THIS_PC LIMIT N`; dispatches via existing agent invocation; writes status back; per-step timeout enforced via `asyncio.wait_for`; backoff on transient errors)
- `musu-bridge/handlers.py` (EXTEND — `create_workflow()`, `assign_steps_to_pcs()` based on agent nodeSelector + machine_capacity, `transition_step_status()`)
- `musu-core/src/musu_core/migrations.py` (EDIT — append `_v37_up` + `_v37_down` to MIGRATIONS list at :1483; **CORRECTED by T2-A' Phase 0 Researcher 2026-05-18**: schema version is **v37** NOT v43 — current max is v36 at migrations.py:1482; AND migrations live in `musu-core/migrations.py` NOT `musu-bridge/schema/` which doesn't exist. New tables: `workflows {id, company_id, name, spec_json, status, created_at, updated_at}` + `workflow_steps {id, workflow_id, agent_id, assigned_pc, status, input_json, result_json, error_json, retry_count, depends_on_json, started_at, finished_at}`. Also update `musu-core/src/musu_core/controllers/sources.py:31-50` `_ALLOWED_TABLES` to include `workflows` + `workflow_steps` for SSE eligibility.)
- `musu-bridge/tests/test_workflow_routes.py` (NEW — POST validates spec via Pydantic, 409 on duplicate, GET list filtered by company_id, PATCH transitions, DELETE cascades)
- `musu-bridge/tests/test_workflow_executor.py` (NEW — pending-step pickup, retry/backoff, timeout, idempotency on restart)

**Workflow execution flow**:
```
User POSTs /api/workflows {name, spec: {agents, edges}} to musu-bridge
  → workflow_routes.create_workflow():
     1. Validate spec via Pydantic (cross-field checks: agent.id uniqueness, edges reference existing agents, no cycles)
     2. INSERT INTO workflows (spec_json, status='pending', company_id, ...)
     3. assign_steps_to_pcs(workflow_id, spec) — topological sort + match agent.nodeSelector to machine_capacity rows
     4. INSERT INTO workflow_steps (...) for each agent
     5. Return {id, status: 'pending'}

workflow_executor (background asyncio task, runs on EVERY PC's musu-bridge instance):
  every executor_poll_interval (default 1s):
    1. SELECT * FROM workflow_steps WHERE assigned_pc=THIS_PC AND status='pending' AND dependencies_satisfied LIMIT N
    2. For each step:
       a. UPDATE status='running', started_at=NOW()
       b. dispatch to existing agent invocation (heartbeat_scheduler / existing dispatch path)
       c. On result: UPDATE status='succeeded'|'failed', finished_at=NOW(), result_json=...
       d. On timeout: UPDATE status='timeout', finished_at=NOW()
       e. On transient error: UPDATE retry_count++ if < max_attempts, else status='failed'
    3. If all steps for a workflow done: UPDATE workflows.status='succeeded'|'failed'

Cross-PC: PC-B's executor sees `assigned_pc=PC_B` rows in the SHARED bridge state. State sharing via existing /api/watch/subscribe SSE (PC-B subscribes to workflow_steps table changes for THIS_PC and reacts).
```

**Const III workflow** (operator-gated): T2-A' detail plan provides apply checklist (dry-run migration on staging SQLite snapshot → review schema → apply → verify table creation → smoke POST via /api/workflows).

**Audit seed (single quality-engineer)**:
- Schema correctness (Pydantic round-trip)
- Step assignment correctness (topological sort + nodeSelector matching)
- Idempotency on executor restart (running steps not double-dispatched)
- Cross-PC dispatch (PC-B picks up assigned_pc=PC_B steps via existing SSE)
- DELETE cascade (workflow delete → workflow_steps delete)

**Wiki**: wiki/432 detail + wiki/436 closure.

**T2-A' Phase 0 Researcher findings (2026-05-18, beyond schema-v37 + migration-location corrections above)**:
- **Agent invocation primitive ALREADY EXISTS**: `enqueue_wake(db, agent_id, wake_reason, wake_payload) → run_id` + `await execute_wake(db, router, run_id)` in `musu-core/src/musu_core/dispatch/wake.py:75-189`. T2-A' executor WRAPS these (does not build new dispatch path). Result via `SELECT status, summary, error FROM heartbeat_runs WHERE id=?` (per `dispatch_routes.py:93-116`). Timeout NOT in execute_wake — T2-A' wraps with `asyncio.wait_for(execute_wake(...), timeout=spec.timeoutSeconds)`.
- **TOCTOU-safe step claim pattern**: mirror `wake.py:184-189` `UPDATE ... SET status='running' WHERE id=? AND status='pending' RETURNING ...` for the workflow_steps claim. Matches user MEMORY `pattern-toctou-atomic-update`. If rowcount=0, another executor won the race (skip).
- **Cross-PC R3 DECISION: Pattern A (single-source-on-rendezvous-PC)**. Rationale: existing `sync_engine.py:155-247` replicates only companies/messages/agents (LWW pull-based), not transactional tables; mesh_router.py is forward-only HTTP routing; no existing infrastructure for `workflow_steps` cross-PC sync. Pattern B (replicated state) requires +500 LOC new sync infra outside T2-A' scope. **Pattern A flow**: rendezvous PC owns workflows + workflow_steps SQLite store; PC-B's executor polls `GET https://rendezvous-pc/api/workflows/_pending?assigned_pc=PC_B` via existing `mesh_router._forward_http`; PC-B PATCHes results back via `PATCH /api/workflows/[id]/steps/[step_id]`. Auth via existing `_get_sync_token()` Bearer.
- **/api/watch/subscribe CANNOT WHERE-filter** (`watch_routes.py:91-120` — only `table` query param, no payload columns). Cross-PC pickup is POLLING, not SSE-filter. RunPanel UI also polls (SSE deferred — broadcast-only, needs client-side filter regardless).
- **THIS_PC identity**: `MUSU_NODE_NAME` env var (per `heartbeat_scheduler.py:250`) is what executor knows itself as; `machines.id` is opaque DB key. Executor at startup: `SELECT id FROM machines WHERE hostname=? OR id=?` with `MUSU_NODE_NAME` to resolve THIS_MACHINE_ID. Store `machines.id` in `workflow_steps.assigned_pc` with FK `REFERENCES machines(id) ON DELETE SET NULL` (cascade-delete would orphan mid-run; null lets executor treat as "needs reassignment").
- **Dependency satisfaction**: SQL-based at executor poll time, using new column `workflow_steps.depends_on_json` (pre-computed at POST time via topological sort in Pydantic validator). Stores `[{from_agent_id, condition: 'succeeded'|'failed'|'always'}]` per upstream dependency. Avoids re-parsing `spec_json` every poll. Cycle detection: Kahn's algo in Pydantic `@model_validator(mode='after')`.
- **Crash recovery (OQ-RES-2 RESOLVED)**: at executor startup, mark all 'running' steps for THIS_PC as 'failed' with `error_json={"reason": "executor_crash"}`. Rationale: explicit failure surfaces operator awareness; user manually retries; no double-invoke risk (mark-pending option could double-dispatch agents). Heartbeat-timestamp policy (most correct) deferred to V23.5.
- **Pydantic v2 confirmed** (`pyproject.toml:12` `pydantic>=2.0`). Use `@field_validator` + `@model_validator(mode='after')`.
- **nodeSelector convention (OQ-RES-1 RESOLVED)**: simple key-value match against `machine_capacity` columns: `{"gpu_vram_free_gb_min": "8", "os": "linux", "gpu_present": "true"}`. No new `machines.labels_json` column. Maps to query: `SELECT m.id FROM machines m JOIN machine_capacity mc ON m.id=mc.machine_id WHERE m.status='online' AND mc.gpu_vram_free_gb >= 8 AND m.os='linux' AND mc.gpu_models_json != '[]' ORDER BY mc.gpu_vram_free_gb DESC LIMIT 1`. First-match wins. No PC matches → POST returns 422 `{"error": "no_eligible_pcs", "agent_id": "X", "selector": {...}}`.
- **PATCH scope (OQ-RES-5 RESOLVED)**: status-only for MVP. Spec mutation = V23.5 (workflow versioning). PATCH body `{"status": "running"|"paused"|"cancelled"}`.
- **executor_poll_interval (OQ-RES-6 RESOLVED)**: default 1s, env-tunable via `MUSU_WORKFLOW_EXECUTOR_POLL_MS=1000`. Matches F-B2-1 sweeper precedent (wiki/426).
- **LOC realistic estimate**: ~320 Python (workflow_routes ~120 + workflow_executor ~120 + handlers extensions ~80) + ~30 SQL (v37 migration) + ~80 tests. Total ~430. Master plan §2 said ~300; revised slightly up by +100 for Pattern A polling branch + depends_on_json column.

### §5.B ~~T2-B Go operator~~ (ELIMINATED per §0)

v1 §5.B specified 1300 LOC Go controller-runtime operator. All 4 Phase -1 framework HIGH-converged against this. T2-B does not exist in v2.

### §5.C T2-C Fleet view UI (UNCHANGED from v1 except K8s-lint downgrade)

**Files** (revised per OQ-CRIT-4 retire-with-redirect, validated by T2-A v1 Researcher accept_pair finding):

- `musu-bee/src/app/fleet/page.tsx` (NEW — Next.js page, SSR shell)
- `musu-bee/src/app/fleet/FleetClient.tsx` (NEW — client component, useEffect + SSE)
- `musu-bee/src/app/fleet/AddPcWizard.tsx` (NEW — modal wizard, calls `POST /api/admin/pair/accept` per T2-A v1 Researcher finding `system_routes.py:94`; body `{name, url, agents, version}`; response `{success, node_name}`; auth via existing global Bearer)
- `musu-bee/src/app/fleet/PcCapacityCard.tsx` (NEW — per-PC card with capacity heat-map)
- `musu-bee/src/app/page.tsx` (EDIT — redirect `/` → `/fleet`)
- `musu-bee/src/middleware.ts` (EDIT — add `/dashboard*` → `/fleet*` 301 redirect; preserves deep-link mapping)
- `musu-bee/src/app/dashboard/` + `app/app/dashboard/` (KEEP as 301 stubs for 1 release; page.tsx becomes `redirect("/fleet")`)
- 10 referencing files audit (middleware, DashboardClient, ConsoleSidebar, CommandPalette, nested chat — per v1 §5.C C-04 evidence; sidebar nav swap, CommandPalette entry swap)
- `musu-bee/src/lib/vocabulary-audit.ts` (NEW — CI lint; **DEFENSE-IN-DEPTH** per §0.4 — load-bearing dropped since K8s vocabulary surface shrunk dramatically, but cheap insurance kept)
- `musu-bee/__tests__/vocabulary-audit.test.ts` (NEW — Jest test fails on banned vocabulary in app/ strings)

**Fleet view UX**: unchanged from v1 §5.C.

**Wiki**: wiki/434 detail + wiki/438 closure.

### §5.D T2-D React Flow workflow editor (simplified per §0.3)

**Files** (revised — workflow-crd.ts → workflow-spec.ts; CRD encode/decode → JSON encode/decode):

- `musu-bee/package.json` (EDIT — add `@xyflow/react ^12.x`)
- `musu-bee/src/app/c/[company]/workflows/page.tsx` (NEW — list of user's workflows for this company)
- `musu-bee/src/app/c/[company]/workflows/[id]/page.tsx` (NEW — editor SSR shell)
- `musu-bee/src/app/c/[company]/workflows/[id]/EditorClient.tsx` (NEW — React Flow canvas)
- `musu-bee/src/app/c/[company]/workflows/[id]/NodePalette.tsx` (NEW — left sidebar with agent templates)
- `musu-bee/src/app/c/[company]/workflows/[id]/AgentNode.tsx` (NEW — custom React Flow node component)
- `musu-bee/src/app/c/[company]/workflows/[id]/RunPanel.tsx` (NEW — right sidebar with Run/Pause/Logs; polls `/api/workflows/[id]/status`)
- `musu-bee/src/lib/workflow-spec.ts` (NEW — encode React Flow graph → JSON spec; decode JSON spec → graph; **NO Kubernetes OpenAPI constraint surface**)
- `musu-bee/src/app/api/workflows/route.ts` (NEW — proxy to musu-bridge `/api/workflows`)
- `musu-bee/__tests__/workflow-spec.test.ts` (NEW — encode/decode round-trip)
- `musu-bee/__tests__/workflows-editor.spec.ts` (NEW — Playwright: drag node, connect edge, save, run)

**Run flow** (revised — no Argo polling):
1. User clicks "Save" → frontend encodes React Flow graph to JSON spec → POST `/api/workflows` → musu-bridge creates rows in `workflows` + `workflow_steps` tables → T2-A' executor picks up pending steps assigned to each PC
2. User clicks "Run" → frontend POSTs `/api/workflows/[id]/run` (PATCH workflows.status='running') → executor transitions step statuses
3. RunPanel polls `/api/workflows/[id]/status` every 2s (or SSE) → updates node colors (pending=gray, running=blue, success=green, failed=red)

**Parity verification** (revised per §0.4 + C-15): same SPA bundle deploys on localhost:8070. `<user>.musu.pro` parity deferred to V23.5 (Paddle + provisioning). T2-D acceptance includes parity smoke as DISCIPLINE GATE (CI lint forbids hostname literals; runtime config via `/api/config` endpoint) but NOT phase-blocking since SaaS target doesn't exist yet.

**Wiki**: wiki/435 detail + wiki/439 closure.

### §5.F T2-F fly.io retirement (NEW per §0.3)

**Files**:

- `musu-relay/Dockerfile` (DELETE — no more fly OCI image)
- `musu-relay/fly.toml` (DELETE — no more fly app config)
- `musu-relay/.dockerignore` (DELETE if exists, fly-only)
- `musu-bridge/signaling_routes.py` (NEW FastAPI router — port `musu-relay/src/signaling/` Node.js logic to Python; WebRTC SDP/ICE exchange, room model, per-user signaling state; ~250 LOC)
- `musu-bridge/handlers.py` (EXTEND — signaling state model: rooms, peers, ICE candidate queues; ~50 LOC)
- `musu-bridge/server.py` (1-line `app.include_router(signaling_router)` beside existing routers)
- `installer/install-wsl2.ps1` (EDIT — detect first-install vs subsequent via `Get-MusuStateFile` content + `mesh_router.toml` peer count; if first install → `$env:MUSU_SIGNALING_ROLE='rendezvous'`; else → `$env:MUSU_SIGNALING_ROLE='peer'` with rendezvous PC URL discovered from existing peer pairing flow; ~30 LOC)
- `musu-bee/src/lib/signaling-client.ts` (EDIT — point at `${BRIDGE_URL}/signaling` not `signaling.musu.pro`; resolve `BRIDGE_URL` from runtime config endpoint per parity discipline)
- `musu-bridge/tests/test_signaling.py` (NEW — room model, peer join/leave, SDP/ICE relay)
- `installer/test-signaling-smoke.ps1` (NEW — PowerShell smoke test: 2 PCs in WSL2, PC-A in rendezvous role, PC-B as peer, verify WebRTC handshake completes without any fly.io DNS resolution; log resolver to confirm no `signaling.musu.pro` lookups)

**Signaling rendezvous design** (v1 of T2-F — simple, single static assignment):
- First-installed PC's musu-bridge runs signaling broker (mounted at `${BRIDGE_URL}/signaling/`)
- Subsequent PCs' installers learn rendezvous PC URL via existing `accept_pair` flow (rendezvous PC's URL stored in `mesh_router.toml` peer entry)
- Each user's fleet has exactly one rendezvous PC at a time
- Failover: dynamic rendezvous election deferred to V23.5 (out of T2-F scope; if rendezvous PC offline, other PCs in fleet can't initiate new WebRTC sessions but existing sessions survive until they need re-negotiation)
- STUN failover: Google `stun:stun.l.google.com:19302` (free, stateless) used as ICE candidate gatherer by all peers regardless of rendezvous availability
- TURN: NOT included in T2-F. Direct WebRTC + STUN handles ~80% of NAT scenarios; pathologically strict NAT (CGNAT-only mobile, etc.) deferred to V23.5

**Cross-network discovery**:
- LAN: mDNS first (`musu-rendezvous.local` advertised by rendezvous PC, discovered by peers via `Avahi`/`Bonjour`)
- WAN: user provides rendezvous PC's reachable address (DDNS like `*.duckdns.org` user-configured, or Tailscale magic DNS if user has Tailscale, or static IP). Installer prompts at first non-rendezvous install.

**Acceptance**:
- `git grep -r 'fly.io' musu-relay/ musu-bridge/` returns zero matches (or only test fixtures)
- `installer/test-signaling-smoke.ps1` passes (2 PCs in WSL2, WebRTC handshake completes, zero fly.io DNS lookups in dnsmasq logs)
- musu-bee `/api/config` returns `signaling_url` pointing at rendezvous bridge, NOT `signaling.musu.pro`

**Wiki**: wiki/433 detail + wiki/437 closure (IDs freed by T2-B elimination per §6).

### §5.Z T2-Z Tier-1 residual cleanup (mostly unchanged)

| Batch | Items | LOC est. | Wiki | Audit | Notes |
|---|---|---|---|---|---|
| **Z1** | F-B2-1-FOLLOW-1 (sweeper hatch observability `console.log` on short-circuit + `/health` flag) + FO-A1a-1 (GIT_SHA OCI label derivation move) | ~20 | wiki/440 | one-page | Z1 may need re-prioritization post-T2-F since fewer OCI images to label |
| **Z2** | F-A1c-1, F-A1c-2, F-A1c-3, F-A1c-4 (bench tool ergonomics) | ~50 | wiki/441 | one-page | Reassess at start: Argo bench scenario eliminated, some F-A1c items may not apply |
| **Z3** | F-A1c-5, F-A1c-6, F-A1c-7, F-A1c-8 (bench schema) | ~70 | wiki/442 | one-page | Same |
| **Z4** | F-A1c-9 + F-A1c-10 (bridge-bench.sh full §5.6 schema + bench-windows.ps1) | ~80 | wiki/443 | one-page | Same |
| **Z5** | FO-A1a-3 (distroless chainguard/python pivot) | ~30 | wiki/444 | one-page | Re-evaluate: one less image (no Go operator OCI), and after T2-F no fly OCI either; distroless effort smaller |
| **Z6** | FO-A1a-4 + FO-A1a-5 + FO-A1a-6 (image trim + plan template post-mortem) | ~40 | wiki/445 | one-page | Same |

**F-B2-4** (conditional per-IP rate-limit) — reactivation criteria: unchanged from v1 (≥3 abuse incidents/30d OR closed-beta >5 users OR operator request).

---

## §6 Wiki-ID reservations (revised per §0.3 sub-WS changes)

| Wiki | Purpose |
|---|---|
| wiki/431 | This master plan (Revision 2, supersedes v1) |
| wiki/432 / 436 | **T2-A'** detail / closure (was T2-A in v1) |
| wiki/433 / 437 | **T2-F** detail / closure (was T2-B Go operator in v1 — IDs reallocated since T2-B eliminated) |
| wiki/434 / 438 | T2-C detail / closure (unchanged) |
| wiki/435 / 439 | T2-D detail / closure (unchanged) |
| wiki/440-445 | T2-Z Z1-Z6 (unchanged) |
| wiki/446 | reserved for V23.5 prep |
| wiki/447 | V23.4 Phase 4 final closure |
| wiki/448 | V23.4 Phase 4 qualitative evaluation |
| wiki/449+ | reserved for V23.5 prep |

---

## §7 Risks + mitigations (revised — 4 risks retired, 1 added)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| ~~**R1**~~ | ~~Go + Python two-language burden~~ | RETIRED | T2-B eliminated. |
| ~~**R2**~~ | ~~Argo install changes K3s baseline~~ | RETIRED | No Argo install. |
| **R3** | 6-8 week long-running branch → main divergence | MED | Unchanged: rebase each sub-WS close. |
| **R4** | tldraw vs React Flow co-existence on musu-bee | LOW | Boundary documentation: tldraw for `/c/[id]` company canvas; React Flow exclusive to `/c/[company]/workflows/[id]`. `next/dynamic` code-split. |
| **R5** | Local + SaaS UI parity drift | MED→LOW (downgraded per §5.D — SaaS target doesn't exist for Phase 4 since `<user>.musu.pro` is V23.5) | Discipline gate: hostname literal CI lint + runtime config endpoint. Smoke phase-blocking removed since no SaaS target yet. |
| **R6** | K8s-vocabulary leakage detection | LOW (downgraded — K8s surface much smaller post-§0) | T2-C vocabulary-audit lint as defense-in-depth. |
| ~~**R7**~~ | ~~CRD schema breakage from Argo updates~~ | RETIRED | No CRD, no Argo. |
| ~~**R8**~~ | ~~Operator RBAC over-privilege~~ | RETIRED | No operator. |
| **R9** | Phase 4 timeline slip | MED | Each sub-WS closure tracks actual vs estimate; W9-W10 buffer. Scope-cut decision (defer parity smoke to V23.5) recorded in §5.D. |
| **R10 (NEW)** | T2-F signaling rendezvous PC offline → fleet can't initiate new WebRTC sessions | MED | v1 of T2-F documents static rendezvous = first-installed PC; failover deferred to V23.5 dynamic election. Existing sessions survive rendezvous outage until re-negotiation. User can manually restart rendezvous PC. Document in wiki/437 closure. |
| **R11 (NEW)** | T2-F STUN-only NAT traversal failure (pathologically strict CGNAT, no UPnP) | LOW | <20% of users per public NAT-type surveys. Deferred to V23.5 TURN-self-host. Documented as known limitation in installer help text. |

---

## §8 Scope NOT included

Unchanged from v1 plus:

- **TURN server self-hosting**: deferred to V23.5 if T2-F deployment surfaces pathological-NAT cases
- **Dynamic signaling rendezvous election**: deferred to V23.5 (static first-installed-PC assignment in T2-F v1)
- **Workflow versioning** (user edits same workflow multiple times → version history): deferred to V23.5
- **Concurrent editing of same workflow** (two browser tabs): deferred to V23.5
- **musu-pro side changes** (F:\Aisaak\Projects\musu-pro): NOT in Phase 4 scope. V23.5 coordinates cross-repo
- **musu-worker/musu-supervisor/musu-port retirement**: single "package retirement" commit at Phase 4 final close (unchanged from v1)
- **V21.A controller-pattern branch fold-in**: throwaway (unchanged from v1; even more clear now since v2 doesn't need any controller pattern)
- **Spike-demo cleanup**: deferred decision (unchanged)
- **Offline-PC display in Fleet view**: V23.5 scope (unchanged from v1 §8)

---

## §9 Acceptance criteria for V23.4 Phase 4 closure (revised per §0.3)

1. ✅ T2-A' SHIP-OK with single quality-engineer audit (wiki/436 closure; `/api/workflows` CRUD live; SQLite v37 migration applied; asyncio executor running)
2. ✅ T2-F SHIP-OK with single quality-engineer audit + smoke test (wiki/437 closure; `musu-relay/Dockerfile` + `fly.toml` deleted from repo; signaling smoke test passes; zero `fly.io` DNS lookups during 2-PC handshake)
3. ✅ T2-C SHIP-OK with single quality-engineer audit (wiki/438 closure; `/fleet` live; vocabulary lint passing)
4. ✅ T2-D SHIP-OK with single quality-engineer audit + parity discipline (wiki/439 closure; hostname literal lint passing; `/api/config` runtime resolution working on localhost)
5. ✅ T2-Z Z1-Z6 all SHIP-OK (wiki/440-445 closures exist)
6. ✅ `npx jest` green in musu-bee + `pytest` green in musu-bridge
7. ✅ `npx tsc --noEmit` clean across all TS packages
8. ✅ ~~`go test ./...` + `go vet ./...`~~ — N/A in v2 (no Go)
9. ✅ **End-to-end gate test**: user creates 3-step DAG in musu-bee `/c/[company]/workflows/new` editor → POSTs JSON spec → musu-bridge T2-A' executor distributes steps across 2 PCs → results visible in RunPanel (V23 master §V23.3 :929-933 Gate semantics)
10. ✅ Const III gate satisfied for SQLite v37 migration prod apply (operator "진행해")
11. ✅ ~~Const VI gate~~ — N/A in v2 (no Argo install, no baseline change)
12. ✅ Const VII main-merge gate satisfied: operator "진행해" + `git merge v23/phase4 → main`
13. ✅ wiki/447 final closure + wiki/448 qual eval written
14. ✅ V23 master plan §V23.4 status hook updated to "SHIPPED"
15. ✅ CHANGELOG 1.12.0 entry added
16. ✅ **(NEW per §0.3)** Deploy path contains zero `fly` commands; `git grep -r fly.io musu-relay/ musu-bridge/ installer/` returns zero non-test matches

### §9.A Gate test environment (unchanged from v1)

End-to-end gate test §9 #9 requires 2 PCs. To avoid circularity with wizard-under-test:

- **Rig**: 2 physical PCs OR 2 VMs (operator decides at T2-A' start)
- **2nd PC provisioning timing**: BEFORE gate test, via known-good path (operator runs `installer/install-wsl2.ps1 -PairToken <existing-bridge-mint>` manually)
- **T2-C wizard tested SEPARATELY**: T2-C audit exercises wizard against 3rd test PC
- **Gate test scope**: load existing 2-PC cluster, create 3-step DAG in editor, click Run, observe execution in RunPanel
- **T2-D Builder spawn precondition**: rig confirmed

---

## §10 V23.5 horizon items (post-Phase 4)

Unchanged from v1, plus pre-flag per Phase -1 panel SG-9:

- Paddle subscription plan integration (per-user pricing) — **WILL HIT V23.5 Phase -1 gate if not designed installer-optional from day one**
- `<user>.musu.pro` DNS provisioning (musu-pro side) — V23.5 Phase -1 may also question this
- Onboarding wizard (musu-bee + musu-pro)
- 5 closed-beta users handpicked
- Dynamic signaling rendezvous election (T2-F failover beyond static assignment)
- TURN self-hosting if T2-F deployment surfaces NAT-pathological users
- Workflow versioning + concurrent editing
- Signaling control plane <-> Fleet view integration (offline PC display)

---

## §11 Critic Findings (resolved) — 6 retired with eliminated sub-WS, 11 carry forward

Phase 1.5 Critic = `system-architect`, originally run 2026-05-18 on wiki/431-v1. 17 findings total. Post-Phase -1 retirement: 6 findings retire alongside eliminated sub-WS (T2-A, T2-B); 11 carry forward to T2-A'/C/D/F/Z scope in v2.

### §11.1 Findings retired (alongside eliminated sub-WS)

| ID | Retired because | Original sev |
|---|---|---|
| **C-01** | CRD schema completeness — no CRD in v2 | HIGH |
| **C-02** | Namespace model for CRD — no namespaced CRD in v2 | HIGH |
| **C-03** | Operator finalizer flow — no operator in v2 | HIGH |
| **C-05** | Const VI Argo baseline — no Argo in v2 | HIGH |
| **C-12** | Webhook vs operator defensive validation — no webhook in v2 | MED |
| **C-16** | Go test infra bootstrap — no Go in v2 | INFO |

### §11.2 Findings carried forward (apply to v2 sub-WS)

| ID | Sev | Carries to | Status in v2 |
|---|---|---|---|
| **C-04** | HIGH | T2-C | Retire-with-301-redirect mandate unchanged |
| **C-06** | HIGH | T2-D | Gate test environment §9.A unchanged |
| **C-07** | MED | (retired — was about 2-image bundle which doesn't exist in v2; mark RETIRED) | Retired |
| **C-08** | MED | T2-D | R5 parity mitigation rewrite unchanged |
| **C-09** | MED | T2-Z | Micro-batch grouping consistency unchanged |
| **C-10** | MED | §3.3 | Timeline shift applied (was W1 squeeze; now W1+W2 separation, total 8 weeks not 11) |
| **C-11** | MED | (retired — was about Argo version pin which doesn't exist in v2; mark RETIRED) | Retired |
| **C-13** | LOW | T2-D | tldraw + React Flow code-split |
| **C-14** | LOW | T2-C | accept_pair URL — RESOLVED in v2 (T2-A v1 Researcher confirmed `POST /api/admin/pair/accept` per `system_routes.py:94`; T2-C wizard updated accordingly) |
| **C-15** | LOW | T2-C / §8 | Offline-PC = V23.5 scope (unchanged) |
| **C-17** | INFO | T2-Z | F-B2-4 deferral criteria pinned (unchanged) |

### §11.3 Phase -1 Strategic Gate findings (SG-1 through SG-9)

All adjudicated in §0 above. SG-1 through SG-5 resolved via reshape. SG-6 retired with Argo elimination. SG-7 resolved via Phase -1 gate adoption. SG-8 acknowledged (lint kept as defense-in-depth). SG-9 pre-flagged for V23.5.

---

## §12 References

- `F:\workspace\musu-bee\docs\V23_MASTER_PLAN_2026_05_15.md` (V23 master — §V23.4 spec at :803-822; thesis at :333 — note K3s+Argo half of substrate sentence partially reshaped; K3s kept for isolation, Argo eliminated)
- `F:\workspace\musu-bee\docs\V23_4_TIER1_FINAL_CLOSURE_2026_05_17.md` (wiki/429 — predecessor)
- `F:\workspace\musu-bee\docs\V23_4_TIER1_QUAL_EVAL_2026_05_17.md` (wiki/430 — cadence lessons)
- `F:\workspace\musu-bee\docs\V23_4_MASTER_PLAN_2026_05_17.md` (wiki/425 — Tier-1 template followed)
- `F:\workspace\musu-bee\docs\V23_3_FINAL_CLOSURE_2026_05_17.md` (wiki/396 — §5 17 forward-pointers source for T2-Z)
- `F:\workspace\musu-bee\CHANGELOG.md` (1.10.0 V23.3 + 1.11.0 V23.4 Tier-1; 1.12.0 reserved for Phase 4)
- `F:\workspace\musu-bee\musu-bee\package.json` (tldraw 5 present, @xyflow/react absent)
- `F:\workspace\musu-bee\musu-bee\src\app\c\[id]\page.tsx` + `m\[id]\page.tsx` (V21.F two-axis surface kept)
- `F:\workspace\musu-bee\musu-bridge\server.py` (~2200 LOC FastAPI — T2-A' extends with workflow_routes + workflow_executor; T2-F extends with signaling_routes)
- `F:\workspace\musu-bee\musu-bridge\system_routes.py:94` (accept_pair existing mount — T2-C wizard reuses)
- `F:\workspace\musu-bee\musu-relay\src\signaling\` (existing Node.js signaling — T2-F ports to Python in musu-bridge, then DELETES this directory along with Dockerfile + fly.toml)
- MODE_Agent_Team.md (Phase -1 + Phase 0-7 + dual-audit triggers; Phase -1 added 2026-05-18 in response to V23.4 fly+Argo creep; this revision is inaugural successful Phase -1 catch)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-self-contained-product.md` (user policy violated by v1)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-no-yagni-architecture.md` (user policy violated by v1)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-strategic-critic-gate.md` (gate origin, now validated)
- T2-A v1 Phase 0 Researcher findings (incorporated inline in §5.A' + §5.C — Argo version note retires with sub-WS; accept_pair URL correction kept)
- Phase -1 Strategic Gate report 2026-05-18 (incorporated inline in §0 — full debate envelope archived for posterity; orchestrator confirms RED verdict and applies reshape per user approval)

---

## Revision history

| Rev | Date | Change | Trigger |
|---|---|---|---|
| **v1** | 2026-05-18 (earlier) | Original master plan: Argo + CRD + Go operator + fly.io retention. 4400 LOC, 9-11 weeks, 3 languages. | system-architect Critic gate (17 findings, all tactical — missed thesis) |
| **v2** | 2026-05-18 | Reshape per Phase -1 Strategic Gate RED verdict. T2-A→T2-A' (asyncio+SQLite), T2-B ELIMINATED, T2-F (fly retirement) ADDED. 3400 LOC, 8 weeks max, 2 languages, 0 paid SaaS in critical path. | Phase -1 business-panel-experts debate; 4-framework convergence on 8 HIGH findings; user accepted reshape |
| **v3** | 2026-05-18 (this update) | §13 Sub-WS execution status added. T2-A' SHIPPED; T2-F + T2-C plan-drafted with Critic BLOCK; T2-D pending; T2-Z deferred. | Mid-Phase-4 status checkpoint after T2-A' Builder+Auditor+Scribe cycle complete |

---

## §13 Sub-WS execution status (updated 2026-05-18, post T2-A' ship)

| Sub-WS | Phase | Status | Detail | Closure |
|---|---|---|---|---|
| **T2-A'** | 0→1→1.5→3→5→7 | **SHIPPED** | wiki/432 | wiki/436 |
| **T2-F** | 0→1→1.5 BLOCK | plan-stage Critic returned 5 HIGH; revision queued | wiki/433 | wiki/437 (pending) |
| **T2-C** | 0→1→1.5 BLOCK | plan-stage Critic returned 3 HIGH; revision queued | wiki/434 | wiki/438 (pending) |
| **T2-D** | not started | gated on T2-A' API (now live) + T2-C component conventions | wiki/435 (pending) | wiki/439 (pending) |
| **T2-Z** | not started | 6 micro-batches Z1-Z6 deferred to Phase 4 close | wiki/440-446 (pending) | wiki/446 (pending) |

### T2-A' SHIPPED detail (branch `v23/phase4` HEAD `6f55e99`)

- **Phase 0 Researcher**: 6 OQs resolved with file:line evidence (schema v37 location, enqueue_wake primitive, Pattern A vs B, depends_on_json shape, crash recovery default, executor poll interval)
- **Phase 1 Planner**: wiki/432 detail plan ~1000 lines, 9 sections
- **Phase 1.5 Critic** (system-architect): 5 HIGH + 5 MED + 4 LOW + 3 INFO
  - H1: `_is_primary` env var (MUSU_NODE_ROLE not MUSU_PRIMARY_URL)
  - H2: RETURNING + truthiness check (no `.rowcount` on `db.execute()`)
  - H3: `_claim_step_toctou` takes full step dict
  - H4: `_get_db()` per axis_routes.py convention (no `request.app.state.db`)
  - H5: `_get_sync_token` from sync_engine (not mesh_router); `_primary_url` local helper
- **Phase 5 plan-as-spec Auditor** (quality-engineer): 2 NEW HIGH + 3 MED + 4 LOW + 2 INFO
  - A-H1: `workflow_steps.updated_at` column missing (KindSource default contract); every UPDATE bumps it
  - A-H2: peer-side terminal PATCH returns bool with HTTP status check (silent state loss otherwise)
- **Phase 3 Builder** (python-expert): 11 files, 3039 insertions
  - Schema v37 in `musu-core/migrations.py`
  - 13 Pydantic v2 models + 7 FastAPI routes in NEW `workflow_routes.py`
  - 9 handlers in `handlers.py` (extends from line 2511)
  - asyncio executor + peer-sweeper in NEW `workflow_executor.py`
  - lifespan + router mount in `server.py`
  - 29 tests in 2 NEW test files (T1-T27 + 2 split-coverage)
- **Phase 5 Audit (built code)**: SHIP-OK; all 5 Critic HIGH + 2 Auditor HIGH verified in built code with file:line evidence; 29/29 plan tests green; 722→751 test count; mypy clean
- **Orchestrator post-audit**: 1 MED hygiene fix (M-1 stale v35 test pin)
- **Phase 7 Scribe**: wiki/436 closure doc (~470 lines, 12 sections, mirrors wiki/396 template)

### T2-F plan-stage status (Critic BLOCK)

Phase 0 Researcher 12 findings (F1-F12) + 4 OQ orchestrator-resolved (LAN-only beta, telemetry separate, `-MakeMeRendezvous` flag, spike-demo deferred). Phase 1 Planner wiki/433 ~365 lines.

Critic returned **5 HIGH + 4 MED + 5 LOW**. Most acute:
- C-T2F-H1: telemetry transitive import via server.ts pulls `better-sqlite3` (regular dep) onto user PC — needs `shared.ts` extraction
- C-T2F-H2: `tsconfig.docker.json` orphan after Dockerfile deletion — rename to `tsconfig.user-server.json`
- **C-T2F-H3 (strategic)**: `MUSU_TELEMETRY_BASE=https://telemetry.musu.pro/v1/telemetry` hardcoded as installer default = paid-SaaS dep in disguise. Equivalent to Phase -1 territory caught at Phase 1.5 — same pattern as v1's fly+Argo creep but tactical scale. Critic recommendation: installer prompts user with empty-default + warning; telemetry becomes opt-in not default
- C-T2F-H4: missing `installer/test-signaling-smoke.ps1` spec (referenced in T12 + §5 acceptance but not in §1/§2 implementation)
- C-T2F-H5: `_wssConnectionHandler` extraction signature ambiguity

Plan revision (~105 LOC) + plan-as-spec Auditor + Builder queued for next iteration.

### T2-C plan-stage status (Critic BLOCK)

Phase 0 Researcher 15 findings (F-R1 to F-R15) + 7 OQ orchestrator-resolved (no touch app/page.tsx, /fleet public, chat carve-out, vocab scope src/app only, 3-bar mirror, inflight count badge, narrow test:vocab script). Phase 1 Planner wiki/434 ~450 lines.

Critic returned **3 HIGH + 5 MED + 5 LOW + 3 INFO**. Most acute:
- C-T2C-1: vocab `BANNED_WORDS` at `src/app/**` scope hits existing legitimate strings (`AbortController`, `"operators"` in marketing copy, Paddle webhook handler, K8s API path literal `/api/v1/namespaces`) → first commit fails Const VII per-push gate
- C-T2C-2: `src/app/app/dashboard/page.tsx` is currently `"use client"` component; redirect-stub conversion needs `"use client"` removal + body rewrite (plan only describes server-component template)
- C-T2C-3: `GET /api/agents` endpoint **EXISTS** at `server.py:1483-1486` — plan free-text fallback wrong; AddPcWizard should multiselect from endpoint with 503 fallback

Plan revision (~150 LOC) + plan-as-spec Auditor + Builder queued for next iteration.

### Token economics (this iteration ≈ 600K subagent + orchestrator)

| Phase | Token (~K) | Output |
|---|---|---|
| T2-A' full cycle (Researcher → Scribe) | 280 | 3039 LOC code + 29 tests + wiki/436 |
| T2-F Phase 0 + Phase 1 + Phase 1.5 | 120 | wiki/433 plan + Critic findings |
| T2-C Phase 0 + Phase 1 + Phase 1.5 | 110 | wiki/434 plan + Critic findings |
| Doc writing (qual eval, listup, status) | 50 | wiki/433-qual + wiki/449 + master plan §13 + V23 master §15+§16 |
| Orchestrator overhead | 40 | task tracking, commit/push, decisions |

Order-of-magnitude rework savings vs audit-after-build path remains validated: T2-A' alone caught 7 HIGH at plan stage (5 Critic + 2 Auditor) that would have cost ~7 × 60K rework tokens = 420K vs ~42K plan-gate cost. T2-F's H3 strategic finding alone would have shipped paid-SaaS dep to users — undetected cost much higher than tokens.
