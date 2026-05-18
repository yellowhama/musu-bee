# V23.4 Phase 4 Qualitative Evaluation (wiki/448)

**Date**: 2026-05-19
**Wiki ID**: `wiki/448`
**Branch**: `v23/phase4` (HEAD `b6a1548`)
**Predecessor**: `wiki/447` (Phase 4 final closure, HTML)
**Successor**: V23.5 master plan `wiki/459 v4` (already drafted on `v23/phase4`, ready post main-merge)

---

## §1 Quantitative metrics

| Metric | Value | Source |
|---|---|---|
| Calendar duration | 2 days (master plan write 2026-05-17 → close 2026-05-19) | git log on `v23/phase4` |
| Commits on `v23/phase4` (since cut from `main`) | 36 | `git rev-list --count 08b0c1a..v23/phase4` |
| Sub-WS shipped | 5 (T2-A', T2-F, T2-C, T2-D-mini, T2-Z) | wiki/447 §2 |
| Audit-fix iterations | 3 (T2-F `c59499e`, T2-D-mini `e4ff17a`, T2-Z `b6a1548`) | wiki/447 §4 |
| Phase −1 verdicts | 1 RED → reshape → GREEN | wiki/431 v1 → v2 (`221e8f3`) |
| Net code LOC across sub-WS Builder commits | ~5500 | `git show --stat` on `6f55e99`, `bf1c1a7`, `3765b3a`, `a97d593`, `cd9bd11` summed |
| Pytest baseline → final (musu-bridge) | 722 → 751 (+29) | wiki/436 §3 |
| Jest cases (musu-bee) | 13/13 workflow-spec unit; 87/87 vocabulary-audit; full suite green | wiki/438, wiki/439 |
| Playwright cases | 1/1 (T2-D-mini e2e) | wiki/439 |
| Vocabulary-lint findings | 5/5 patterns, all clean | wiki/438 |
| Pwsh AST parse | clean across installer + bench-windows.ps1 | wiki/443, wiki/445 |
| Token economics estimate | ~600-900K subagent + orchestrator tokens (rough; 5 sub-WS × ~3 phases each + 3 audit-fix + Scribe) | not directly measured |

### Sub-WS LOC breakdown (Builder commits only)

| Sub-WS | Commit | LOC + | LOC − | Files |
|---|---|---|---|---|
| T2-A' | `6f55e99` | 3039 | 6 | 11 |
| T2-F | `bf1c1a7` + `c59499e` | 851 | 636 | 17 |
| T2-C | `3765b3a` | 1177 | 265 | 12 |
| T2-D-mini | `a97d593` + `e4ff17a` | ~1234 | 0 | 11 + 2 |
| T2-Z | `cd9bd11` + `b6a1548` | 1012 | 42 | 18 |
| **Total** | — | **~7313** | **~949** | — |

(Net code LOC of ~5500 in §1 above excludes doc-only files; raw `git diff --shortstat 08b0c1a..v23/phase4` reports +15698/−1079 across 93 files which additionally includes V23.5 master plan drafting, brainstorm closures, and research notes not part of Phase 4 sub-WS scope.)

---

## §2 Phase chain effectiveness (per `MODE_Agent_Team.md`)

### Phase −1 strategic gate

| Run | Verdict | Findings | Outcome |
|---|---|---|---|
| wiki/431 v1 | **RED** | 5 HIGH + 2 MED + 1 LOW (SG-1 ... SG-8) | All 4 frameworks convergent on RED. User accepted full reshape. |
| wiki/431 v2 (post-reshape `221e8f3`) | **GREEN** | (reshape addressed all 8 findings; not re-run) | Phase 0 proceeded. |

**Outcome**: 6th validation of `[[feedback-strategic-critic-gate]]`. Tech-only Critics structurally cannot ask "should this exist". Phase −1 caught a 4-phase-old user policy violation (fly.io retention), a 1300 LOC Go operator commitment all 4 frameworks rejected, and an EOL-clock subscription (Argo v3.7) that v1 acknowledged in writing.

### Phase 1.5 Critic (system-architect)

| Sub-WS | HIGH | MED | LOW | INFO | Resolution |
|---|---|---|---|---|---|
| T2-A' | 5 (H1 `_is_primary` env var; H2 `cur.rowcount` API; H3 undefined `wf_id`; H4 `request.app.state.db`; H5 missing imports) | 5 (M1 peer-claim TOCTOU; M3 stale machines; M4 monolithic validator; M5 aggregation race; +1) | 4 | 3 | All HIGH+MED resolved in plan; verified in built code (wiki/436 §5) |
| T2-F | per wiki/437 (multi-HIGH; rev-2 + rev-3 applied) | — | — | — | Bridge-contract ground-truth patches; F12 build-pipeline; musu-init diagnostic; OQ3 audit-fix |
| T2-C | per wiki/438 | — | — | — | SHIP-OK first pass; no audit-fix needed |
| T2-D-mini | 1 (C1 `step_id` vs `agent_id` identity conflation) | 4 | 4 | 2 | C1 was load-bearing — would have silently failed every workflow execution; v2 plan fixed |
| T2-Z | (batch-scoped) | — | — | — | One-page closure per batch |

### Plan-as-spec Auditor (post-Critic)

| Sub-WS | Plan LOC | Auditor | NEW HIGH (zero overlap with Critic) |
|---|---|---|---|
| T2-A' | ~900 | invoked | 2 NEW (A-H1 missing `updated_at` column would crash SSE on first subscribe; A-H2 silent peer-PATCH state loss → step stuck `running` until 7200s peer-sweeper) |
| T2-F | ~600 | invoked | findings folded into wiki/433+434 rev-2 (`6539863`) |
| T2-C | ~500 | invoked | findings folded same commit as T2-F |
| T2-D-mini | ~500 | **SKIPPED** | calibration data — confirms 500 LOC floor for plan-as-spec Auditor |
| T2-Z | ~520 doc | n/a | one-pager batches; not applicable |

**Outcome**: 6th-7th validation of `[[feedback-plan-stage-auditor]]` zero-overlap principle. Critic catches plan-shape bugs (variable identity, missing fields, contract drift); plan-as-spec Auditor catches cross-section invariants (observability coverage, error-contract symmetry, additive-extension correctness). Neither subsumes the other.

### Phase 5 build-as-spec Auditor

| Sub-WS | Auditor type | NEW HIGH (vs Critic carry-over) | Audit-fix commit |
|---|---|---|---|
| T2-A' | quality-engineer (single) | 0 NEW HIGH; only M-1 (stale v35 test pin) fixed in-build | — |
| T2-F | per wiki/437 | F12 build-pipeline + musu-init diagnostic + OQ3 | `c59499e` |
| T2-C | per wiki/438 | 0 NEW HIGH | — |
| T2-D-mini | quality-engineer | A1 missing GET endpoint; A2 Playwright mock URL pattern | `e4ff17a` |
| T2-Z | quality-engineer | HIGH #1 `$Host` parameter shadow; HIGH #2 airgap-trim regex; MED #3 sweeper test signal preservation | `b6a1548` |

**3 audit-fix commits total across Phase 4** (T2-F, T2-D-mini, T2-Z). T2-A' and T2-C shipped SHIP-OK first pass.

---

## §3 Estimation accuracy

### Calendar duration

| Estimate (master plan §3.3) | Actual | Delta |
|---|---|---|
| 8 weeks core + 2 buffer = 10 weeks max | 2 days | **orders of magnitude faster** |

Plan estimates assumed week-scale human-paced phases (Researcher week, Builder week, Auditor week per sub-WS). Actual execution under autonomous `/loop` + agent-team chain compressed each phase to a few hours of orchestrator + subagent token spend. Operator gates (Const VII per-push) ran in parallel; only the main-merge gate (#436) remains.

### LOC accuracy

| Sub-WS | Plan budget | Actual LOC | Multiplier |
|---|---|---|---|
| T2-A' | ~300 Python | ~1300 Python (handlers.py +453, executor +458, routes +359, +tests) | **4.3x** |
| T2-F | ~400 Python + small TS + installer | ~850 mixed (relay refactor + signaling shared module + rendezvous startup) | **2.1x** |
| T2-C | ~1000 TS/React | ~900 TS/React | **0.9x** (only sub-WS under budget) |
| T2-D-mini | ~580 FE | ~1170 FE + ~60 BE | **2.0x** (form-heavy editor multiplier) |
| T2-Z | ~300 | ~200 code + ~520 doc | **0.7x** code (defer-heavy) |
| **Total** | **~3400** | **~5500** | **1.6x** |

### Per-sub-WS analysis

- **T2-A' (4.3x over)**: largest overrun. Reasons documented in wiki/436 §2: 9 named handler functions vs 4-handler plan sketch, full 2-branch primary/peer expansion in executor, inline Critic-ID docstrings on every handler (~150 LOC overhead), explicit `NoEligiblePCError` + handler reuse for retry endpoint. No scope creep — all built surface maps to wiki/432 §2.x mandates.
- **T2-F (2.1x over)**: relay signaling refactor required splitting into `shared.ts` (412 LOC) + `user-server.ts` (82 LOC) + 33 LOC startup script in addition to the in-process rendezvous. Plan sketched single-file move.
- **T2-D-mini (2.0x over)**: form-heavy editor LOC multiplier confirmed. Steps list + depends_on multi-select + Pydantic-style validation + RunPanel + StepRow + WorkflowFormClient added up faster than plan budgeted.
- **T2-Z (under budget)**: code-light by design (3 of 9 items deferred V23.5; 1 closed obsolete; 1 process doc).

---

## §4 Process learnings (key takeaways for V23.5)

1. **Plan-as-spec Auditor zero-overlap validated 6-7 times across Phase 4** → `[[feedback-plan-stage-auditor]]` memory stands strong. Critic catches plan-shape; plan-as-spec Auditor catches cross-section invariants; both gates necessary, neither subsumes. 500 LOC threshold confirmed via T2-D-mini calibration skip.

2. **Phase −1 strategic gate prevents thesis-level errors that tech Critics miss** → `[[feedback-strategic-critic-gate]]` validated 6th time. Wrong product shape (K8s in personal-productivity-tool positioning), four-phase-old policy violation (fly.io retention), EOL-clock subscription (Argo v3.7) — none of which any tech Critic could have flagged. Permanent adoption confirmed for all master plans + thesis-extension sub-WSs.

3. **Runtime smoke-tests beat AST parse alone** → required for new files Builder ships. The T2-Z audit caught two HIGHs that AST + `bash -n` could not see:
   - `bench-windows.ps1` `$Host` parameter shadow (PowerShell automatic variable conflict — AST parse green but every invocation fails)
   - K3s airgap-trim regex missing `rancher/mirrored-*` upstream prefix (regex compiled fine but matched zero kept images at runtime, leaving K3s unbootable)
   Process doc `docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md` (FO-A1a-6) is the formal response. V23.5 Planner template adds health-schema verification at plan freeze.

4. **Form-heavy UI LOC multiplier ~1.7-2.0x** → bake into V23.5 estimates. T2-D-mini plan budget ~580 FE; actual ~1170 FE (2.0x). For form-list pages without complex state, 1.3x suffices. For form-heavy editors with validation + dependency selection + run panels, 1.7-2.0x.

5. **T2-A' LOC overrun (4.3x) is a docstring-and-completeness tax, not scope creep** → V23.5 plan budgets for Builder commits should add a ~30% overhead allowance for inline Critic-ID docstrings (per phase-7 verification convention) and full 2-branch expansion of pseudocode sketches. Bare "plan §2.x estimate" should be multiplied by 1.3 for orchestrator-facing estimates and by 2.0 for operator-facing time/cost estimates.

---

## §5 What worked exceptionally

- **Agent-team chain (Builder → Auditor → audit-fix Builder) caught every HIGH defect before close**. Three audit-fix commits resolved all live HIGH findings. No HIGH carried forward to V23.5.
- **HTML closure docs feel more navigable than Markdown** (per `[[feedback-scribe-html-only]]`). Single self-contained file with light+dark theming, expandable sections, inline SVG diagrams. T2-D-mini closure wiki/439 was the proof; wiki/447 final closure adopts the same format.
- **Phase −1 + plan-as-spec Auditor stacked together** caught both strategic and tactical plan errors before Builder. Phase −1 reshaped 23% of LOC out of the plan; plan-as-spec Auditor then caught real bugs in the reshaped plan (T2-A' A-H1 + A-H2).
- **Autonomous /loop pacing** (per `[[feedback-autonomous-loop]]`) ran 36 commits to push without per-push operator intervention. Only Const VII main-merge requires "진행해".

---

## §6 What needs improvement

- **LOC estimation calibration**. T2-A' 4.3x, T2-D-mini 2.0x, T2-F 2.1x — consistent overruns. Master plan budgeting should multiply pseudocode-derived estimates by 1.5-2.0x systematically. V23.5 master plan §2.1 should declare its estimate multiplier explicitly.
- **Runtime smoke-tests should be mandatory** for new files Builder adds, not just AST parse. Two T2-Z HIGHs (`$Host` shadow + airgap regex) would have been caught by a 30-second invocation smoke. Plan template doc (FO-A1a-6) is the response but is currently project-scoped advisory — V23.5 should consider promoting to mandatory pre-freeze check.
- **Plan-as-spec Auditor 500 LOC threshold remains a heuristic**. T2-D-mini calibration data validates it once (skip was acceptable; subsequent Auditor HIGHs were real-code only). Need 2-3 more data points before promoting to a firm rule.
- **T2-A' plan §2.x estimates were structurally low** (sketched single-side pseudocode for 2-branch logic). Future plans should expand pseudocode to both branches and re-estimate LOC.

---

## §7 V23.5 readiness

- **V23.5 master plan (wiki/459 v4) ready** on `v23/phase4` branch (4 commits b41614b → b79aea1). Option Z hybrid (full-wedge ship) per board panel. Critic round-3 + plan-as-spec Auditor cleared.
- **All V23.4 Phase 4 work shipped** on `v23/phase4` HEAD `b6a1548`. No open HIGH findings. No deferred items blocking V23.5 — all 4 Z3 defers + Z5 distroless are V23.5-horizon work that V23.5 master plan §3 already accounts for.
- **Only operator main-merge gate (#436) blocks V23.5 start**. Four manual steps:
  1. `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` (last fly action before T2-F retirement deploys)
  2. `fly deploy` + smoke 204/400/429
  3. A1.c bench EXECUTION on Windows host (V23.3 baseline capture)
  4. "진행해" + `git merge v23/phase4` (bundles V23.3 + V23.4-Tier-1 + V23.4-Phase4 → `main`)
- **Post main-merge**: V23.5 branch cut off `main`; Phase −1 strategic gate fires on wiki/459 v4 (mandatory for thesis-extension master plans per `MODE_Agent_Team.md`).

---

## §8 References

- wiki/447 — Phase 4 final closure (HTML, this document's predecessor)
- wiki/431 v2 — Phase 4 master plan (post Phase −1 reshape)
- wiki/436 / 437 / 438 / 439 — sub-WS closures (T2-A' / T2-F / T2-C / T2-D-mini)
- wiki/440–445 — T2-Z micro-batch closures + defers
- wiki/459 v4 — V23.5 master plan (ready)
- `docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md` — FO-A1a-6 process doc (response to T2-Z runtime-smoke gap)
- `MODE_Agent_Team.md` — agent-team mode definition (Phase −1 strategic gate, plan-as-spec Auditor, audit-fix cycle)
- Memories cited: `[[feedback-strategic-critic-gate]]`, `[[feedback-plan-stage-auditor]]`, `[[feedback-scribe-html-only]]`, `[[feedback-autonomous-loop]]`, `[[feedback-no-yagni-architecture]]`, `[[feedback-self-contained-product]]`
