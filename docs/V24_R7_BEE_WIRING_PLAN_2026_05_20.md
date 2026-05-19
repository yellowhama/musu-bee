# V24-R7 — musu-bee wire-up to Rust bridge (detail plan)

**Wiki ID**: wiki/497
**Created**: 2026-05-20
**Phase**: R-fast, 3 of 6
**Parent**: wiki/490 (V24 master plan, panel-reshaped)
**Predecessors**: R0 (workspace) + R1 (bridge module, ac1c994) + R2 (core module, 6172375)
**Risk**: LOW (no frontend rewrite per master plan; env + endpoint reconciliation only)
**LOC estimate**: ~100 TS (env touch + smoke test + 2 endpoint terminology fixes)
**Status**: DRAFT (Phase 0 Researcher done; compressed Critic per master plan §5-R7)
**Critic**: `system-architect` (compressed — single, LOW risk per [[feedback-plan-stage-auditor]] calibration rule: skip if LOC <500 + no thesis extension)
**Auditor**: `quality-engineer` (single)

## §1 Scope

Wire the musu-bee Next.js cockpit to the Rust bridge on `http://127.0.0.1:8070`. Per wiki/490 §5-R7: **no frontend rewrite**. R7 only:

1. **Verify `.env.local.example`** points to Rust port `:8070` (Phase 0 confirmed: already correct).
2. **Verify token plumbing**: musu-bee server reads `MUSU_BRIDGE_TOKEN` env at startup, attaches `Authorization: Bearer ${token}` to bridge calls. Phase 0 confirmed shape OK.
3. **Reconcile 2 path mismatches** found by Phase 0:
   - musu-bee calls `/api/admin/nodes` (3 routes) but R1 ships `/api/nodes`. Either rename Rust side OR alias OR rename musu-bee side.
   - musu-bee calls `/api/admin/pair` but R1 ships `/api/nodes/add`. Same options.
4. **Add integration smoke test** that boots dual-start (Rust on :8070 + Python on :8071) + musu-bee dev server + verifies one round-trip: GET /api/companies via musu-bee → musu-bee proxies to Rust → returns 200 with `[]`.
5. **Document the 3 native endpoints not called by UI** (`/activate`, `/run`, `/tasks/delegate`) — flag as R8 acceptance items for operator's manual curl flow.

What R7 does NOT ship:
- Frontend rewrites or UI changes
- New endpoints
- New env vars
- Token rotation, refresh logic
- SSE refactor
- Schema-not-applied UX cleanup (Phase 0 confirmed no stale error handling exists)

## §2 Stack

Inherit musu-bee's existing Next.js 14+ + React + TypeScript stack. R7 adds NO npm dependencies. Test runner already exists (Jest at `*.test.ts`, Playwright at top-level `tests/`).

## §3 Module touch list

| File | Action | LOC |
|---|---|---|
| `musu-bee/.env.local.example` | Verify `MUSU_BRIDGE_URL=http://127.0.0.1:8070` already correct | 0 (verify) |
| `musu-bee/src/app/api/nodes/route.ts` | Reconcile path: change upstream `/api/admin/nodes` → `/api/nodes` (Rust side); OR add facade alias | ~5 |
| `musu-bee/src/app/api/nodes/pair/route.ts` | Same: `/api/admin/pair` → `/api/nodes/add` | ~5 |
| `musu-bee/src/app/api/nodes/[name]/route.ts` | Same pattern | ~5 |
| `musu-bee/src/app/api/nodes/discovered/route.ts` | Same pattern (if exists) | ~5 |
| `musu-bee/tests/r7-bridge-smoke.test.ts` (NEW) | Integration test: dual-start + GET /api/companies round-trip | ~70 |
| `musu-bee/README.md` (or operator-facing doc) | Note R-fast dual-start procedure | ~10 |

Total: ~100 LOC, matches wiki/490 §5-R7 estimate.

## §4 Path reconciliation decision

Phase 0 found musu-bee calls `/api/admin/nodes` and `/api/admin/pair`. R1 ships `/api/nodes` and `/api/nodes/add`. Three options:

**Option A** (recommended): change musu-bee to call R1's canonical paths. ~20 LOC TS edit across 4 routes.

**Option B**: add Rust-side alias for `/api/admin/*` paths to `/api/nodes/*`. ~10 LOC in `musu-rs/src/bridge/handlers/nodes.rs` (route alias).

**Option C**: keep both terminologies and add facade rules. Complex; reject.

**Decision**: **Option A**. Reasons:
- R1's path schema (`/api/nodes`, `/api/nodes/add`) is the canonical V24 surface per wiki/491 §1.
- musu-bee's `/api/admin/*` terminology was a Python-era artifact; Phase 0 found 3-4 routes using it.
- TS edit is reversible; Rust alias adds permanent dead code R-cleanup would need to remove.

If Option A breaks any test, fallback Option B is a one-commit add.

## §5 Const gates

- Const III: NOT triggered (no schema change)
- Const VI: NOT triggered (no perf experiment)
- Const VII: per-commit gate per Builder push

## §6 Acceptance criteria

R7 closure (wiki/497c HTML per [[feedback-scribe-html-only]]) requires:

1. ✅ `.env.local.example` confirmed `MUSU_BRIDGE_URL=http://127.0.0.1:8070`
2. ✅ 4 musu-bee TS files edited to use canonical `/api/nodes` + `/api/nodes/add` paths (Option A)
3. ✅ `r7-bridge-smoke.test.ts` integration test passes: dual-start + GET /api/companies via musu-bee returns 200 `[]`
4. ✅ `npm test` (Jest) passes — no regressions
5. ✅ `npx playwright test` (if applicable) passes
6. ✅ Phase 1.5 Critic (compressed system-architect) findings resolved
7. ✅ Phase 5 Auditor (quality-engineer) approves
8. ✅ Const VII push gate per commit

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| R7-1 | LOW | Path edit breaks an existing musu-bee Jest test that mocked `/api/admin/nodes`. | Update test fixtures alongside edit. Trivial. |
| R7-2 | LOW | musu-bee dev server (next dev) port collides with bridge on :8070. | musu-bee runs on :1355 by default (per `.env.local.example`); no conflict. |
| R7-3 | LOW | Operator's actual `.env.local` (not `.example`) drifts from R7 expectation. | R7 doesn't touch operator's `.env.local`. R8 install procedure verifies. |
| R7-4 | LOW | Phase 0 finding: 3 native endpoints (/activate, /run, /tasks/delegate) not called by musu-bee UI directly. | Document in R7 closure HTML §8 as "operator must curl these directly for R8 acceptance flow". |

## §8 Phase 1.5 Critic seed (compressed)

Spawn `system-architect` Critic with short seed:

> Read `F:\workspace\musu-bee\docs\V24_R7_BEE_WIRING_PLAN_2026_05_20.md` (this plan) plus the 4 musu-bee TS route files listed in §3. Verify:
> (1) Path reconciliation Option A is correct — that `/api/nodes` + `/api/nodes/add` are the R1 canonical paths and that musu-bee's `/api/admin/*` paths can safely change without breaking Python facade reach-through.
> (2) The integration test plan in §6 item 3 is sufficient for LOW risk, or does it need expansion?
> (3) Phase 0 finding about 3 native endpoints not called by UI is acceptable as "operator manual curl flow" for R8, or does R7 need to wire UI?
>
> ≤500 words. LOW expected HIGH count per LOW risk + plan-stage-auditor calibration.

## §9 References

- wiki/490 V24 master plan §5-R7
- wiki/491 R1 detail plan §1 (canonical endpoint surface)
- wiki/492c R2 closure (DB unblock so /api/companies returns data)
- Phase 0 Researcher output (this turn — endpoint inventory + token plumbing)
- Memory: [[feedback-no-python]] (musu-bee TS preserved per backend-only Python ban), [[feedback-self-contained-product]] (no external deps), [[feedback-plan-stage-auditor]] (compressed Critic gate for LOW-risk sub-WS)

## §10 Critic Findings (resolved)

*Empty at plan-write time. Populated after compressed Phase 1.5 returns.*
