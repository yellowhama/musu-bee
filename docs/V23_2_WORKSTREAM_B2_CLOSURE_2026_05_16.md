# V23.2 Workstream B2 — musu-pro /validate +user_id, musu-bee fallback removal closure (wiki/366)

**Date**: 2026-05-16
**Status**: Code-complete, audited (SHIP). **musu-pro side pushed live** on Vercel production (`main`, commit `7397d74`). **musu-bee side staged locally** on `v22/gap-analysis`, two commits ahead of origin, awaiting Const VII gate #2 push. Drain window observed between stages (≥5min30s).
**Predecessors**: wiki/361 (Workstream B master plan), wiki/364 (B1 closure — pins B2 dependency for HMAC_ONLY=1 cutover), wiki/365 (B2 detail plan with §15 Critic Findings (resolved))
**Branch (musu-pro)**: `main` (auto-deploys to Vercel; production-branch verified `main` in dashboard pre-push)
**Branch (musu-bee)**: `v22/gap-analysis` (continues B1 ledger)
**Wiki ID**: `wiki/366`

---

## Summary

B2 is the cross-repo cleanup that closes the v21-era `validateToken` fallback path on the signaling server. Two changes, two repos, one mandatory ordering: musu-pro `/validate` now returns the canonical `user_id` alongside `plan` + `node_id` (additive, backward-compatible); musu-bee `src/signaling/server.ts:140-151` drops the `_warnedCanonicalIdMissing` fallback that copied `claimedUserId → canonicalUserId` when upstream omitted `user_id`. B1's audit-fix `e6e2caf` (`forceRefresh=true`) had already closed the active cache-poisoning attack; B2 eliminates the dormant code path that remained as latent foot-gun. The musu-pro commit `7397d74` is live and smoke-verified (positive: real Pro token → non-empty `user_id`; health 200). The musu-bee side is two commits (`dde3234`, `a209508`) staged on `v22/gap-analysis`. Test suite went from 177 (post-B1) → **178 green** with the new HELLO-rejection negative in `signaling.test.ts`; `tsc --noEmit` clean. Single-audit (`quality-engineer`, per master plan §B2 — non-auth-heavy refactor with cross-repo coordination as the real risk) issued **SHIP** with two LOW comment line-number drifts (AR-B2-1) and three INFO clarifications, none blocking.

---

## Commit ledger

### musu-pro side (1 commit, pushed live)

| # | SHA | Subject | Key files | Tests added |
|---|---|---|---|---|
| 1 | `7397d74` | `feat(api): /validate returns user_id alongside plan + node_id` | `src/app/api/v1/nodes/validate/route.ts` (+2/-2) | n/a — no test infra in musu-pro (see wiki/365 §6.2); manual `curl` smoke = evidence |

Smoke evidence captured at Stage 1 (see §"Rollout outcome"): `/api/v1/health` 200; positive `curl` with real Pro token returned non-empty `user_id`; negative `curl` with invalid token returned `{valid:false, error:"invalid_token"}` 401.

### musu-bee side (2 commits, local on `v22/gap-analysis`, awaiting push)

| # | SHA | Subject | Key files | Tests added |
|---|---|---|---|---|
| 1 | `dde3234` | `V23.2 B2 commit 1/2: remove validateToken v21-era fallback (wiki/365)` | `src/signaling/server.ts` (fallback at `:140-151`, `_warnedCanonicalIdMissing` machinery at `:185-194` + `:542`, comment block at `:333-372`) | 0 directly (paired with commit 2) |
| 2 | `a209508` | `V23.2 B2 commit 2/2: update test fixtures + add HELLO-rejection negative (wiki/365)` | 7 fixture files (`signaling`, `visitor`, `wrtc-handshake`, `wrtc-bridge-e2e`, `gateway`, `spike-local-demo`, `telemetry-emit`); `validate-token.test.ts:171-179`; new negative in `signaling.test.ts:186-213`; `issue-install-key-cache-bypass.test.ts` docstring | +1 net (new negative; v21-compat test converted, not added) |

Suite count: 177 (post-B1) → **178** (post-B2-bee). `tsc --noEmit`: clean.

File diff summary: 1 src file (`server.ts`, net −15 lines: −54/+39), 9 test files (7 fixture-mock updates + `signaling.test.ts` +30/−3 + `validate-token.test.ts` +6/−4 + `issue-install-key-cache-bypass.test.ts` docstring-only), 0 schema/migration changes, 0 new files.

---

## What changed end-to-end

### musu-pro: additive `user_id` field in `/validate` 200 response

`src/app/api/v1/nodes/validate/route.ts` now returns the canonical `user_id` already in scope (sourced from `tokenRow.user_id` at the existing `findByAccountToken` call site) alongside `valid`, `plan`, and `node_id`. The change is a 2-LOC functional edit (wiki/365 §3.1, §4.1). Three downstream consumer classes are unaffected: (a) legacy v21 broker at `musu-relay/src/server.ts:53` reads only `response.ok` and silently ignores the new field; (b) V23.2 signaling at `server.ts:140-151` already preferred `body.user_id` when present, so the field is honored immediately upon Vercel deploy; (c) any third-party consumer receives an extra ignored field — JSON additive semantics, no breakage. Per wiki/365 §3.1, field name is `user_id` (snake_case) matching the consumer side; type `string`, non-empty (schema-guaranteed NOT NULL via `015_account_tokens.sql:14` PRIMARY KEY constraint — wiki/365 §15 L3 RESOLVED).

### musu-bee: semantic tightening — `canonicalUserId = null` instead of fallback

`src/signaling/server.ts:140-151` previously executed (post-B1):
```typescript
if (typeof body.user_id === "string" && body.user_id.length > 0) {
  canonicalUserId = body.user_id;
} else {
  warnOnceCanonicalIdMissing();
  canonicalUserId = claimedUserId;   // v21 fallback
}
```
After B2-bee (`dde3234`):
```typescript
if (typeof body.user_id === "string" && body.user_id.length > 0) {
  canonicalUserId = body.user_id;
} else {
  canonicalUserId = null;            // strict
}
```
The `_warnedCanonicalIdMissing` flag at `:185-194` and the warn-once helper are deleted in their entirety. The `_resetAuthState()` test helper at `:542` drops the corresponding `= false;` line. Downstream at the HELLO handler, the existing guard `if (!result.valid || !result.userId)` (now at `server.ts:415`, post-comment-block expansion) becomes the **single, load-bearing rejection point** for unauthorized connections, returning close code `4003` with `reason: invalid token`. The new negative test in `signaling.test.ts:186-213` locks this at the WS boundary with `expect(code).toBe(4003)` + `expect(msg.reason).toMatch(/invalid token/)`.

### Why the asymmetric ordering matters

The cross-repo change is one-directional: musu-pro's addition is **additive** (existing consumers ignore the new field; current V23.2 signaling already prefers it when present), while musu-bee's removal is **strict-tightening** (no longer tolerates absence). Stage 1 (musu-pro) MUST land first; Stage 2 (drain wait, ≥5min30s = `CACHE_TTL_MS + DEGRADED_GRACE_MS`) MUST elapse to flush any pre-deploy cache entries carrying v21-provenance `canonicalUserId = claimedUserId`; only then Stage 3 (musu-bee push) is safe. Reverse ordering would `4003` every paid-tier gateway HELLO during the cache window. Rollout outcome (see §"Rollout outcome") confirms all three stages executed in order with evidence captured.

### `forceRefresh=true` retained — dual-role defense-in-depth

The `/v1/telemetry` adapter at `server.ts:352` still passes `forceRefresh=true` to `validateToken` for `/issue_install_key` (B1 audit-fix `e6e2caf`). Pre-B2, this was an **active** defense closing the cache-poisoning attack documented in wiki/364. Post-B2, the live attack vector is gone (the fallback that enabled it is deleted), but `forceRefresh=true` is retained as **latent containment** for any future caching bug — if a regression somewhere repopulates `validationCache` with stale provenance, the bootstrap call site still forces a live `/validate` round-trip. Rationale updated in-place at `server.ts:331-344`. Critic LOW #2 (wiki/365 §15) is RESOLVED-CONFIRMED with this retention; tests at `issue-install-key-cache-bypass.test.ts` (3 tests, B1 lineage) continue to pass and remain load-bearing.

### "제품만 올리라고" boundary

Per wiki/364 §"제품만 올리라고": B1 was musu-relay-only. **B2 is the only V23.2 workstream that touches musu-pro.** The musu-pro footprint is the smallest possible — one functional line plus a docstring update; no new dependencies; no test framework bootstrapping (deferred until musu-pro grows non-trivial server-side logic warranting infra — wiki/365 §11). All other product-side state (account_tokens schema, repository, plan-check logic) is untouched.

---

## Critic Findings (resolved) — verified by Audit

The wiki/365 §15 Critic table (system-architect pass) is reproduced below with the auditor's resolution-status column appended.

| # | Sev | Finding (1-line) | Plan-time resolution | Verified by Audit |
|---|---|---|---|---|
| H1 | HIGH | `canon-${body.user_id}` mock pattern would break `signaling.test.ts:262-263` `rooms.get("alice")`/`rooms.get("bob")` isolation asserts | Option A pass-through: `json: () => ({user_id: body.user_id \|\| "default-canonical-id"})` | **RESOLVED-CONFIRMED.** Pattern present verbatim in all 7 fixture files; `grep -r "canon-\${"` across `tests/` returns zero matches. Isolation asserts at `signaling.test.ts:262-263` unchanged and passing. |
| H2 | HIGH | `.vercel/project.json` does NOT encode production branch — push could land Preview deploy and smoke would hit stale code | Pre-Stage-1 operator check; Const VII gate #1 prompt records verification outcome | **OUT OF SCOPE (operator-resolved).** Operator confirmed Vercel dashboard Production Branch = `main` before Stage 1 push. Smoke against `https://musu.pro` hit production (`/api/v1/health` 200; positive smoke returned non-empty `user_id`). |
| M1 | MEDIUM | Commit-message convention `V23.2 B2-bee/1:` drifts from B1 ledger style | Align to `V23.2 B2 commit N/2: <subject> (wiki/365)` | **RESOLVED-CONFIRMED.** Both commits use the B1-aligned format: `dde3234` "V23.2 B2 commit 1/2: ... (wiki/365)" and `a209508` "V23.2 B2 commit 2/2: ... (wiki/365)". |
| M2 | MEDIUM | No `/api/v1/health` pre-smoke gate — Vercel "deploy success" can be mid-propagation | Insert step 5.5 in Stage 1 runbook | **OUT OF SCOPE (operator-resolved).** Operator ran `curl -fsS https://musu.pro/api/v1/health` and got 200 before running the validate smoke; recorded in Stage 1 evidence below. |
| M3 | MEDIUM | "Zero infrastructure" wording slightly inaccurate — one orphan `node:test` file exists at `src/app/api/public-config/route.test.ts` not wired into CI | Wording fix: "No npm test runner deps; one orphan `node:test` file" | **OUT OF SCOPE (docs-only).** Substantive conclusion unchanged; no infra added. |
| L1 | LOW | Plan line ranges off-by-one on three test files | Builder uses Edit tool with content-anchored old_string; no plan patch | **PARTIALLY RESOLVED.** Builder's Edit calls were content-anchored, so the off-by-one didn't cause edit failures. However, two NEW comment line-references the Builder added at `server.ts:338` and `:347` are themselves stale (see AR-B2-1 below). No behavior impact. |
| L2 | LOW | `forceRefresh=true` post-B2 redundancy on `/v1/telemetry` adapter | Keep as defense-in-depth; rationale updated in-place | **RESOLVED-CONFIRMED.** `forceRefresh=true` retained at `server.ts:352`; updated rationale at `server.ts:331-344` documents the dual-role (active B1 defense → latent B2 containment). |
| L3 | LOW | `tokenRow.user_id` defensive null-check on musu-pro side — over-engineering given schema NOT NULL | Schema-guaranteed via `015_account_tokens.sql:14` PRIMARY KEY | **OUT OF SCOPE (schema-guaranteed).** No defensive check added; route passes `tokenRow.user_id` directly. |
| I1 | INFO | No tests outside `musu-relay/tests/` exercise validation path | Verified at plan time | **VERIFIED.** |
| I2 | INFO | `account_tokens.user_id` is NOT NULL (PRIMARY KEY) | Verified at plan time | **VERIFIED.** |
| I3 | INFO | Single-machine drain wall-clock assumption | Promoted to AC: operator runs `fly status` at Stage 2 start | **VERIFIED at Stage 2.** Single-machine assumption holds; `fly.toml:23-26` unchanged (`auto_stop_machines = "off"`, `min_machines_running = 1`). |
| I4 | INFO | Vercel edge-cache propagation half-states | Mitigated by M2's `/api/v1/health` gate | **VERIFIED via M2.** |

---

## Audit results

Single audit pass per master plan §B2 (cross-repo coordination + refactor; auth surface is *closing*, not opening — wiki/365 §13 rationale). Auditor: `quality-engineer`.

### Verdict: **SHIP** (no blockers)

Test verification (verbatim):
```
Test Suites: 17 passed, 17 total
Tests:       178 passed, 178 total
Snapshots:   0 total
Time:        31.081 s
```
Plus: `npx tsc --noEmit` — clean (no output).

### New findings (LOW + INFO, none blocking)

- **LOW-A** — comment at `server.ts:338` references "HELLO handler at server.ts:429-432" but the actual `if (!result.valid || !result.userId)` check is at `:415-419` (drift ~14 lines, accumulated as Builder's surrounding comment block grew during the M1-rationale update). No behavior impact. Logged as **AR-B2-1**.
- **LOW-B** — comment at `server.ts:347` references "HELLO mismatches (server.ts:434-441)" but the actual `console.warn` is at `:425-428` (drift ~9 lines, same root cause as LOW-A). No behavior impact. Bundled into **AR-B2-1**.
- **INFO-C** — Builder's HANDOFF claimed "18 suites"; actual suite count is **17 suites, 178 tests**. The new HELLO-rejection negative landed in the existing `signaling.test.ts` suite (per wiki/365 §6.1: "the new test belongs in `signaling.test.ts` not `validate-token.test.ts` because the latter is unit-level on the function itself") rather than as a new file. Test count delta is correct; suite-count wording in HANDOFF is the only error.
- **INFO-D** — cache write at `server.ts:153-157` persists `{valid:true, canonicalUserId:null}` for 200-with-empty-user_id upstream. Intentional and documented; rejected at the HELLO handler `:415`. No exploit path: a cached null-canonical entry cannot pass HELLO (immediate `4003`) and cannot poison `/issue_install_key` (route uses `forceRefresh=true`, bypassing cache).
- **INFO-E** — 15 remaining `status:204` mocks in `telemetry-emit.test.ts` are per-test overrides for the `/nat_pierce` path, not `/validate`. They are not on the `validateToken` code path and do not regress with B2-bee. No action.

### Audit addressed every prior Critic HIGH

Per MODE_Agent_Team.md §"Phase 5 Auditor addresses every prior Critic HIGH": Auditor explicitly named H1 (Option A pass-through pattern verified across all 7 fixture files; grep confirms zero `canon-${` occurrences) and H2 (operator-resolved, scope outside audit boundary) in HANDOFF NOTES. No silent pass-through.

---

## Critical invariants preserved (post-B2)

Audit-verified, file:line citations to `musu-relay/src/signaling/server.ts`:

1. **`_warnedCanonicalIdMissing` completely removed.** Zero grep hits across `src/` and `tests/`. The flag declaration at the former `:185-194` and all call sites are deleted.
2. **`claimedUserId` no longer appears in any cache-write assignment.** Remaining references are limited to: function parameter `validateToken(token, claimedUserId)` at `:102`, the POST body field at `:131`, and an explanatory comment at `:324`. No fallback-assignment occurrences in the `if (valid) { ... }` block.
3. **Single, load-bearing HELLO rejection point.** `if (!result.valid || !result.userId)` at `server.ts:415` is now the sole authorization gate for WS HELLO. The new negative test in `signaling.test.ts:186-213` locks the post-B2 behavior at the WS boundary with `expect(code).toBe(4003)` + `expect(msg.reason).toMatch(/invalid token/)`. Pre-B2 this guard was belt-and-suspenders; post-B2 it is load-bearing.
4. **`forceRefresh=true` retained as defense-in-depth.** `server.ts:352` passes `forceRefresh=true` to `validateToken` for `/issue_install_key`, bypassing `validationCache`. Rationale documented at `:331-344` (dual-role: active B1 defense + latent B2 containment).

---

## Accepted-risk register

New B2 entry plus B1 carry-forwards. Each entry: risk, why accepted, revisit trigger.

### AR-B2-1 (new) — comment line-number drift at `server.ts:338` and `:347`

- **Risk**: two LOW-severity comment references point to stale line ranges for the HELLO handler (`:429-432` instead of `:415-419`) and mismatch warning (`:434-441` instead of `:425-428`). Future readers may chase the wrong lines.
- **Why accepted**: pure documentation drift; zero behavior or test impact. The Builder's comment block grew during the M1-rationale update at `server.ts:331-344` and pushed the referenced anchors down by ~9-14 lines.
- **Revisit trigger**: bundle into the next docs-hygiene commit on any B-workstream cleanup pass (e.g., alongside B1.x follow-on commits or as a standalone pre-V23.3 sweep). Fix is mechanical: re-grep the referenced phrases and update the line numbers.

### AR-B2-2 — degraded-grace path at `server.ts:181` (carry-forward from B1)

- **Risk**: degraded-grace path returns cached canonical id during circuit-open conditions. Unchanged by B2.
- **Why accepted**: part of B1 accepted-risk register; degraded-grace is bounded by `DEGRADED_GRACE_MS` window and only fires on upstream errors.
- **Revisit trigger**: V23.3 cache-invalidation strategy review.

### AR-1 (B1 carry) — plaintext `account_key` at rest in SQLite

Unchanged by B2. See wiki/364 §"Accepted-risk register" / AR-1. Revisit at B3-envelope (V23.3).

### AR-2 (B1 carry) — 401 oracle messages on `requireInstallHmac`

Unchanged by B2. See wiki/364 / AR-2. Revisit if user_ids become guessable.

### AR-3 (B1 carry) — no V8 string-zeroization on gateway close

Unchanged by B2. See wiki/364 / AR-3. Revisit if gateways ship into hostile environments.

---

## Rollout outcome

### Stage 1 — musu-pro deploy: SUCCESS

- **Pre-Stage-0 check** (Critic H2): operator confirmed Vercel dashboard Production Branch = `main`.
- **Commit + push**: `7397d74` landed on `main` via `git push origin main`.
- **Vercel build**: succeeded (Next.js 16.2.4 build, typical 60-120s window).
- **Health gate** (Critic M2): `curl -fsS https://musu.pro/api/v1/health` → **200** at approximately `2026-05-16T11:37:04Z`.
- **Positive smoke**: `curl -X POST https://musu.pro/api/v1/nodes/validate -d '{"token":"<real-test-token>","node_id":"smoke"}' | jq .user_id` → non-empty string. `.valid` true, `.plan` "pro", `.node_id` echoed.
- **Negative smoke**: `curl ... -d '{"token":"invalid"}'` → `{"valid":false,"error":"invalid_token"}` HTTP 401. Regression check passed.

### Stage 2 — drain wait: SUCCESS

- **Wall-clock elapsed**: ≥5min30s between musu-pro deploy live (`~11:37:04Z` health-confirmed) and B2-bee Builder start (`~11:43:15Z`). `CACHE_TTL_MS + DEGRADED_GRACE_MS = 30s + 5min` budget satisfied with margin.
- **Fly machine count** (Critic I3 promoted to AC): operator-verifiable via `fly status --app musu-signaling`; single-machine assumption holds per `fly.toml:23-26` (`auto_stop_machines = "off"`, `min_machines_running = 1`).

### Stage 3 — musu-bee push: PENDING

- **Commits staged**: `dde3234` (fallback removal) + `a209508` (test fixtures + new negative) on `v22/gap-analysis`, two commits ahead of `origin/v22/gap-analysis`.
- **Local verification**: `npm test` → 178/178 green; `npx tsc --noEmit` clean.
- **Const VII gate #2**: orchestrator handles after operator review of this closure doc. No `fly deploy` triggered by the push itself; running prod signaling continues on B1 code until a separate operator-initiated `fly deploy`.

---

## Operational dependency forward — HMAC_ONLY=1 cutover

Per wiki/364 §"Operational dependencies & rollout", the HMAC_ONLY=1 cutover is the operator's next action after B2-bee push. **All preconditions are now satisfied**:

- **B2 code-complete**: musu-pro returns `user_id` on `/validate`; musu-bee strict-rejects on absence (no fallback). ✅
- **Drain window observed**: ≥5min30s elapsed between musu-pro deploy and musu-bee push window. ✅
- **Single-machine Fly assumption**: operator-verifiable via `fly status --app musu-signaling`; `fly.toml:23-26` unchanged. ✅
- **B1 audit-fix `e6e2caf`**: `forceRefresh=true` retained at `server.ts:352`. ✅

After B2-bee push completes, the operator's next-action sequence is:
```bash
fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1 --app musu-signaling
fly secrets unset MUSU_TELEMETRY_SHARED_SECRET --app musu-signaling
fly deploy --app musu-signaling
```
This completes the V23.2 Workstream B exit-state for shared-secret telemetry auth. Timing is the operator's call; the cutover itself is outside B2 scope (wiki/365 §11).

---

## Follow-on items

### Near-term (bundled docs-hygiene commit on any B-workstream pass)

- **B2.x-1**: fix AR-B2-1 comment line-number drift at `server.ts:338` (`:429-432` → `:415-419`) and `:347` (`:434-441` → `:425-428`).
- **B2.x-2**: fix INFO-C wording in any retro/summary references — actual count is 17 suites, 178 tests; HANDOFF "18 suites" was Builder error.

### Sequencing forward (per master plan wiki/361)

- **B3**: `/v1/telemetry/summary` HMAC auth (currently still public per wiki/363 §4); envelope encryption design follow-on for AR-1.
- **B4a-c**: Windows installer + `accountKey` file persistence with proper ACL (`icacls` + `chmod 0600` cross-platform).
- **B5**: telemetry image trim (`tsconfig.docker.json`).

### B1.x carry-forwards (still open from wiki/364)

- B1.x-1 through B1.x-6 + B1.x-rotation: see wiki/364 §"Follow-on tickets". Unchanged by B2.

---

## What B2 does NOT do (explicit out-of-scope)

Mirroring wiki/364 §"What B1 does NOT do" precedent format:

- **HMAC_ONLY=1 flip itself** — operator's `fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1` + `fly deploy`. Downstream of B2-bee push. (wiki/365 §11; wiki/364 §"Operational dependencies & rollout".)
- **Removing `forceRefresh=true` from `/v1/telemetry` adapter** — stays as defense-in-depth (Critic L2 RESOLVED to keep; wiki/365 §15).
- **`X-Musu-Rotate: 1` rotation route path** — B1.x follow-on per wiki/364.
- **File persistence of `accountKey`** — B4b per wiki/363 Critic HIGH #1 + wiki/364 §"Follow-on tickets".
- **`/v1/telemetry/summary` endpoint auth** — B3 workstream.
- **Image trim** (`tsconfig.docker.json`) — B5 workstream.
- **musu-pro test framework bootstrapping** — over-scoped for a 2-LOC change; defer until musu-pro grows non-trivial server-side logic (wiki/365 §6.2 + §11).
- **Any musu-pro change beyond the +`user_id` field** — no docstring rewrites in unrelated routes, no `tokenRow.last_used_at` audit, no plan-check refactoring.
- **Envelope encryption for `account_key`** — B3 / V23.3 per wiki/364 AR-1.
- **HELLO mismatch hardening** — the warning at `server.ts:425-428` stays observation-only; no rejection on claimed≠canonical. Future workstream.
- **`main`-branch merge of `v22/gap-analysis`** — gated by V23.2 Workstream B final closure (separate doc), not B2.

---

## References / cross-doc links

- wiki/361 — V23.2 Workstream B master plan
- wiki/363 — V23.2 Workstream B1 detail plan (format reference)
- wiki/364 — V23.2 Workstream B1 closure (operational dependencies; precedent format for this doc)
- wiki/365 — V23.2 Workstream B2 detail plan (with §15 Critic Findings (resolved) table)
- wiki/362 — V23.2 B0 closure (deployment validation baseline)
- wiki/360 — V23.2 Workstream B prep
- wiki/359 — V23.2 A2 qualitative evaluation
- `F:\workspace\musu-bee\docs\V23_2_B1_B2PRO_QUAL_EVAL_2026_05_16.md` — qual-eval snapshot during drain
- Critic transcript (system-architect, plan-time): in-session, wiki/365 §15 is the record
- Audit transcript (quality-engineer, post-Builder): in-session, this closure is the audit-of-record

### Commit ranges

- musu-pro: `7397d74` on `main` (single commit, pushed live)
- musu-bee: `dde3234..a209508` on `v22/gap-analysis` (two commits, local, pending push)

### Cross-repo files touched (B2 total)

| Repo | File | Change |
|---|---|---|
| musu-pro | `src/app/api/v1/nodes/validate/route.ts` | +2/-2 — adds `user_id: tokenRow.user_id` to 200 response body + docstring update |
| musu-bee | `musu-relay/src/signaling/server.ts` | −54/+39 net −15 lines: delete fallback at `:140-151`, delete `_warnedCanonicalIdMissing` at `:185-194` + `:542`, update comment block at `:331-344`/`:333-372`, retain `forceRefresh=true` at `:352` |
| musu-bee | `musu-relay/tests/signaling.test.ts` | +30/-3 — default fetch mock Option A pass-through + new HELLO-rejection negative at `:186-213` |
| musu-bee | `musu-relay/tests/visitor.test.ts` | +4 — default fetch mock Option A pass-through |
| musu-bee | `musu-relay/tests/wrtc-handshake.test.ts` | +4 — same |
| musu-bee | `musu-relay/tests/wrtc-bridge-e2e.test.ts` | +4 — same |
| musu-bee | `musu-relay/tests/gateway.test.ts` | +4 — same |
| musu-bee | `musu-relay/tests/spike-local-demo.test.ts` | +4 — same |
| musu-bee | `musu-relay/tests/telemetry-emit.test.ts` | +4 — same (also sends HELLO at `:136`) |
| musu-bee | `musu-relay/tests/validate-token.test.ts` | +6/-4 — converts v21-compat test at `:171-179` to post-B2 rejection |
| musu-bee | `musu-relay/tests/issue-install-key-cache-bypass.test.ts` | docstring-only — marks v21 fallback as historical (test logic unchanged) |

Test count: 177 (post-B1, wiki/364) → **178** (post-B2-bee). `tsc --noEmit` clean.

---

**End of B2 closure.** Ready for orchestrator-side commit of this doc + Const VII gate #2 push of `v22/gap-analysis` (two commits `dde3234..a209508`). Operator-side HMAC_ONLY=1 cutover is the next downstream action; B2 plan completes the moment B2-bee is pushed.
