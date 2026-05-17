# V23.4 Tier-1 Final Closure (wiki/429)

**Date**: 2026-05-17
**Wiki ID**: `wiki/429`
**Branch**: `v22/gap-analysis` (HEAD `199595b`)
**Master plan**: wiki/425 (`docs/V23_4_MASTER_PLAN_2026_05_17.md`)
**Predecessor**: V23.3 SHIPPED at `4c191a4` (wiki/396 final closure + `4c191a4` wiki/spec hooks)
**Successor**: V23.4 Tier-2+ (deferred — operator decision)

---

## §1 Executive summary

V23.4 Tier-1 SHIPPED on `v22/gap-analysis`. Three sub-workstreams (F-B2-1 / F-B2-2 / F-B2-3) closed all three V23.3 Auditor MEDIUMs accepted as V23.4 carry (wiki/391 §4 NEW-MED-1/2/3). 7 commits over `4c191a4..199595b`, 228/228 jest green, tsc clean, AST parse clean on installer.

**Const VII per-push gates**: satisfied on every commit push.
**Const VII main-merge gate**: OPERATOR-PENDING (rolls into V23.3 main-merge bundle OR V23.4 separate merge per master plan §4 C13 framing).
**Const III + VI gates**: NOT triggered (retention runtime, no DDL; no new performance characteristic).

Token-budget: ~25 LOC originally estimated; actual ~76 LOC across telemetry.ts + 2 test files + install-wsl2.ps1 (overrun due to dual-audit-induced T22b boundary test + two-level PSObject guard explosion in PowerShell; well within "minimal edit" intent).

---

## §2 Sub-workstreams shipped

| ID | Wiki | Commits | Audit type | Result | LOC |
|---|---|---|---|---|---|
| **F-B2-1** install_attempt 30-day retention sweeper | wiki/406 detail + wiki/426 closure | `809015a` (impl), `99e9c92` (audit-fix1 T22b boundary), `cd0eb88` (docs) | **DUAL**: quality-engineer (deletion-correctness) + security-engineer (data-retention semantics) | SHIP-OK after one quality-engineer AUDIT-FIX-REQUIRED on T22 LIMIT 1000 boundary; both auditors clean post-fix | ~40 LOC (`telemetry.ts` sweeper + 3+1 tests in `install-attempt.test.ts`) |
| **F-B2-2** PowerShell state file enrichment | wiki/407 detail + wiki/427 closure | `199595b` (impl + docs) | one-page closure (V23.3 B7/B8 precedent) — AST parse + 6-step synthetic dry-run | ALL DRY-RUN STEPS GREEN; V23.3-state back-compat verified | +31 LOC (`install-wsl2.ps1` 3 sites: A fresh-install hashtable, B resume restore, C helper elseif) |
| **F-B2-3** uniform DB-write try/catch (4 telemetry routes) | wiki/408 detail + wiki/428 closure | `5b7814b` (impl + tests), `aef977c` (docs) | single quality-engineer | SHIP-OK first pass; no audit-fix needed | ~75 LOC (4 try/catch in `telemetry.ts` + new `telemetry-db-failure.test.ts` TDF-1..TDF-4) |

Total branch-state delta:
- 228/228 jest tests green (218 V23.3 baseline + 3 F-B2-1 + 1 F-B2-1 audit-fix1 boundary + 4 F-B2-3 + 0 F-B2-2 = 226 — but actual is 228 because T24 fanned into T24a/b/c sub-cases per wiki/426 §7 reconciliation).
- tsc --noEmit: clean
- pwsh AST parse under StrictMode 3: clean

---

## §3 Master-plan Critic resolution adjudication

Per wiki/425 §11, 14 Critic findings (C1-C14 + 4 OQ-CRITs) were resolved BEFORE first Builder spawned. This table records post-implementation adjudication: did the Critic warning land in reality?

| Critic | Plan resolution | Implementation outcome | Verdict |
|---|---|---|---|
| **C1** — F-B2-1 timer-registration tested | T24 fanned into T24a (registration), T24b (re-entrancy guard), T24c (hatch + test-env exempt) | All 3 sub-cases shipped + assert via indirect state observation; quality-engineer Auditor SHIP-OK | **Critic right, Builder addressed** |
| **C2** — F-B2-2 two-level PSObject guard chain | All 3 sites use two-level chain mirroring `:109-117` | AST parse clean; dry-run Step 2 verified V23.3 back-compat without `PropertyNotFoundException` | **Critic right, Builder addressed** |
| **C3** — F-B2-3 regression scan on 4 routes | grep mandate documented in wiki/408 §3 | Builder regression-scan returned 0 matches (no test relied on Express-default-handler shape) → empirically zero risk | **Critic precaution justified, low actual impact** |
| **C4** — telemetry.ts:9 2-class retention doc | Embedded in F-B2-1 commit | Builder shipped header update in `809015a` | **Critic right, Builder addressed** |
| **C5** — F-B2-2 dry-run beyond AST | 6-step dry-run + StrictMode 3 mandated | All 6 steps green + Step 5b (PrereqResult precedence) added defensively | **Critic right, Builder exceeded** |
| **C8** — F-B2-1 dual-audit | Promoted from single to dual | Auditor A NEW-LOW (hatch observability); Auditor B NEW-MED-AUDIT-FIX-REQUIRED (T22 LIMIT 1000 boundary missing) — DIFFERENT findings, justifying dual | **Critic right; dual-audit caught a real issue single-audit would have missed** |
| **C9** — F-B2-1 per-tick LIMIT 1000 | IN-SELECT-LIMIT pattern documented in plan | `_runInstallAttemptSweeperOnce()` uses `WHERE id IN (SELECT id ... LIMIT ?)`; T22b 1001-row insert verifies first tick deletes exactly 1000, second tick deletes 1 | **Critic right, Builder addressed (with audit-fix1)** |
| **C11** — F-B2-3 load-bearing `return;` | Each catch ends `return;` | All 4 routes have `return;` after `res.status(500).json(...)`; tests assert NO "Cannot set headers after they are sent" error | **Critic right, Builder addressed** |
| **C12** — F-B2-1 safety hatch env-var | `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` mandated | Shipped + T24b verifies short-circuit; Auditor A flagged hatch *observability* as NEW-LOW (deferred F-B2-1-FOLLOW-1) | **Critic right; led to forward-pointer** |
| **C13** — F-B2-3 main-merge framing | Default per-push satisfaction; conservative "진행해" alternative documented | F-B2-3 commit `5b7814b` pushed at per-push gate; main-merge framing deferred to operator | **Critic right, framing recorded** |
| **R5** — installer retry behavior on F-B2-3 500 | Auditor MUST verify | Builder skipped this grep; Auditor verified empirically: installer/Musu-Common.psm1:291-304 + src/gateway/client.ts:501-571 + src/gateway/main.ts:60-112 have **zero status-code branching** → 500 vs 502 vs network-error all retried identically | **Critic right; Builder missed; Auditor caught** |

OQ-CRIT-1..4 (master plan §11.1): all 4 resolved at plan time and matched reality.

---

## §4 NEW forward-pointers (V23.4 Tier-2+ candidates)

Two NEW items surfaced during V23.4 Tier-1 audits. Both are LOW or INFO severity and intentionally deferred.

### §4.1 F-B2-1-FOLLOW-1 (NEW-LOW): hatch observability

**Source**: F-B2-1 Auditor A (quality-engineer) wiki/426 §6.
**Finding**: `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` short-circuits silently. No log line / metric / health-check signal indicates the hatch is active. Risk: operator forgets the hatch is on, doesn't observe sweep ticks for forensics, then loses correlation between expected vs actual `install_attempt` table size.
**Severity**: LOW (operator-deliberate hatch; failure mode is silent forensics gap, not data loss).
**Disposition**: Deferred to V23.4 Tier-2 or V23.5. New wiki ID will be allocated when scoped.

### §4.2 F-B2-1-FIRST-RUN (NEW-INFO): operator runbook for first-deploy backlog drain

**Source**: F-B2-1 wiki/426 §8 (Critic C12 plan-time).
**Finding**: First V23.4 deploy on production triggers a one-time sweep within 1 hour of boot that may delete a backlog of rows >30 days old. Operator should be aware. Three options documented in wiki/426 §8:
1. Pre-snapshot Fly volume → deploy → let first sweep run (NORMAL).
2. Set `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` before deploy → manual `_runInstallAttemptSweeperOnce()` call after forensics → unset hatch (FORENSICS).
3. Pre-DELETE backlog manually via sqlite3 before deploy (AVOID — race-window with running musu-relay).
**Severity**: INFO (operational documentation, not a defect).

---

## §5 Const-gate audit

| Gate | Prediction (wiki/425 §4) | Actual outcome |
|---|---|---|
| **Const III** (schema apply) | NOT triggered (no DDL) | NOT triggered. F-B2-1 added retention runtime; F-B2-2 changed state-file JSON shape; F-B2-3 added error-handling refactor. Zero new SQLite schema versions. C12 first-run blast-radius mitigated by safety hatch + operator runbook. |
| **Const VI** (experiment) | NOT triggered | NOT triggered. F-B2-1 sweep is bounded LIMIT 1000 / 1-hour cadence — verified <100ms event-loop block at boundary by T22b. F-B2-3 try/catch is zero-overhead on success path. F-B2-2 read-at-emit-time, no hot path. |
| **Const VII** (push) | Per-push ACTIVE; main-merge framing per C13 | Per-push satisfied on every commit (6 distinct pushes). Main-merge OPERATOR-PENDING; rolls into V23.3 main-merge bundle. C13 framing recorded: F-B2-3 contract change is internal-refactor by default (fire-and-forget telemetry, clients ignore 5xx) — operator may flag for explicit "진행해" review at merge time. |

---

## §6 Acceptance criteria (per wiki/425 §9) — final verification

| # | Criterion | Verification |
|---|---|---|
| 1 | F-B2-1 + F-B2-2 + F-B2-3 all committed on `v22/gap-analysis` | `git log 4c191a4..199595b` shows 7 commits across 3 sub-WS + master plan + closure docs |
| 2 | `npx jest` green in musu-relay (target 222; actual 228 due to T24 sub-case fan + dual-audit T22b) | 228/228 jest green in 21.2s (verified at F-B2-2 close) |
| 3 | `npx tsc --noEmit` clean | clean (verified at F-B2-2 close) |
| 4 | `pwsh` AST parse clean on install-wsl2.ps1 | clean under `Set-StrictMode -Version 3` (verified at F-B2-2 close) |
| 5 | Audit returns SHIP-OK per sub-WS (dual for F-B2-1 per C8; single quality-engineer for F-B2-3; one-page closure for F-B2-2) | F-B2-1 dual-audit SHIP-OK post-fix; F-B2-3 single-audit SHIP-OK first pass; F-B2-2 dry-run + AST PASS |
| 6 | Per-sub-WS closure docs (wiki/426/427/428) | All three written and committed |
| 7 | V23.4 Tier-1 final closure (wiki/429) + qual eval (wiki/430) | wiki/429 = this doc; wiki/430 pending in same commit bundle |
| 8 | Const VII per-push gate satisfied | YES — verified at each of 6 pushes |

All 8 criteria PASS.

---

## §7 V23.4 Tier-2+ scope (explicitly deferred)

Per master plan wiki/425 §8 + §10, the following items remain deferred. Each has a reserved wiki ID per wiki/396 §5 forward-pointer table. Re-evaluation when Tier-2 master plan is opened.

| Item | Severity | Disposition |
|---|---|---|
| F-B2-4 conditional per-IP rate-limit | LOW | Defer to Tier-2 if F-B2-1 retention isn't enough alone |
| F-A1c-1..10 bench tooling extensions | LOW-MED | Defer; bench EXECUTION on Windows host remains V23.3 operator-pending |
| FO-A1a-1/4/5 image labels + airgap trim | LOW | Defer to V23.5 |
| 17 other V23.4 forward-pointers (from wiki/396 §5) | LOW or INFO | Defer with original wiki reservations preserved |
| F-B2-1-FOLLOW-1 (hatch observability) | NEW-LOW | Defer to Tier-2 |
| F-B2-1-FIRST-RUN (operator runbook detail) | INFO | Documented in wiki/426; no further action needed unless operator requests |

Wiki-ID floor after V23.4 Tier-1: **wiki/431**.

---

## §8 Operator-pending checklist (Const VII main-merge to `main`)

V23.4 Tier-1 inherits all V23.3 operator-pending items (per V23.3 wiki/396 §4.4); V23.4 adds none.

| Item | Status | Source |
|---|---|---|
| A1.c bench EXECUTION on Windows host | PENDING | V23.3 wiki/385 |
| B2 `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` | PENDING | V23.3 wiki/391 §5.1 |
| `fly deploy` + curl smoke 204/400/429 | PENDING | V23.3 wiki/391 §6.2 |
| Operator "진행해" for V23.3-or-V23.4-bundle main-merge | PENDING | V23.3 wiki/396 §4.4 + V23.4 wiki/425 §4 C13 |

Operator decides at main-merge time whether to (a) merge V23.3 + V23.4 Tier-1 as a single bundle, or (b) merge V23.3 first, smoke-test, then merge V23.4 Tier-1 separately. Both paths supported.

---

## §9 References

- Master plan: `F:\workspace\musu-bee\docs\V23_4_MASTER_PLAN_2026_05_17.md` (wiki/425)
- F-B2-1 detail / closure: `wiki/406` / `wiki/426`
- F-B2-2 detail / closure: `wiki/407` / `wiki/427`
- F-B2-3 detail / closure: `wiki/408` / `wiki/428`
- V23.3 predecessor: `wiki/396` (final closure) + `wiki/397` (qual eval)
- Branch HEAD: `v22/gap-analysis` `199595b` (this closure adds `wiki/429` + `wiki/430`)
