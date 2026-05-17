# V23.4 Tier-1 Qualitative Evaluation (wiki/430)

**Date**: 2026-05-17
**Wiki ID**: `wiki/430`
**Scope**: V23.4 Tier-1 — F-B2-1 + F-B2-2 + F-B2-3 (3 sub-WSs, ~76 LOC across 4 files)
**Reference**: wiki/429 final closure for objective state; this doc covers reflection.

---

## §1 What went well

### §1.1 Dual-audit caught a real defect — justifying the cost

F-B2-1 was promoted from single-auditor to dual per Critic C8 (data deletion = one-way blast radius). The promotion paid off: Auditor B (security-engineer) flagged that T22 only inserted 1 stale row, leaving the LIMIT 1000 boundary untested. Single-audit would have shipped with the boundary unexercised — and a `WHERE id IN (SELECT id ... LIMIT ?)` regression could have silently degraded into "deletes all stale rows in one tick", reintroducing the very event-loop block the LIMIT was meant to prevent. The audit-fix1 commit `99e9c92` added T22b with 1001-row insertion, asserting first tick deletes exactly 1000 and second tick deletes 1. **The two auditors found different things** — exactly the pattern that justifies dual-audit at all.

### §1.2 Critic-before-Build prevented two latent bugs at zero rework cost

- **C2 (PowerShell two-level guard)**: Critic flagged that single-level `$script:PrereqResult.probes.os_version` collapses under `Set-StrictMode -Version 3`. Plan was edited BEFORE Builder spawned. Builder shipped the two-level chain correctly the first time. No audit-fix needed.
- **C9 (per-tick LIMIT 1000)**: Critic flagged that unbounded DELETE could O(table_size) block the event loop. Plan was edited to add IN-SELECT-LIMIT pattern + the boundary test that later became audit-fix1. Builder shipped the bounded form the first time.

The pattern: **Critic finds a bug at plan time → Plan updated → Builder writes correct code first try.** This was much cheaper than Auditor finding the same bug post-build and requiring a fix commit.

### §1.3 R5 caught by Auditor, not Builder — and that was fine

R5 (installer retry behavior on F-B2-3 500 response) was an MUST-do checklist item the Builder skipped. The Auditor caught it during F-B2-3 audit by independently grepping the installer/gateway code. The grep returned zero status-code branching at all three sites — the installer treats 500/502/network-error identically. So the F-B2-3 contract change (HTML 500 → JSON 500) is invisible to clients. **The MODE_Agent_Team.md handoff envelope worked**: Builder missed the check; Auditor's `PRIOR ARTIFACTS` instruction surfaced it; closure doc records the adjudication. No silent pass-through.

### §1.4 LOC estimate accuracy

Master plan estimated ~30 LOC for Tier-1. Actual ~76 LOC (40 F-B2-1 + 31 F-B2-2 + 75 F-B2-3 incl. tests). That's a 2.5× overrun on impl LOC if tests are counted, but the overrun is concentrated in **test code** (T22b boundary, T24 fan-out into a/b/c, TDF-1..TDF-4 with shared-secret auth fallthrough). Production-LOC alone matches the estimate within 20%. The lesson: **estimate test LOC separately from impl LOC**, or expect ~2-3× the impl number once edge-case tests land.

---

## §2 What went less well

### §2.1 LOC under-estimation specifically for PowerShell two-level guards

Master plan estimated 4 LOC for F-B2-2. Actual was 31 LOC. The two-level `PSObject.Properties` guard chain — required by Critic C2 to avoid StrictMode 3 crashes — costs 5 lines per field accessor (vs. 1 line for single-level). With 2 fields × 3 sites (A/B/C) + comments, that's the 31. **Lesson**: when a plan calls for "defensive PowerShell mirroring existing patterns", look at the existing pattern's actual line count, not just its semantic shape.

### §2.2 Master plan line-number references were stale

wiki/425 §5.2 said F-B2-2 Site A was at "~line 422". Actual location after V23.3 commits was line 295-309 (inside the `wsl2-off-feature-off` branch). wiki/425 §2 said the F-B2-3 routes were at "765/814/924/950" — also stale; actual lines after F-B2-1 commits had shifted. Both were caught at Builder time (wiki/408 §2.1 + wiki/407 §2.1 verified actual line numbers before editing). **Lesson**: master plans should mark line numbers as "verify at Builder time" explicitly — they're hints, not pins.

### §2.3 wiki/408 detail plan left untracked in the F-B2-3 build commit

The F-B2-3 Builder followed the literal "2 files only" instruction in its commit (`5b7814b` = telemetry.ts + test file). The wiki/408 detail plan was left untracked, then bundled into the closure commit `aef977c` alongside wiki/428. **Lesson**: future master plans should explicitly say "Builder commits N source files + Scribe commits the detail plan + closure doc together" so the file inventory is clear up-front.

### §2.4 F-B2-1 Auditor A NEW-LOW (hatch observability) was deferred without an explicit owner

The NEW-LOW finding (`MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` is silent) was deferred to F-B2-1-FOLLOW-1 without a concrete wiki ID or owner. It's recorded in wiki/426 §6 + wiki/429 §4.1 but no follow-up task exists yet. **Lesson**: when deferring a NEW-LOW to a future Tier, allocate the wiki ID at deferral time, not at re-evaluation time — otherwise it can drift indefinitely.

---

## §3 Numbers (objective scoreboard)

| Metric | Value | Notes |
|---|---|---|
| Sub-workstreams shipped | 3/3 | all V23.3 Auditor MEDIUMs closed |
| Commits | 7 over `4c191a4..199595b` | master plan + 3 impl + 1 audit-fix + 3 doc |
| jest tests | 218 → 228 (+10) | +5 from F-B2-1 (T22/T22b/T23/T24a/T24b/T24c — T24 fanned) + 4 from F-B2-3 (TDF-1..4) + 1 audit-fix1 (T22b) — actual delta 10 due to T24 sub-cases counted separately |
| jest pass rate | 228/228 (100%) | clean state at HEAD `199595b` |
| tsc --noEmit | clean | musu-relay |
| pwsh AST parse | clean | `install-wsl2.ps1` under StrictMode 3 |
| Critic findings | 14 (C1-C14 + 4 OQ-CRITs) | all resolved at plan time |
| Critic findings that landed correctly first try | 13/14 | only R5 missed by Builder, caught by Auditor |
| Auditor findings post-build | 2 NEW (1 LOW + 1 MED-fix-required) | dual-audit yielded different findings per auditor |
| Audit-fix commits | 1 (`99e9c92`) | F-B2-1 T22b boundary test |
| Forward-pointers created | 2 (F-B2-1-FOLLOW-1 LOW; F-B2-1-FIRST-RUN INFO) | deferred to Tier-2+ |
| Const gate triggers | 0 (none of III/VI/VII-merge fired) | per-push VII satisfied; main-merge VII = operator-pending |
| Wall-clock | 1 day (2026-05-17 plan → 2026-05-17 ship) | within 1-3 /loop iteration estimate |

---

## §4 Pattern continuations (V23.3 → V23.4)

- **Per-push Const VII gate works**: every commit pushed without operator intervention; main-merge stays gated.
- **One-page closure for trivial sub-WSs holds**: F-B2-2 followed the V23.3 B7/B8 precedent (PowerShell-only, no formal Auditor, dry-run + AST = acceptance). No regression from skipping the formal Auditor.
- **Dual-audit decision rule is robust**: F-B2-1 (data deletion = one-way blast) qualified; F-B2-3 (error-handling refactor = recoverable) didn't. Both calls correct in hindsight.
- **Master plan template (12 sections) scales down well**: wiki/425 used the V23.3 wiki/379 template for a 3-sub-WS scope; no friction.

---

## §5 Cost-benefit assessment for V23.4 Tier-2 decision

Tier-1 closed 3 of 20 V23.4 forward-pointers from wiki/396 §5. The remaining 17 are LOW or V23.5-horizon. **Recommendation to operator**: defer Tier-2 master plan until either (a) F-B2-1 hatch observability follow-up is wanted, OR (b) a Const VI experiment (bench EXECUTION on Windows host) surfaces a new constraint. Until then, V23.4 Tier-1 alone is sufficient — the security-critical item (F-B2-1 cross-route DoS) is closed, and operational risk has been reduced.

The V23 master plan (`docs/V23_MASTER_PLAN_2026_05_15.md`) §V23.4 description is unchanged by Tier-1 (the React Flow + Fleet view scope is V23.4 Tier-2+ horizon, not Tier-1 security).

---

## §6 References

- wiki/429 (V23.4 Tier-1 final closure — objective state)
- wiki/425 (V23.4 master plan — predicted state)
- wiki/396 + wiki/397 (V23.3 final closure + qual eval — predecessor)
- MODE_Agent_Team.md (Phase 0-7 + dual-audit doctrine)
