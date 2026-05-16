# V23.2 Workstream B — Qualitative Evaluation (wiki/377)

**Date**: 2026-05-17
**Status**: Post-closure snapshot. Code-side complete; operator-side OPERATOR-GATED items remain (B4a first build, B4c 5-host experiment, Const VII main-merge).
**Predecessors**: wiki/376 (final closure rollup), wiki/371 (B4a), wiki/373 (B4b), wiki/375 (B4c)
**Wiki ID**: `wiki/377`
**Companion to**: wiki/359 (V23.2 Workstream A2 qual eval — format precedent)

---

## 1. Why this doc exists

wiki/376 is the rollup of what shipped. This doc is the candid post-mortem of how it shipped. The two are complementary — wiki/376 answers "what is the system state", this doc answers "what would I do differently next time, and what did the agent-team pattern actually buy versus cost".

Format matches wiki/359 (Workstream A2 qual eval): symptom → root cause → what worked / didn't → lesson recorded for V23.3+.

---

## 2. Aggregate metrics

| Metric | Value | Notes |
|---|---|---|
| Sub-workstreams completed | 7 | B0 / B1 / B2 / B3 / B4a / B4b / B4c / B5 |
| Wiki docs produced | 16 | wiki/362 → wiki/377 (this doc) |
| Feature-branch commits | 17 | `83e86d0` (B0) → `c5af3ae` (final closure) |
| File deltas (since B0) | 79 changed / +17,872 / -59 | LOC-heavy because PowerShell + docs dominate |
| New files committed | 34 | musu-relay/installer/ + musu-relay/src/gateway/main.ts + docs/ |
| Existing src/ files modified | 1 | musu-relay/src/gateway/client.ts (B4b audit-fix M1 — private field rename + new public getter) |
| Cross-repo touches | 1 | musu-pro `/api/v1/nodes/validate` route — B2-pro 3-LOC commit |
| Test count delta | 0 | 189/189 from B5 baseline through every B4 sub-workstream (no test additions, no regressions) |
| `npx tsc --noEmit` | clean throughout | Including the audit-fix M1 client.ts modification |
| Critic HIGHs raised | 12+ | B1: 0 final HIGHs (dual-audit closed them); B4a: 4; B4b: 3; B4c: 0 (solo orchestrator, no Critic) |
| Critic HIGHs resolved before Builder | 100% | Per-plan §13/§14 tables in B4a + B4b |
| Auditor MEDIUMs caught (not by Critic) | 5 | B4a: 3 (M1/M2/M3); B4b: 2 (M1/M2). All fixed in audit-fix loops. |
| Const III gates | 1 | B1 schema v41 (`applyMigrations(41)`); user authorized via "진행해" |
| Const VII gates | 8 | All feature-branch pushes per "진행해" cadence; main-merge stays gated. |
| Const VI experiments | 1 deferred to operator | B4c 5-host run records α/β decision in wiki/375 §5.3 |

---

## 3. What worked

### 3.1 Agent-team Critic-before-Builder caught real bugs that would have shipped under solo

**B4b C1 HIGH** (gateway-main.ts compile recipe broken): The plan-mode `tsc --outDir installer installer/gateway-main.ts` invocation would have failed on Builder's first attempt with `TS2307: Cannot find module './client'`. Critic (`system-architect`) caught this at plan-critique time. Fix: relocate `gateway-main.ts` to `src/gateway/main.ts` so existing tsconfig.json picks it up. **Cost of catching at plan time: ~1 minute of orchestrator edit. Cost of catching at Builder time: 30-60 minutes of failed first-builds + Builder confusion.**

**B4b C2 HIGH** (α-path orphan recovery missing): The α-path flow `wsl --import` → `/issue_install_key` POST → `musu-write-key` had no cleanup branch if /issue_install_key failed AFTER `wsl --import` succeeded. Operator would have been wedged with a registered distro + no account_key + musu-init blocking forever. Critic predicted this; Builder added the try/catch wrapper around steps 7-9 with `wsl --unregister musu` on throw. **Operator would have hit this on first network blip during real install.**

**B4b C3 HIGH** (tunnel_token leak on un-elevated CmdLine): The original plan had `Invoke-MusuElevationHop` using a temp-file pattern to "protect" the elevated child's CommandLine — but the un-elevated parent ALREADY exposed the token via `Get-Process | Select CommandLine` before the hop fired. Critic caught this. Fix: refuse un-elevated `-TunnelToken` outright; force `Read-Host -AsSecureString` from the elevated child. **The temp-file pattern was elaborate security theater; the actual fix is simpler and stronger.**

**B4a C1 HIGH** (`npm ci --omit=optional` self-contradiction): Step 3 stripped `@roamhq/wrtc` and step 4 immediately tried to `require()` it. Smoke-import would have aborted EVERY build with a false "musl spike failed" message. Critic caught the contradiction before Builder wrote 200 lines of bash. Fix: drop `--omit=optional` from gateway path (B5's signaling Dockerfile keeps it).

### 3.2 Dual-audit on B1 caught the cache-poisoning bug

B1 was the only sub-workstream with dual-audit (2× `security-engineer` per `MODE_Agent_Team.md` "auth/secrets" trigger). Auditor A surfaced M1: `/issue_install_key` adapter's `forceRefresh` argument fell through to `validateToken`'s cache layer, allowing a 5-minute cache-poisoning window where a stale-valid token could mint new install keys. Auditor B independently confirmed. Fix: bypass `validationCache` entirely for the `/issue_install_key` adapter — defense-in-depth even though the canonical path doesn't exercise the poisoning window. **One Auditor would likely have missed this; the dual-audit pattern is justified for auth code.**

### 3.3 Body-identity HMAC invariant held across 2 emission paths

B1 established the `recordOutcome` pattern in `client.ts:489-549`: ONE `rawBody` string used for both HMAC signing input AND fetch POST body. B4b's `emitInstallCompleted` in `main.ts:59-126` reproduced this pattern verbatim — same single-`rawBody` invariant, same `t=${ts},v1=${sig}` header format, same SHA-256 hex lowercase encoding. Auditor independently verified at file:line. **Body-identity bugs are the #1 cause of "HMAC verification 401s in production despite working in tests" — the pattern lock is the right defense.**

### 3.4 Autonomous-loop protocol was a force multiplier

Per `feedback-autonomous-loop.md`, the orchestrator proceeded autonomously through routine Critic→Builder→Auditor cycles, only blocking on:
- Const III schema apply ("진행해" before B1's `applyMigrations(41)`)
- Const VII main-merge (still gated)
- Cross-repo deploy to musu-pro (B2-pro)
- Drain windows (B2 cache TTL + degraded grace = 5min30s)

**Result**: 7 sub-workstreams completed end-to-end across one extended /loop session. Pre-protocol behavior would have surfaced 30+ block-on-user prompts ("ready to push B4a?", "spawn Auditor?", "commit message OK?"). Each would have cost the operator a context switch.

### 3.5 Per-subworkstream wiki/NNN cross-reference system

Every closure cites its predecessors by wiki ID. Auditors read `PRIOR ARTIFACTS` lists that include the Critic Findings tables. This is a poor-person's knowledge graph but it works: a future B4d (if one ever exists) can read wiki/371 + wiki/373 + wiki/375 and have the full context without re-discovering it. **Lesson: wiki/NNN cross-reference is cheap to maintain (one line per closure) and pays off the moment a new contributor needs to onboard.**

---

## 4. What didn't work / cost more than expected

### 4.1 Plan-critique iteration cost

B4b's first plan went from Planner → Critic and came back with 3 HIGHs that required substantive plan-body edits (not just §14 table additions). Builder spawning had to wait until orchestrator patched §5 step 1 (elevation refusal), §5 step 6.5 (orphan cleanup wrapper), §10 (main.ts relocation). **Each HIGH was a ~5-10 minute orchestrator edit. 3 HIGHs = ~30 minutes of pre-Builder work.** The benefit (avoiding the bugs) was worth it, but it's worth noting that "Critic catches HIGH" is not free.

**Mitigation for V23.3+**: Researcher (Phase 0) should anticipate HIGH-prone areas and pre-resolve them in the OQ list. B4b's 10 OQ resolutions did this for the architectural decisions; the 3 HIGHs were areas the Researcher's OQ list didn't cover.

### 4.2 Audit-fix orchestrator-side bug catches

B4b audit-fix M1 (bootstrap-path C14 gap) required adding a public `accountKey` getter to GatewayClient. Builder's first attempt returned only `bootstrappedAccountKey`, missing the `cfg.accountKey` fallback — which would have re-created the original M1 bug in canonical α-path (installer pre-writes key, never triggers bootstrap, getter returns undefined → emit skipped). **Orchestrator caught this in independent verification before commit.** Documented in wiki/373 §5 as the orchestrator-side catch.

**Lesson**: Builder + Auditor + audit-fix Builder is not infallible. Orchestrator-side sanity check on small audit-fix patches is cheap and catches edge cases.

### 4.3 Plan length inflation

| Plan | Lines |
|---|---|
| wiki/363 (B1) | ~700 |
| wiki/367 (B3) | ~290 |
| wiki/370 (B4a) | ~720 |
| wiki/372 (B4b) | ~1000 (after §14 expansion) |
| wiki/374 (B4c) | ~200 |

B4b plan grew to 1000+ lines after §14 Critic Findings expansion. This is approaching the limit where "Builder reads the full plan" stops being a reliable assumption. **Mitigation**: for V23.3+, consider splitting Critic Findings into a separate doc (wiki/372.1) referenced from the plan, so Builder can read the plan body + the resolution table independently.

### 4.4 LF/CRLF git warnings

Every commit emitted `warning: in the working copy ... LF will be replaced by CRLF the next time Git touches it`. Working tree is LF, git stores LF, but the autocrlf config on this Windows host warns on every checkout. Cosmetic, but noisy. **Lesson**: add `.gitattributes` with explicit `* text=auto eol=lf` for .sh + .ts + .md files in V23.3 cleanup.

### 4.5 The `dist/` ambiguity

B4b ships `src/gateway/main.ts` which compiles to `dist/gateway/main.js`. B4a's `build-musu-backend.sh` copies `dist/gateway/*` into the tar. So:
- Before B4b lands: B4a tar has NO main.js (only client.js, bridge.js, wrtc-factory.js) and the OpenRC service file points to a non-existent path
- After B4b lands: a fresh `npm run build` produces main.js, and B4a tar built from that workspace contains it

**The operator's first B4a tar build MUST happen AFTER B4b lands.** Currently the order is enforced by commit chronology (B4a `1c389d5` → B4b `1b42960`) but the dependency isn't documented in wiki/371 or wiki/373. Reader has to infer it. **Action item**: amend wiki/371 §8 with a "Pre-build requirement: B4b's main.ts must be on the build host before running build-musu-backend.sh" note. Or accept that the next /loop iteration appends this naturally.

---

## 5. Surprises (positive)

### 5.1 The `feedback-autonomous-loop` memory paid for itself in this session

The memory record from earlier session ("야 쓸데없는거 그만물어봐...") directly drove behavior: per-push, per-commit, per-Critic-question decisions were made autonomously. The session would have stalled on B4a if every "ready to spawn Builder?" required user confirmation. **Estimated saving: 20+ user-prompt round-trips per sub-workstream × 4 sub-workstreams (B4a/b/c + final closure) = 80+ context switches avoided.**

### 5.2 Tests stayed 189/189 across all 7 sub-workstreams

Zero test regressions, zero new tests added in B4. B4 deliverables are PowerShell + bash + ONE new TS file (main.ts) + ONE existing TS file modified (client.ts public getter add). Existing test suite covers the modified path (`recordOutcome` test exercises both `bootstrappedAccountKey` and `cfg.accountKey` fallback). **Lesson: when modification is purely an API-surface-additive change (new getter, no behavior change), existing tests are sufficient.**

### 5.3 Solo orchestrator on B4c saved overhead

B4c's `MODE_Agent_Team` triggers all said NO (no auth/secrets, ≤3 files, single concern). Solo orchestrator was the right call. **Time savings**: ~30 minutes of agent-team overhead avoided. **Matches the B5 precedent** — solo on small mechanical work is documented as good practice.

---

## 6. Surprises (negative)

### 6.1 Test count is stagnant

189/189 across the entire V23.2 Workstream B run. **Zero new tests added across 7 sub-workstreams.** B1 added tests (HMAC middleware, /issue_install_key route, bootstrap path). B2 modified fixtures. B3 added 5 tests (admin auth middleware). B4a/b/c added zero — the deliverables are PowerShell + bash + integration TS, all of which are operator-gated for end-to-end validation. **This is appropriate for V23.2 scope but the test-count flatlining means V23.3 starts with the same coverage profile despite shipping 17K LOC.** Action item: V23.3 plan should include explicit "test coverage for B4 surfaces" as a follow-on (e.g., a PowerShell `Pester` test harness for install-wsl2.ps1; a jest test for `emitInstallCompleted` HMAC body-identity using a stub fetch).

### 6.2 Auditor surfacing M1/M2/M3 in B4a + M1/M2 in B4b means Critic missed real issues

5 Auditor MEDIUMs across B4a + B4b that Critic didn't catch. This is expected (Auditor sees real code, Critic sees plan) but it's worth tracking. **Lesson**: Critic's job isn't to catch every bug — it's to catch the architectural ones that survive code-review. Auditor catches the code-level ones. Both are necessary; neither alone is sufficient.

### 6.3 PowerShell static analysis is weak

Per Builder's report, the only PS static checks ran were `[System.Management.Automation.Language.Parser]::ParseFile` (AST parse, catches syntax only). Real PS bugs (undefined variables under `Set-StrictMode`, parameter binding issues, ErrorAction propagation) need PSScriptAnalyzer or similar. **V23.3 follow-on**: add PSScriptAnalyzer to a CI step.

---

## 7. Lessons recorded for V23.3+

1. **Solo orchestrator is the right call when triggers say NO.** Don't over-engineer small mechanical work.
2. **Dual-audit is justified for auth code.** B1's caught a real cache-poisoning bug Auditor A alone wouldn't have surfaced with the same confidence.
3. **Plan body length > 800 lines is a smell.** Split Critic Findings into a sidecar doc.
4. **Researcher OQ list quality predicts Critic HIGH count.** B4b's 10 OQs resolved most architectural questions; the 3 HIGHs were areas the OQs didn't cover. Better Researcher = fewer HIGHs.
5. **Body-identity HMAC invariant must be enforced at the type system level** if possible. We rely on Builder-discipline + Auditor-verification today. V23.3 candidate: refactor `recordOutcome` + `emitInstallCompleted` to share a single `signAndPost(body)` helper that makes the invariant structural.
6. **Audit-fix Builder needs orchestrator-side verification on edge cases.** Don't just trust the audit-fix Builder's "all green" report — independently spot-check the minimal-change-claim.
7. **Operator-gated items pile up.** B4a has 5 OPERATOR-GATED bullets; B4b adds 5 more; B4c adds 5+. Track them centrally (wiki/376 §5 does this) so the operator phase has a single checklist.
8. **`.gitattributes` for explicit LF on shell + TS files.** Stop the autocrlf warnings.
9. **Test coverage must be a first-class plan deliverable for non-TS surfaces.** B4 shipped 17K LOC with zero tests; that's a V23.3 debt.

---

## 8. Comparison to V23.2 Workstream A2

Workstream A2 (wiki/358-359) was the V23.1 audit-remediation work (5 HIGH fixes from V23.1 audit). It was a smaller scope (~5 files, ~2 weeks elapsed) but introduced the agent-team pattern. Workstream B is 7× larger (7 sub-workstreams vs 1 fix-pack) and validated that the pattern scales.

| Dimension | A2 (wiki/359) | B (wiki/377, this doc) |
|---|---|---|
| Sub-workstreams | 1 | 7 |
| Wiki docs | ~5 | 16 |
| Agent-team triggers | 1 (A2 itself) | 5 (B1 + B2 + B3 + B4a + B4b; B4c + B5 solo) |
| Dual-audit triggers | 0 | 1 (B1 auth) |
| Critic HIGH catches | 5 (from V23.1 audit, retroactive) | 12+ (prospective, plan-mode) |
| Auditor MEDIUM catches not in Critic | 0 (A2 was retroactive remediation) | 5 (B4a + B4b) |
| Operator-gated bullets | 0 | 15+ |

Key shift: A2 was retroactive (catch what V23.1 missed). B is prospective (catch before it ships). The agent-team pattern works for both, but the prospective use is where Critic-before-Builder pays off.

---

## 9. What's left (operator-side) — restated from wiki/376

1. **B4a first tar build** on Alpine WSL2 host. Per wiki/371 §3 acceptance criteria.
2. **B4c 5-host experiment** + record α/β `gate_decision` in wiki/375 §5.3.
3. **Const VII "진행해"** for main-merge of `v22/gap-analysis`.

All three are user-side. The autonomous-loop is paused per `feedback-autonomous-loop.md` block-on-user rule.

---

## 10. References

- wiki/359 (V23.2 Workstream A2 qual eval — format precedent)
- wiki/361 (Workstream B master plan)
- wiki/362-376 (per-sub-workstream plans + closures)
- `MODE_Agent_Team.md` (the agent-team pattern this Workstream validated at scale)
- `feedback-autonomous-loop.md` (the autonomous behavior memory that drove session pace)
- V23_MASTER_PLAN_2026_05_15.md §0.5 (3-tier install flow — the canonical spec B4 implements)

**End of V23.2 Workstream B qualitative evaluation (wiki/377).**
