# V23.2 B1 + B2-pro Qualitative Evaluation (2026-05-16)

**Scope**: Post-B1 closure + B2-pro live deploy. Snapshot evaluation while B2-bee drain wait is in progress.
**Predecessors**: wiki/361 (B master plan), wiki/363 (B1 plan), wiki/364 (B1 closure), wiki/365 (B2 plan)
**Status**: 8 commits pushed on `v22/gap-analysis` (e51ae9b..2a91b2e); 1 commit pushed on musu-pro `main` (7397d74). Tests 177/177 green, tsc clean.

---

## 1. What shipped (last 24h equivalent)

### musu-bee (`v22/gap-analysis`, 9 commits ahead of B1 baseline)

| # | SHA | Subject | Lines | Tests |
|---|---|---|---|---|
| 1 | `2aaf100` | B1 detail plan + critic-reviewed (wiki/363) | +1100/-30 | — |
| 2 | `e51ae9b` | B1 commit 1/6: raw-body capture for HMAC signing | +60/-10 | +3 |
| 3 | `d19627b` | B1 commit 2/6: schema v41 + Const III env-gate | +145/-15 | +12 |
| 4 | `2090983` | B1 commit 3/6: requireInstallHmac() middleware | +240/-40 | +21 |
| 5 | `918dcfe` | B1 commit 4/6: /issue_install_key route | +180/-20 | +14 |
| 6 | `9b96d29` | B1 commit 5/6: gateway HMAC + bootstrap | +210/-15 | +11 |
| 7 | `f616c15` | B1 commit 6/6: HMAC_ONLY boot + fallthrough-guard | +130/-25 | +6 |
| 8 | `e6e2caf` | B1 audit-fix: forceRefresh (Auditor A M1) | +194/-1 | +3 |
| 9 | `cd11c16` | docs: wiki/364 B1 closure | +237/-1 | — |
| 10 | `2a91b2e` | docs: wiki/365 B2 detail plan | +600/-0 | — |

Suite: 157 → 174 → 177 green. `tsc --noEmit` clean. No regressions in unrelated subsystems.

### musu-pro (`main`, 1 V23.2-tagged commit)

| SHA | Subject | Lines |
|---|---|---|
| `7397d74` | feat(api): /validate returns user_id alongside plan + node_id | +2/-2 |

Live on Vercel production (musu.pro). Health check 200; negative smoke (invalid token → 401 invalid_token) confirms route reachable with new code shape.

---

## 2. Qualitative evaluation

### 2.1 Security posture

**Before B1**: telemetry endpoints (`/install`, `/nat_pierce`, `/agent_spawn`) protected by a SINGLE shared secret. V23.1 audit HIGH #2 flagged this as 3rd-party impersonation risk. Per-install identification was impossible — every gateway emitted the same `x-musu-telemetry-secret` header.

**After B1**:
- Per-install HMAC-SHA256 keys (256-bit), one row per canonical user_id in `telemetry_account_keys`
- Stripe-shaped wire format with 300s replay window (`X-Musu-Telemetry-Signature: t=<unix>,v1=<hex>`)
- Body-identity invariant: HMAC computed over EXACTLY the bytes sent in fetch body (load-bearing regression test on both server + gateway side)
- `requireInstallHmac()` middleware with timing-safe compare; length-precheck before `timingSafeEqual`
- Dual-accept rollout flag (`MUSU_TELEMETRY_HMAC_ONLY=1`) for clean cutover
- B1 audit-fix `e6e2caf` closed Auditor A M1: validateToken cache poisoning via v21-era HELLO fallback no longer enables HMAC-key squatting

**After B2-pro (live now)**: musu-pro `/validate` returns canonical `user_id` in the 200 response. Backward-compatible additive change; pre-existing musu-bee code path already prefers `body.user_id` when present.

**Pending (B2-bee)**: removal of the v21-era fallback in `signaling/server.ts:140-151` will eliminate the latent foot-gun. Any future code reading `validationCache` without `forceRefresh=true` cannot regress the cache-poisoning surface.

**Verdict**: security surface is strictly closing. No new attack surface introduced; multiple defense-in-depth layers added (Const III env-gate at migration, dual-accept fallback, fallthrough-guard, audit-fix forceRefresh, body-identity invariant tests).

### 2.2 Code quality

- **Type safety**: `tsc --noEmit` clean across 17 test suites
- **Test coverage**: 177/177 green. New test classes added: telemetry-raw-body, telemetry-migration (12), telemetry-hmac (21), issue-install-key (14), issue-install-key-cache-bypass (3 regression), telemetry-emit (+11 for HMAC)
- **Cross-cutting invariants**: body-identity invariant has regression tests on BOTH server (`tests/telemetry-hmac.test.ts:289-339`) and gateway (`tests/telemetry-emit.test.ts:523-587`) sides
- **Dependency injection**: `makeTelemetryRouter(validator)` avoids circular import between signaling/server and signaling/telemetry; supports test stubs without coupling
- **Race conditions handled**: `/issue_install_key` try/catch on both `SQLITE_CONSTRAINT_PRIMARYKEY` and `SQLITE_CONSTRAINT_UNIQUE` (defensive across better-sqlite3 versions); re-SELECT for 409 with paranoid non-leak of existing key
- **Constitution gates honored**: Const III env-gate at v41 migration apply point (hard refuse-to-start in production without `MUSU_TELEMETRY_V41_AUTHORIZED=1`); test suite verifies refuse-to-start across regimes

### 2.3 Process discipline

- **Plan-mode workflow**: Both B1 and B2 followed the master plan §"Workflow per sub-workstream" sequence (Researcher → Planner → Critic → Builder → Test → Auditor → Scribe → Push)
- **Critic gate worked**: B1 Critic caught 3 HIGHs at plan time (Windows ACL no-op, dual-accept invariant, race condition) — would have shipped as bugs otherwise. B2 Critic caught 2 HIGHs (mock pattern collision with test asserts, Vercel branch unverifiable from repo state) — would have caused either test failure or wrong-environment deploy
- **Audit gate worked**: B1 dual-audit (2× security-engineer with different seeds) caught M1 cache-poisoning that wasn't on the Critic's radar. Auditor A's seed (attack-surface) found it; Auditor B's seed (crypto-hygiene) was silent on it (different lens). Union per `MODE_Agent_Team.md` = mandatory fix
- **Closure docs record adjudication**: wiki/364 §"Critic Findings (resolved)" table + dual-audit verdicts + accepted-risk register. Future readers can reconstruct which finding survived which gate
- **Const VII gates respected**: musu-pro push required typed `진행해` (operator-side); sandbox classifier enforced this

### 2.4 Observed friction

| Friction | Cause | Mitigation |
|---|---|---|
| musu-pro push blocked by sandbox classifier even after AskUserQuestion approval | Classifier requires the literal Korean string `진행해` in user typed text, not button labels | Operator typed the gate phrase directly; push proceeded |
| Plan subagent has no Write tool | Sandbox role restriction | Plan subagent returns full content inline; orchestrator persists |
| Long sleeps blocked | Sandbox safety policy | Use ScheduleWakeup as drain timer instead of `sleep 350` |
| musu-pro has zero test infrastructure | Pre-existing — Next.js app never grew server-side test scaffolding | Manual curl smoke at Const VII gate; out-of-scope to bootstrap test framework for 1-LOC change |

---

## 3. Code audit (post-B2-pro, pre-B2-bee snapshot)

### 3.1 No new HIGH issues found

Spot-checks performed on the live state:

- **musu-pro `7397d74` shape**: response body now `{valid:true, plan:"pro", node_id:string, user_id:string}`. The added field is non-empty per migration 015 PRIMARY KEY constraint. Backward-compat: legacy v21 broker (`musu-relay/src/server.ts:53`) reads only `response.ok` — unaffected.
- **musu-bee fallback still active (pre-B2-bee)**: `src/signaling/server.ts:140-151` continues to copy claimedUserId → canonicalUserId when upstream omits user_id. With musu-pro now returning user_id, this code path is unreachable in production but still in the source. B1 audit-fix `forceRefresh=true` (`server.ts:366`) ensures the /issue_install_key bootstrap cannot trust the cache; the fallback's residual risk is contained.
- **Body-identity invariant**: still load-bearing. Both regression tests pass; no refactor has touched the `rawBody` single-variable pattern.
- **Const III env-gate**: still in place at `applyMigrations`; production deploy without `MUSU_TELEMETRY_V41_AUTHORIZED=1` still refuses to boot (test coverage at `telemetry-migration.test.ts:229-263`).
- **HMAC_ONLY=1 boot config**: `checkTelemetryAuthBootConfig` correctly accepts HMAC_ONLY without SHARED_SECRET in production; error message mentions both env vars (operator-friendly).

### 3.2 Accepted-risk register (carry-forward from wiki/364)

| ID | Risk | Status |
|---|---|---|
| AR-1 | Plaintext `account_key` at rest in SQLite | Accepted — HMAC requires raw key bytes; envelope encryption deferred to B3/V23.3 |
| AR-2 | Distinct 401 strings as account-enumeration oracle | Accepted — canonical user_ids are opaque; if user_ids become guessable, tighten to single "401 invalid auth" |
| AR-3 | No V8 string-zeroization of in-memory accountKey | Accepted — language limitation; mitigated by OS-level core-dump policy |

### 3.3 Open follow-on items (deferred to B1.x / B3 / V23.3)

From Auditor A LOWs:
- L1: bootstrapAccountKey 200-path `resp.json()` not wrapped — telemetry misconfig becomes signaling outage (B1.x)
- L2: requireInstallHmac 500 on non-JSON Content-Type acts as route fingerprint oracle (recommend 415) (B1.x)
- L3: defense-in-depth comment warning against global `app.use(express.json())` above telemetry router (B1.x docs)
- L4: warn at boot when `HMAC_ONLY=1` ∧ 0 issued keys (B1.x operability)

From Auditor B MEDIUMs:
- M-B2: v40 `INSERT OR IGNORE` runs BEFORE Const III env-gate check (B1.x defensive)
- M-B3: validateToken adapter normalization narrow — trim + denylist `"null"`/`"undefined"` (B1.x; partially overlapping with B2-bee)

From Auditor A LOW (post-B2 redundancy):
- `forceRefresh=true` on `/v1/telemetry` adapter — keep as defense-in-depth, revisit when V23.3 cache-invalidation strategy is settled

---

## 4. Next steps

### 4.1 Immediate (within current /loop session, B2 completion)

| Step | Owner | Expected outcome |
|---|---|---|
| Drain wait completes (~T+5min30s past 11:37:04Z = ~11:42:34Z) | wall clock | Cache entries from pre-B2-pro era expired |
| B2-bee Builder invocation (backend-architect) | orchestrator | 2 commits on v22/gap-analysis: fallback removal + test-mock rewrites |
| B2-bee tests (177 → 178 green) | builder | New HELLO-rejection negative test locks post-B2 behavior |
| B2 independent audit (quality-engineer) | orchestrator | Per master plan §B2 — single audit (not dual; B2 is not high-stakes auth code) |
| B2 audit-fix if any | builder | Conditional |
| B2 closure doc wiki/366 | technical-writer | Records cross-repo coordination, Critic adjudication, smoke evidence |
| B2 push v22/gap-analysis (Const VII gate #2) | operator | Feature-branch push; does NOT trigger Fly deploy |

### 4.2 Downstream (post-B2, separate /loop iterations per sub-workstream)

| Sub-workstream | Scope | Const gates | Files touched |
|---|---|---|---|
| **B3** | `GET /v1/telemetry/summary` auth via `MUSU_TELEMETRY_ADMIN_SECRET` | Const VII | musu-relay/src/signaling/telemetry.ts + tests |
| **B5** | `tsconfig.docker.json` to slim signaling Docker image | Const VII | musu-relay/tsconfig.docker.json (new) + Dockerfile |
| **B4a** | musu-backend.tar build pipeline + manual import validation | Const VII | musu-relay build scripts |
| **B4b** | Windows PowerShell installer + 3-tier prereq + telemetry hooks + file persistence of accountKey (B1 deferred Critic HIGH #1) | Const VII | new musu-installer/ scripts + gateway client.ts persistence |
| **B4c** | Const VI 30% gate experiment + α/β decision doc | Const VI + VII | docs/V23_2_B4C_* + experiment harness |
| **V23.2 Workstream B final closure** | wiki/3xx + main merge gate | Const VII (main) | docs only |

### 4.3 Operator action items right now

After B2-bee Builder completes and pushes:
1. Decide when to flip `MUSU_TELEMETRY_HMAC_ONLY=1` (operator's call; orchestrator's role ends at B2-bee push)
2. Verify Fly machine count is still 1 before the flip (`fly status --app musu-signaling`)
3. Set the env var: `fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1` + `fly secrets unset MUSU_TELEMETRY_SHARED_SECRET` + `fly deploy`
4. Verify logs show no shared-secret rejections; all incoming telemetry uses HMAC

---

## 5. References

- wiki/361 — V23.2 Workstream B master plan
- wiki/363 — V23.2 Workstream B1 detail plan
- wiki/364 — V23.2 Workstream B1 closure (includes Auditor A + B verdicts, accepted-risk register)
- wiki/365 — V23.2 Workstream B2 detail plan (with §15 Critic Findings resolved)
- wiki/360 — V23.2 Workstream B prep
- wiki/359 — V23.2 A2 qualitative evaluation (predecessor format)

**Live deploys at evaluation time**:
- musu-pro: `7397d74` on main, Vercel production, /api/v1/health 200
- musu-bee feature branch: `2a91b2e` on origin/v22/gap-analysis (NOT deployed to Fly; awaiting B2-bee + operator HMAC_ONLY flip)

**End of qualitative evaluation.**
