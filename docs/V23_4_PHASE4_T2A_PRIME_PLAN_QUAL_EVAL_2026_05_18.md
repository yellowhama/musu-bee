# V23.4 Phase 4 T2-A' plan-stage qual eval — Critic + Auditor delta

**Date**: 2026-05-18
**Wiki**: 433-qual
**Subject**: wiki/432 (V23.4 F T2-A' detail plan, ~1000 lines), `ae039ea` on `v22/gap-analysis`
**Scope**: plan-stage agent-team cycle only — Phase 1.5 Critic + Phase 5 plan-as-spec Auditor. Builder phase not yet executed.

---

## §1 Headline

The wiki/432 plan-stage cycle is a load-bearing validation of MODE_Agent_Team.md's Critic-vs-Auditor delta hypothesis. **Both gates fired with non-overlapping findings, and both were necessary.** Without one, the Builder would have written either non-compiling code (Critic-only) or code with silent data-loss bugs (Auditor-only).

| Stage | Subagent | Findings | Cost |
|---|---|---|---|
| Phase 1.5 Critic | `system-architect` | 5 HIGH / 5 MED / 4 LOW / 3 INFO | 1 invocation, ~30K tokens |
| Phase 5 plan-as-spec Auditor | `quality-engineer` | 2 NEW HIGH / 3 MED / 4 LOW / 2 INFO | 1 invocation, ~12K tokens |
| **Total** | | **7 HIGH** caught at plan stage | ~42K tokens |

Comparison: if the same 7 HIGH had been caught only at Phase 3 audit-after-build, each would have cost a Builder+Audit cycle (~60K tokens each on average per V23.3 closure precedent, wiki/396). Plan-stage gating saved **~7 × 60K − 42K = ~378K tokens** in expected rework. **An order of magnitude.**

---

## §2 Critic findings breakdown (system-architect, Phase 1.5)

The 5 HIGH were all **tactical**: wrong env var, wrong DB API, wrong import path, wrong FastAPI state access, undefined variable. None thesis-level. All resolvable by mechanical plan edit.

| ID | Class | Root cause | Plan-stage cost to fix |
|---|---|---|---|
| H1 | Wrong env var | I conflated `MUSU_PRIMARY_URL` with `MUSU_NODE_ROLE`; server.py uses ROLE | 4 lines |
| H2 | Wrong DB API | I wrote `.rowcount` against `Database.execute()` which returns `list[Row]` and auto-commits — 6 sites | ~30 lines across §2.4 + §2.5 |
| H3 | Undefined variable | `_claim_step_toctou` peer branch referenced `wf_id` not in signature | 3 lines |
| H4 | Wrong FastAPI state access | I used `request.app.state.db` which doesn't exist in this codebase — convention is `_get_db()` helper per axis_routes.py:28-31 | ~15 lines across §2.3 |
| H5 | Wrong import path | `_get_sync_token` is in `sync_engine`, not `mesh_router`; `_primary_url` was never imported anywhere | 6 lines |

**Pattern recognition** ([[feedback-strategic-critic-gate]]): every HIGH was a "plan describes a real codebase by reading-from-memory" mistake. The plan was written without re-reading every adjacent module. Researcher Phase 0 catches some of this but not all — Researcher proves *what exists*, doesn't prove *what the plan claims about what exists is consistent*. **This is exactly what tactical Critic catches.**

**5 MED** were correctness-class: peer-claim PATCH was not server-enforced TOCTOU-safe (M1), no operator retry path for crash-failed workflows (M2), assignment didn't gate on machine staleness (M3), Pydantic validators were monolithic (M4), completion-aggregation was non-atomic across two commits (M5). Each was addressable in plan; each needs ≤30 LOC.

**4 LOW** were test-coverage + UX (L1 missing edge-case tests, L2 nodeSelector keys validated late, L3 untyped PATCH body, L4 peer-crash sweeper missing). Resolved or deferred.

**3 INFO** deferred (lazy imports, idle CPU profiling, duplicate edge walk).

---

## §3 Auditor findings breakdown (quality-engineer, Phase 5 plan-as-spec)

The 2 NEW HIGH were both **structural cross-section invariants** — exactly what the Critic missed by reading the plan as text rather than cross-referencing against the codebase.

### A-H1: workflow_steps schema missing `updated_at`

- **Setup**: Plan adds `workflow_steps` to `controllers/sources.py:31-50` `_ALLOWED_TABLES` (line 103 of wiki/432).
- **Invariant**: `KindSource(table=...)` defaults `timestamp_column = "updated_at"` (controllers/sources.py:74).
- **Plan as written**: `workflow_steps` schema (§2.1) had `started_at INTEGER, finished_at INTEGER` — no `updated_at`.
- **Failure mode**: first SSE subscribe to `workflow_steps` → `sqlite3.OperationalError: no such column: updated_at`. T15 was presence-only check, would not catch.

**Why Critic missed it**: Critic read §2.1 + §2.7 separately; never composed the two sections against the invariant declared in a third file (`controllers/sources.py:74`). The Auditor opened that file. **Lesson**: Critic prompts must explicitly include "check additive-extension claims against the contract of the extended subsystem."

### A-H2: peer-side terminal PATCH silently swallowed errors

- **Setup**: `_report_step_result` peer branch (§2.5) issued `await client.patch(...)` with no status check.
- **Invariant**: distributed work loss requires preservation-on-failure semantics; primary branch returns `True/False`.
- **Plan as written**: peer branch had no return value, no logging, no status check.
- **Failure mode**: rendezvous PC restart during peer-side terminal PATCH → peer logs nothing, advances to next step, step stuck `'running'` until 7200s peer-sweeper times it out. 2-hour window of lost work for steps that may have actually completed.

**Why Critic missed it**: Critic saw the peer-side PATCH and the primary-side handler — but didn't compare the error contracts. The peer branch *visually parallel* to the primary branch but with stripped semantics is a classic "near-miss" the Critic deprioritized.

### Auditor MED + LOW

- **A-M3 (MED)**: `_peer_crash_sweeper` was `while True` with no single-iteration entry point → T24 untestable as written. Resolution: split into `_peer_crash_sweep_once(db) -> list` + async wrapper. Builder mandate added.
- **A-L1 (LOW)**: Build order unspecified → 8-step recommended order added to §6.
- **A-L2 (LOW)**: H1 had no dedicated test → T25 added (pins `_is_primary` to `MUSU_NODE_ROLE` against regression).
- **A-L3 (LOW)**: LIKE-match on NULL `error_json` — theoretical only, deferred with note.
- **A-L4 (LOW)**: Verified non-bug (EdgeSpec.condition Literal matches `_are_dependencies_satisfied` exactly).

---

## §4 Conflict resolution (Critic-vs-Auditor)

Per MODE_Agent_Team.md "Conflict Resolution" section:
- Critic HIGH vs Auditor LOW on same issue → Auditor wins (saw real code). Did not apply here — all Critic HIGH were resolved BEFORE Auditor read the revised plan; Auditor explicitly verified each (§12 of wiki/432).
- Critic HIGH, Auditor silent → stays HIGH. Did not apply — Auditor explicitly cited each Critic HIGH in HANDOFF NOTES.
- 2 Auditor HIGH on issues Critic missed → both apply unchanged. Resolved by orchestrator decision (me) without escalation, since both fixes were mechanical.

Critic-vs-Auditor finding overlap: **zero**. Auditor's 5 verifications of Critic HIGH were all ✅; Auditor's 2 NEW HIGH were independent. This is the ideal outcome — both gates contribute non-redundant signal.

---

## §5 What this validates / falsifies about the agent-team mode

**Validates**:
1. **Phase -1 Strategic Gate** (added 2026-05-18, validated on wiki/431 v2) caught thesis-level errors. wiki/432 carried only tactical/structural findings — thesis (asyncio+SQLite) was correct.
2. **Critic-before-Build** vs audit-after-Build trade-off is real and asymmetric. 7 HIGH × 60K rework tokens > 42K plan-stage gate cost. Order-of-magnitude saving.
3. **Critic + Auditor complement, not duplicate**. Critic catches tactical mistakes the plan author made vs their memory. Auditor catches structural mistakes the plan author made vs the codebase. The MODE_Agent_Team.md mandate that Auditor explicitly verify each Critic HIGH is what makes the delta visible.
4. **Auditor as quality-engineer (plan-as-spec) is the right shape** for code-less stages. system-architect would have repeated Critic's framing.

**Falsifies** (none in this cycle, but worth flagging):
- One MODE_Agent_Team.md predicted failure mode — "Critic returns 'all good'" — did not fire here. Critic returned 5 HIGH on first run, well above the §-quality-validation floor of "≥1 finding total."

**Open**: how does this cycle generalize? wiki/432 is ~1000 LOC plan. For a 100-LOC sub-WS plan, the Critic+Auditor cost (~42K tokens) may exceed the cycle savings. Future evaluation: track HIGH-finding-count vs plan-size for next 3 sub-WS plans.

---

## §6 Lessons codified

1. **Memory write**: Critic prompt MUST include "verify additive extensions against the contract of the extended subsystem" — wording for Phase 1.5 prompt template. (Will fold into MODE_Agent_Team.md after one more validation run.)
2. **Plan template**: schema-section + allowlist-extension-section + UPDATE-site-section MUST cross-reference each other explicitly. Wiki/432 §2.1 now does this for `updated_at` via inline comment.
3. **Mandatory Builder checklist line**: "verify timestamp_column invariant on every `_ALLOWED_TABLES` extension." Folded into §6 of wiki/432 already.

---

## §7 Status / next gates

- `wiki/432` plan: **DONE** at SHIP-OK level. 5 Critic HIGH + 2 Auditor HIGH + 3 MED resolved. 27 test cases enumerated. Builder mandates concrete.
- `ae039ea` commit (plan-only docs) pushed to `origin/v22/gap-analysis` 2026-05-18.
- Builder Phase 3: **GATED** on operator branch cut (#436 V23.3 + V23.4 Tier-1 main-merge → #437 cut `v23/phase4` off main). Plan-stage work cannot proceed further without code execution.

---

## §8 References

- `F:\workspace\musu-bee\docs\V23_4_F_T2A_PRIME_PLAN_2026_05_18.md` (wiki/432 — the plan, with §11 Critic + §12 Auditor findings tables)
- `F:\workspace\musu-bee\docs\V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` (wiki/431 v2 — master plan with §0 Strategic Gate)
- `C:\Users\empty\.claude\MODE_Agent_Team.md` (Phase -1 + universal envelope contract + conflict resolution)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-strategic-critic-gate.md` (Phase -1 gate validation)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-self-contained-product.md` (zero new external deps verified)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-no-yagni-architecture.md` (asyncio+sqlite scale-appropriate)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\pattern-toctou-atomic-update.md` (executor step-claim precedent from wake.py:184-194)
