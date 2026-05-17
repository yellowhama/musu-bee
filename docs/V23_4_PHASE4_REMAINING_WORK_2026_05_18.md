# V23.4 Phase 4 — Remaining Work + Implementation Listup

**Date**: 2026-05-18
**Wiki**: 449
**Scope**: full operator-visible list of what's left to ship V23.4 Phase 4 → V23.5 closed beta gate. Single document for scan.

---

## §1 Goal context (one paragraph)

V23.5 closed beta gate (5 users running multi-PC workflows on self-hosted musu) requires V23.4 Phase 4 close. Phase 4 was reshaped 2026-05-18 by Phase -1 Strategic Gate from K3s+Argo+Go-operator+CRD (~4400 LOC, 11 weeks, fly.io critical-path) to asyncio+SQLite+Python (~3400 LOC, 8 weeks, zero paid SaaS). Reshape committed in wiki/431-v2. Current status: master plan + first sub-WS detail plan (T2-A' wiki/432) plan-stage SHIP-OK with full Critic + Auditor coverage. **Zero code written yet for Phase 4.**

---

## §2 Operator-pending gates (BLOCKING all code work)

| # | Gate | Owner | Effort | Required for |
|---|---|---|---|---|
| **G1** | **V23.3 + V23.4 Tier-1 main-merge** (4 manual steps per wiki/396 §V23.3 + wiki/429 V23.4 Tier-1) | operator | ~30 min | branch cut G2 |
| **G2** | Cut `v23/phase4` off `main` post-G1 | operator | <5 min | every Phase 4 Builder |

These cannot be unblocked autonomously per Const VII + autonomous /loop safety rules. G1 details below:

**G1 manual steps** (operator):
1. **A1.c bench EXECUTION on Windows** — captures K3s baseline metrics (~15 min)
2. **B2 fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1** — one-line `fly secrets set` (~1 min) — *note: this is part of V23.3 close; T2-F will retire fly.io entirely, so this is short-lived*
3. **fly deploy + smoke** (~10 min) — also temporary, see T2-F
4. **Const VII "진행해" + `git merge v22/gap-analysis → main`** — explicit operator approval

---

## §3 Sub-workstreams (post-G2)

All 5 sub-WS run on `v23/phase4` branch. Plan docs reference wiki IDs in §0 of wiki/431-v2.

### §3.1 T2-A' — asyncio + SQLite workflow runner (wiki/432 detail + wiki/436 closure)

- **Status**: plan SHIP-OK (Critic + Auditor done; 5 H + 2 H + 3 M + 4 L resolved; 27 tests enumerated)
- **Scope**: ~700 LOC Python in `musu-bridge/`. Schema v37 migration in `musu-core/migrations.py`. Replaces eliminated T2-A (Argo install) + T2-B (Go operator).
- **Files** (Builder writes):
  - `musu-core/src/musu_core/migrations.py` (+30 LOC: `_v37_up`, `_v37_down`, `MIGRATIONS.append`)
  - `musu-core/src/musu_core/controllers/sources.py` (+2 LOC: `_ALLOWED_TABLES` extension)
  - `musu-bridge/workflow_routes.py` (NEW ~140 LOC: Pydantic models + 8 endpoints incl. `/retry`)
  - `musu-bridge/handlers.py` (EXTEND ~180 LOC: create / list / get / patch / delete / retry handlers + assign_steps_to_pcs / _compute_depends / transition_workflow_step / get_pending_steps_for_pc / _are_dependencies_satisfied)
  - `musu-bridge/workflow_executor.py` (NEW ~250 LOC: poll loop + crash recovery + peer-crash sweeper + step claim TOCTOU + result reporting)
  - `musu-bridge/server.py` (EDIT ~15 LOC: lifespan spawn/cancel both workflow_task + peer_sweeper_task; router mount)
  - `musu-bridge/tests/test_workflow_routes.py` + `test_workflow_executor.py` (NEW ~600 LOC: T1-T27)
- **Const gates**: III TRIGGERED on v37 apply; VI not triggered; VII per-push + main-merge
- **Dependencies**: G1, G2
- **Build order** (per §6 of wiki/432): migration → Pydantic → handlers → routes → executor → lifespan → tests → regression
- **Estimated**: 1-2 /loop iterations (Builder 1 day + Auditor 1 day)
- **Next action after G2**: `Task` python-expert as Builder per task #447

### §3.2 T2-F — fly.io retirement + self-hosted signaling (wiki/433 detail + wiki/437 closure)

- **Status**: master plan declares scope; no detail plan yet
- **Scope**: delete `musu-relay/Dockerfile`, `fly.toml`, fly-specific env handling. Add self-hosted signaling discovery (LAN multicast or DNS-SD or static config).
- **Why**: Phase -1 Strategic Gate RED finding — paid SaaS in product critical path violates self-contained-product positioning ([[feedback-self-contained-product]]).
- **Dependencies**: G1, G2; independent of T2-A' (different files); can run parallel to T2-A' Builder
- **Estimated**: 1 /loop iteration. Need Phase 0 Researcher first (signaling discovery mechanism choice).
- **Next action after G2**: Phase 0 Researcher for signaling discovery options (mDNS / DNS-SD / static rendezvous URL / WebRTC-over-LAN); then Plan + Critic + Build.

### §3.3 T2-C — fleet view UI on musu-bee (wiki/434 detail + wiki/438 closure)

- **Status**: master plan declares; no detail plan
- **Scope**: `musu-bee` Next.js page `/fleet` listing all paired PCs with status + capacity from `/api/machines` + `/api/machine_capacity`. Vocabulary lint pass.
- **Dependencies**: G2 only. Independent of T2-A' API but consumes existing bridge endpoints — can run immediately after G2.
- **Estimated**: 1 /loop iteration (~300 LOC TypeScript + 5-10 component tests).
- **Next action after G2**: Phase 0 Researcher (existing musu-bee page conventions); then Plan + Critic + Build.

### §3.4 T2-D — React Flow workflow editor on musu-bee (wiki/435 detail + wiki/439 closure)

- **Status**: master plan declares (simplified post-Phase -1); no detail plan
- **Scope**: `musu-bee` Next.js page `/c/[company_id]/workflows/new` with React Flow graph editor → emits `WorkflowSpec` JSON → POST `/api/workflows`. RunPanel shows step states via polling (SSE deferred per master plan §1 SCOPE OUT).
- **Dependencies**: T2-A' API (POST /api/workflows + GET /api/workflows/{id}/status must exist). NOT blocked by T2-A' Builder completion; can develop against mocked API in parallel and integrate when T2-A' lands.
- **Estimated**: 2 /loop iterations (~800 LOC TypeScript + React Flow integration).
- **Next action after G2**: can spawn Phase 0 Researcher in parallel with T2-A' Builder. Builder gated on T2-A' API stable.

### §3.5 T2-Z — Tier-1 residual cleanup (wiki/440-446 detail + closure batch)

- **Status**: list of 17 forward-pointers from V23.4 Tier-1 (wiki/396 §5); split into 6 micro-batches Z1-Z6
- **Scope**: small cleanups, no architectural change. CHANGELOG retroactive entries, dep bumps, log message normalization, etc.
- **Dependencies**: G2; can run any time
- **Estimated**: 6 sub-iterations × 30 min each
- **Next action**: defer until other sub-WS land; sweep at Phase 4 close

---

## §4 Phase 4 close

| Step | Owner | Output |
|---|---|---|
| All 5 sub-WS SHIP-OK with closure docs | agent-team | wiki/436-446 |
| Phase 4 final cross-cutting audit | quality-engineer | report |
| `wiki/447` final closure | technical-writer | doc |
| `wiki/448` qualitative evaluation | technical-writer | doc |
| CHANGELOG 1.12.0 entry | orchestrator | musu-bridge/CHANGELOG.md |
| Const VII main-merge gate | operator | "진행해" + git merge v23/phase4 → main |

---

## §5 V23.5 closed beta gate (Phase 4 + 1 phase out)

Out of V23.4 Phase 4 scope but listed for orientation:

- 5 users running multi-PC workflows = success criterion
- Requires: T2-A' shipped (workflow API), T2-C shipped (fleet view), T2-D shipped (workflow editor), T2-F shipped (no fly.io dependency for user installs)
- T2-Z is bonus polish; not on V23.5 critical path

---

## §6 Risks + monitoring

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Operator delays G1 main-merge (lots of manual steps) | M | blocks everything | small batched merge each evening |
| T2-A' Builder finds Researcher-missed pattern (e.g., existing `_get_backend()` shape change) | L | 1 audit-fix iteration | autonomous /loop heartbeat catches |
| T2-F signaling discovery choice triggers second Phase -1 | L | scope expansion | Researcher prompted to compare 3+ options and recommend |
| T2-D React Flow library decision needs review | M | UI lib commitment is sticky | Phase 0 Researcher must propose 2-3 options with trade-offs |
| Test count baseline drift in musu-bridge (other commits) | L | T1-T27 count math wrong | Builder confirms baseline at start of build |

---

## §7 Status snapshot (2026-05-18 EOD)

- **Plan stage complete for**: T2-A' (wiki/432, fully audited)
- **Plan stage pending for**: T2-F, T2-C, T2-D, T2-Z
- **Code written**: zero in Phase 4 (all Tier-1 residuals from V23.4 Tier-1 already in `v22/gap-analysis`)
- **Operator gates open**: G1, G2
- **Tokens spent so far**: ~75K (Phase -1 panel + Researcher + Planner + Critic + Auditor on wiki/432)
- **Estimated tokens to V23.4 Phase 4 close**: ~600K (5 sub-WS × Builder+Audit + closure docs)

---

## §8 Index of all V23.4 Phase 4 wiki IDs

| Wiki | Subject | Status |
|---|---|---|
| 431 | V23.4 Phase 4 master plan (v1 K3s+Argo, v2 asyncio+SQLite reshape) | DONE (committed) |
| 432 | T2-A' asyncio workflow runner detail plan | DONE (committed `ae039ea`) |
| 433 | T2-F fly.io retirement detail plan | TODO |
| 433-qual | T2-A' plan-stage qual eval (this round) | TODO this commit |
| 434 | T2-C fleet view detail plan | TODO |
| 435 | T2-D React Flow editor detail plan | TODO |
| 436 | T2-A' closure | TODO (after Builder + Auditor) |
| 437 | T2-F closure | TODO |
| 438 | T2-C closure | TODO |
| 439 | T2-D closure | TODO |
| 440-446 | T2-Z Z1-Z6 detail+closure batch | TODO |
| 447 | V23.4 Phase 4 final closure | TODO |
| 448 | V23.4 Phase 4 qual eval | TODO |
| 449 | This doc (remaining-work listup) | THIS COMMIT |

---

## §9 Next /loop iteration when unblocked

If G1+G2 done and user requests resume:
1. /loop heartbeat step 1: BLOCK-on-user? No.
2. /loop heartbeat step 3: audit-fix open? No.
3. /loop heartbeat step 5: post-plan, critic done, no build? **YES for T2-A'** → spawn `python-expert` Builder per task #447.
4. **In parallel**: Phase 0 Researcher for T2-F (signaling discovery options) — separate sub-task, parallel to T2-A' Builder.
5. **In parallel**: Phase 0 Researcher for T2-C (musu-bee page conventions) — parallel to above.

Three Phase 0 Researchers + 1 Builder = 4 parallel sub-tasks max per MODE_Agent_Team.md token-budget guardrails. Cost-aware: stagger if context pressure.
