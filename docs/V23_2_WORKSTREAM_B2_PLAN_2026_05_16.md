# V23.2 Workstream B2 — musu-pro /validate returns user_id + musu-bee fallback removal (wiki/365)

**Date**: 2026-05-16
**Status**: Plan-mode draft. **In plan mode, awaiting Critic** (system-architect recommended). Pre-Builder. Cross-repo: musu-pro + musu-bee.
**Predecessors**: wiki/361 (Workstream B master plan §B2 + §"Sequencing + dependencies"), wiki/363 (B1 detail plan — format reference), wiki/364 (B1 closure §"Operational dependencies & rollout" — pins the B2 dependency for HMAC_ONLY=1 cutover)
**Branch (musu-bee)**: `v22/gap-analysis` (continue existing — no new branch; B2-bee is a 2-commit follow-on to B1's 7-commit ledger)
**Branch (musu-pro)**: `main` (musu-pro has no feature-branch convention per `git log --oneline`; all recent commits land on `main` and auto-deploy via Vercel — see §7 Stage 1)
**Wiki ID**: `wiki/365`

---

## 1. Summary

B2 is the cross-repo cleanup that closes the v21-era `validateToken` fallback path on the signaling server. Two changes, two repos, one mandatory ordering: (a) musu-pro `/validate` returns the canonical `user_id` alongside `plan` + `node_id` in its 200 response — a **single 3-LOC additive field** at `src/app/api/v1/nodes/validate/route.ts:70`; (b) musu-bee `src/signaling/server.ts:140-151` drops the `_warnedCanonicalIdMissing` fallback that copies `claimedUserId → canonicalUserId` when upstream omits `user_id`. B1's audit-fix M1 (commit `e6e2caf`) closed the **cache-poisoning attack** the fallback enabled, but the fallback itself remains **residual security debt** — a "valid token + null userId" surface that `requireInstallHmac` can never trust. Removing it is what lets the operator flip `MUSU_TELEMETRY_HMAC_ONLY=1` per wiki/364 §"Operational dependencies & rollout". The ordering is **asymmetric**: musu-pro lands and deploys FIRST (additive field is forward-compatible), then ≥5min30s drain wait (CACHE_TTL_MS + DEGRADED_GRACE_MS), then musu-bee fallback removal. Reversed order would 401 every gateway HELLO in production until musu-pro caught up. The musu-bee side also requires a **test-harness rewrite** — five test files share a default `global.fetch = jest.fn().mockResolvedValue({ok:true, status:200})` mock with **no `json()` method**; once the fallback is gone, these tests will fail downstream because `validateToken` will return `userId=null` and reject HELLO. The rewrite is in-scope; treating it as a drive-by tweak underestimates the change.

---

## 2. Design intent

### 2.1 Asymmetric cross-repo ordering

Two repos, two deploys, **one direction**:

| Stage | Repo | Change | Forward-compat? | Reversible? |
|---|---|---|---|---|
| 1 | musu-pro | `+1 field` (`user_id`) in `/validate` 200 body | **YES** — additive; legacy v21 broker at `src/server.ts:53` only reads `response.ok`; current signaling `server.ts:140-151` already prefers `body.user_id` when present and only falls back when missing | YES — `git revert` ships in next Vercel push |
| 2 | drain wait | ≥CACHE_TTL_MS + DEGRADED_GRACE_MS = 5min30s on the single Fly machine | n/a — pure wall clock | n/a |
| 3 | musu-bee | delete fallback at `server.ts:140-151` + warn-once at `:185-194` + test mock fix | **NO** — strictly tightens semantics; requires musu-pro to already be returning `user_id` | YES on feature branch — not pushed to `main` |

Reverse ordering (musu-bee first, musu-pro second) would: every HELLO calls `validateToken` → upstream still v21-era → `response.json()` either throws (no `json()` method on the existing `NextResponse`-shaped responses do exist, but the **body has no `user_id` field**) or yields `body.user_id === undefined` → fallback removed → `canonicalUserId = null` → HELLO rejected with `4003 unauthorized`. Every paid-tier gateway disconnected within one cache window. Unacceptable.

### 2.2 Why now (vs. deferred again)

wiki/364 §"Operational dependencies & rollout" makes the dependency explicit:

> **B2 (musu-pro `/validate` returns canonical `user_id`) must be deployed and live for at least `CACHE_TTL_MS + DEGRADED_GRACE_MS` (~5min30s) before flipping `MUSU_TELEMETRY_HMAC_ONLY=1`** on the signaling deployment.

HMAC_ONLY=1 is the V23.2 Workstream B exit-state for shared-secret telemetry auth. B2 is the gate. Until B2-bee lands and drains, the operator cannot flip the boot-config without risking gateways that hold an `account_key` keyed on a `null`-provenance row.

B1's audit-fix `e6e2caf` already neutralized the **active** attack (`forceRefresh=true` on the bootstrap path bypasses any v21-fallback-poisoned cache entry; route returns 503 Design A). What remains is the **dormant** code path: any future code that reads `validationCache` without `forceRefresh=true` could re-introduce the exposure. The fallback is a latent foot-gun — removing it is defense-in-depth, not defense-in-novelty.

### 2.3 Test-harness rewrite scope

Phase 0 Researcher findings flagged this as HIGH-priority:

- `tests/signaling.test.ts:50-53` default fetch mock: `{ok:true, status:200}` with NO `json()` method.
- After fallback removal, the code path at current `server.ts:140-151` becomes (post-B2):
  ```typescript
  const body = (await response.json()) as { user_id?: unknown };
  if (typeof body.user_id === "string" && body.user_id.length > 0) {
    canonicalUserId = body.user_id;
  } else {
    canonicalUserId = null;   // <-- was: claimedUserId (fallback)
  }
  ```
- Without `json()` on the mock, `await response.json()` throws → caught by the existing `try { ... } catch { ... }` → fallback path → but the fallback path itself is what we're removing. Net result: tests' default fetch mock returns a response that, post-B2, **always yields `userId=null`** → HELLO rejected → every happy-path test that uses `joinAs()` (signaling.test.ts:204-221) fails.

The fix is **one-line per affected test file**: add `json: async () => ({ user_id: "default-canonical-id" })` to the default mock. This rewrite IS in scope. Not optional. Not a drive-by.

Affected test files (inspection-pass complete via Phase 0 Researcher + grep verification at this plan time):

| Test file | Default mock returns json? | Action |
|---|---|---|
| `tests/signaling.test.ts:50-53` | NO | **REWRITE** — add `json: async () => ({ user_id: "default-canonical-id" })` |
| `tests/visitor.test.ts:57-60` | NO | **REWRITE** — same shape |
| `tests/wrtc-handshake.test.ts:56-59` | NO | **REWRITE** — same shape |
| `tests/wrtc-bridge-e2e.test.ts:59-62` | NO | **REWRITE** — same shape |
| `tests/gateway.test.ts:52-55` | NO | **REWRITE** — same shape |
| `tests/spike-local-demo.test.ts:69-72` | NO | **REWRITE** — same shape |
| `tests/telemetry-emit.test.ts:54-57` | NO; also sends HELLO at :136 | **REWRITE** — same shape |
| `tests/validate-token.test.ts` | YES (via `mockFetchOk`/`mockFetch401` helpers at :33-50) | **CONVERT** the v21-compat test at :171-179; keep helpers |
| `tests/issue-install-key.test.ts` | n/a — synthetic validator at :48-50, no `global.fetch` | No change. 503 Design A test at :107-119 stays |
| `tests/issue-install-key-cache-bypass.test.ts` | sets `global.fetch` per-test | **DOC-ONLY**: docstring at :76-80 references "server.ts:140-151 fell back" — update to reference the historical fallback as "(removed in B2, wiki/365)". Test logic stays valid (route-level Design A enforcement is what the test exercises). |

### 2.4 Cross-repo coordination boundary preserved

Per the "제품만 올리라고" rule echoed in wiki/364 §"제품만 올리라고 boundary preserved": B1 was musu-relay-only. **B2 is the ONLY workstream that touches musu-pro.** musu-pro change is the smallest possible — one line, additive, backward-compatible. No musu-pro test infrastructure added (zero baseline, see §6.2).

---

## 3. Wire-protocol change

### 3.1 musu-pro `/validate` 200 response

Before (current production, `src/app/api/v1/nodes/validate/route.ts:69-72`):
```json
{
  "valid": true,
  "plan": "pro",
  "node_id": "<node_id from request or empty string>"
}
```

After (B2):
```json
{
  "valid": true,
  "plan": "pro",
  "node_id": "<node_id from request or empty string>",
  "user_id": "<canonical user_id from account_tokens row>"
}
```

**Field name is `user_id`** (snake_case) — matches `musu-bee/musu-relay/src/signaling/server.ts:141` which already reads `body.user_id`. No casing alignment needed.

**Field type**: `string`, non-empty. Source: `tokenRow.user_id` from `findByAccountToken` (`src/lib/db/repositories/account_tokens.repo.ts:48-67`) — already in scope at `route.ts:30`.

**Backward compatibility**:
- Legacy v21 broker (`musu-bee/musu-relay/src/server.ts:53`): only reads `response.ok`, never parses body. **No impact.**
- V23.2 signaling pre-B2-bee (`server.ts:140-151`): already prefers `body.user_id` when present (line 142: `if (typeof body.user_id === "string" && body.user_id.length > 0) { canonicalUserId = body.user_id; }`). **Field is honored immediately upon musu-pro deploy.**
- Any third-party consumer of `/validate`: receives an extra ignored field. JSON additive change, no breakage.

### 3.2 musu-bee `validateToken` semantic change

Before (current, `src/signaling/server.ts:136-151`):
```typescript
if (valid) {
  try {
    const body = (await response.json()) as { user_id?: unknown };
    if (typeof body.user_id === "string" && body.user_id.length > 0) {
      canonicalUserId = body.user_id;
    } else {
      warnOnceCanonicalIdMissing();
      canonicalUserId = claimedUserId;   // <-- v21 fallback
    }
  } catch {
    warnOnceCanonicalIdMissing();
    canonicalUserId = claimedUserId;     // <-- v21 fallback
  }
}
```

After (B2-bee):
```typescript
if (valid) {
  try {
    const body = (await response.json()) as { user_id?: unknown };
    if (typeof body.user_id === "string" && body.user_id.length > 0) {
      canonicalUserId = body.user_id;
    } else {
      canonicalUserId = null;            // <-- strict
    }
  } catch {
    canonicalUserId = null;              // <-- strict
  }
}
```

Downstream effect at HELLO handler (`server.ts:428-432`): existing check `if (!result.valid || !result.userId)` already rejects `userId=null` with `4003 unauthorized`. **No HELLO-handler change needed** — the existing guard becomes load-bearing instead of belt-and-suspenders.

---

## 4. File-by-file changes

### 4.1 musu-pro (`F:\Aisaak\Projects\musu-pro`)

| File | Lines | Change |
|---|---|---|
| `src/app/api/v1/nodes/validate/route.ts:70` | 1 line edited | `{ valid: true, plan: "pro", node_id: node_id || "" }` → `{ valid: true, plan: "pro", node_id: node_id || "", user_id: tokenRow.user_id }` |
| `src/app/api/v1/nodes/validate/route.ts:13-15` (docstring) | 3 lines edited | Update the JSDoc `Returns:` block to include `user_id` in the 200 example |

**Total LOC**: 3 (1 functional, 2 doc; or 1 if doc update is skipped — Builder's call).

**No new file. No new dependency. No test added** (see §6.2).

### 4.2 musu-bee (`F:\workspace\musu-bee\musu-relay`)

| File | Lines | Change |
|---|---|---|
| `src/signaling/server.ts:140-151` | ~12 lines deleted/simplified | Remove `warnOnceCanonicalIdMissing()` calls and `claimedUserId` fallback assignments in both the success-with-body and catch branches; replace with `canonicalUserId = null` in both branches |
| `src/signaling/server.ts:185-194` | ~10 lines deleted | Delete `_warnedCanonicalIdMissing` flag declaration and `warnOnceCanonicalIdMissing()` function entirely |
| `src/signaling/server.ts:542` | 1 line deleted | Remove `_warnedCanonicalIdMissing = false;` from `_resetAuthState()` (test helper reset) |
| `src/signaling/server.ts:77-97` (docstring on `ValidationResult`) | ~8 lines edited | Update the JSDoc reference to "v21-era musu.pro behavior" and "Production deploy of V23.2 signaling REQUIRES" — convert to past tense / "REMOVED in B2 (wiki/365); musu.pro now returns `user_id` canonically" |
| `src/signaling/server.ts:333-372` (telemetry adapter comment) | ~30 lines edited | The Auditor A M1 commentary at :340-358 references "v21-era upstream" and "fresh response has no user_id field" — update to note that with B2-bee landed, this is no longer the live failure mode; the comment becomes historical context. `forceRefresh=true` stays (still load-bearing defense-in-depth — see §11 OoS). Test at `issue-install-key-cache-bypass.test.ts` still passes because the test synthesizes the v21 shape directly via fetch mock. |
| `tests/signaling.test.ts:50-53` | 4 lines | Add `json: async () => ({ user_id: "default-canonical-id" })` to the default `beforeEach` mock |
| `tests/visitor.test.ts:57-60` | 4 lines | Same |
| `tests/wrtc-handshake.test.ts:56-59` | 4 lines | Same |
| `tests/wrtc-bridge-e2e.test.ts:59-62` | 4 lines | Same |
| `tests/gateway.test.ts:52-55` | 4 lines | Same |
| `tests/spike-local-demo.test.ts:69-72` | 4 lines | Same |
| `tests/telemetry-emit.test.ts:54-57` | 4 lines | Same (uses HELLO at :136) |
| `tests/validate-token.test.ts:171-179` | 9 lines | **CONVERT** the v21-compat test: rename to `"rejects (userId=null) when validation API omits user_id (post-B2)"`; change `expect(r.userId).toBe("claimed-id")` to `expect(r.userId).toBeNull()`; remove the comment about "tolerates this with a one-time warning". `r.valid` stays `true` because upstream returned 200 — but `userId=null` causes HELLO to be rejected at `server.ts:429`. |
| `tests/validate-token.test.ts` (new test) | ~12 lines | **ADD** negative test: `"HELLO is rejected when upstream returns valid+empty-user_id"` — sets up a fresh `mockFetchOk()` (no canonicalUserId), calls `validateToken()`, asserts `r.valid === true && r.userId === null`, then verifies the rejection path at the integration level (see §6.1). |
| `tests/issue-install-key-cache-bypass.test.ts:76-80` | comment block | Update docstring `"server.ts:140-151 fell back to the HELLO-supplied claim"` → `"server.ts:140-151 (PRE-B2) fell back to the HELLO-supplied claim; removed in B2 wiki/365. This test continues to exercise the route-level Design A enforcement which is independent of the fallback's existence — the attacker now primes the cache directly via _validationCache.set rather than via the fallback path."`. No test logic change. |

### 4.3 Legacy v21 broker — NO CHANGE

`musu-relay/src/server.ts:53` calls `/validate` but only reads `response.ok`. The additive `user_id` field is silently ignored. **No code change needed.** Builder may add a one-line comment `// V23.2 B2 (wiki/365): /validate now returns user_id; legacy broker ignores it (response.ok-only).` at line 52 if it improves future readability. Not required.

---

## 5. Routes added/changed

| Route | Before | After |
|---|---|---|
| `POST /api/v1/nodes/validate` (musu-pro) | 200 body `{valid, plan, node_id}` | 200 body `{valid, plan, node_id, user_id}` |
| WS `/signaling` HELLO (musu-bee) | accepts HELLO when upstream `/validate` returns 200 with no `user_id` (fallback to claimed) | rejects HELLO with `4003 unauthorized` when upstream `/validate` returns 200 with no `user_id` (strict) |
| `POST /v1/telemetry/issue_install_key` (musu-bee) | 503 Design A when `validateToken` yields `userId=null` (B1, wiki/363 §2.4) | **unchanged** — Design A check stays load-bearing; just no longer the workaround for v21-era fallback nullification (B1 `forceRefresh=true` already neutralized that attack vector, B2 eliminates the dormant code path) |

---

## 6. Test plan

### 6.1 musu-bee tests

**Goal**: 177 tests (post-B1 baseline) stay green after both code changes (server.ts deletions + test-mock updates). Net delta: 0 to +1 test (the new negative test).

**Test inventory after B2-bee**:

- `signaling.test.ts` — all happy-path HELLO tests (T1.2 :151-193, T1.4 :225-340) pass because the default mock now returns a parseable `{user_id: "default-canonical-id"}`. The two-peer same-userId tests pass because `joinAs(userId, role)` uses per-userId tokens; the mock returns the SAME `"default-canonical-id"` for both, which is actually correct: same-token → same-canonical-id → same room. Tests that want isolation (different userIds) use different tokens, but the mock still returns `"default-canonical-id"` — **THIS IS A PROBLEM** for the T1.4 isolation tests if they rely on canonical id being equal to claimed id.

  **Mitigation**: the mock should return a canonical id derived from the `token` field of the request, OR keep returning a constant and rely on the fact that `joinAs(userId, role, token=`tok-for-${userId}`)` already uses per-userId tokens — meaning two distinct tokens both resolve to `"default-canonical-id"` and end up in the SAME room. This breaks T1.4 isolation tests.

  **Resolution (Builder action) — Critic HIGH #1 resolved to Option A (pass-through)**: make the default mock echo the claimed user_id as canonical:
  ```typescript
  global.fetch = jest.fn().mockImplementation(async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({ user_id: body.user_id || "default-canonical-id" }),
    };
  });
  ```
  Why Option A (not the originally-considered `canon-${claimed}` derived form): tests at `signaling.test.ts:262-263` use literal `rooms.get("alice")` / `rooms.get("bob")` assertions. A derived canonical id (`canon-alice`) would change the `rooms` map keys and require patching every isolation assertion across the suite. Pass-through preserves canonical === claimed for all existing tests; the post-B2 production reality (canonical comes from authenticated DB lookup, possibly ≠ claimed) is still exercised by the new HELLO-rejection negative test (§4.2 row) and by existing `validate-token.test.ts` cases that explicitly set `canonicalUserId` via `mockFetchOk({canonicalUserId: ...})`.

  **Caveat**: the assertions for "canonical userId mismatch warning" at server.ts:438-443 are observation-only (not tested in signaling.test.ts). Verified by Grep on `canonical` / `mismatch` / `rooms.get(` in tests/.

- `visitor.test.ts`, `wrtc-handshake.test.ts`, `wrtc-bridge-e2e.test.ts`, `gateway.test.ts`, `spike-local-demo.test.ts`, `telemetry-emit.test.ts` — apply the same `mockImplementation` pattern (or a simpler `{user_id: "test-user"}` constant if the test doesn't multiplex multiple userIds). Builder's per-file call.

- `validate-token.test.ts`:
  - Existing T2.AUTH.3 tests at :148-168 already use `mockFetchOk({canonicalUserId: ...})` — **no change**.
  - The v21-compat test at :171-179 → **CONVERT** to "rejects (userId=null) when validation API omits user_id (post-B2)" (see §4.2 row).
  - **NEW test**: "HELLO is rejected when upstream returns valid+empty-user_id" — integration-level. Spawn the signaling server in `beforeAll`, mock fetch to return `{ok:true, status:200, json: async () => ({})}` (no user_id), connect a WS, send HELLO, assert `ERROR { reason: /invalid token/ }` + close code `4003`.

  Per `tests/signaling.test.ts:31-39` the harness already supports this; the new test belongs in `signaling.test.ts` not `validate-token.test.ts` because the latter is unit-level on the function itself.

- `issue-install-key.test.ts` — synthetic validator at :48-50, no fetch mock involved. 503 Design A test at :107-119 stays load-bearing post-B2 (operator-incident defense: if a future musu-pro deploy regression drops `user_id`, the route still 503s).

- `issue-install-key-cache-bypass.test.ts` — docstring-only update at :76-80 (see §4.2). All three tests pass — the cache-poisoning closure is independent of the fallback's existence.

**Suite count post-B2-bee**: 177 → 178 (one new negative test in `signaling.test.ts`).

### 6.2 musu-pro tests

**No npm test runner deps** (verified: `package.json` has `dev`/`build`/`start`/`lint` only; no `jest`/`vitest`/`@testing-library` deps). One orphan `node:test` file exists at `src/app/api/public-config/route.test.ts` using Node's built-in test module, but it is not wired into a CI script. Bootstrapping a real CI test for `/validate`'s 1-LOC change is out-of-scope — and would itself need its own plan-mode pass for framework selection, fixtures, Supabase service-client mocking strategy, and CI wiring. Manual curl smoke is sufficient evidence. (Critic MEDIUM #3 wording fix.)

**Replacement**: manual `curl` smoke test post-deploy.

```bash
# Pre-requisite: operator has a valid test tunnel token for a paid-tier
# account. Use the same token currently used for spike-demo or any
# musu-bee integration test fixture.

curl -X POST https://musu.pro/api/v1/nodes/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"<real-test-token>","node_id":"smoke-test"}' \
  | jq .
```

**Expected**:
```json
{
  "valid": true,
  "plan": "pro",
  "node_id": "smoke-test",
  "user_id": "<26-char ULID-shaped string>"
}
```

**Pass criteria**: `.user_id` field exists; value is a non-empty string; existing fields `.valid`, `.plan`, `.node_id` unchanged. If `.user_id` is missing or empty, **do not proceed to Stage 2** of the rollout (§7).

**Negative smoke (optional)**:
```bash
curl -X POST https://musu.pro/api/v1/nodes/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"invalid-token"}' \
  | jq .
# expect: {"valid":false,"error":"invalid_token"} with HTTP 401
```

Both smoke tests are Const VII gate evidence (see §8). Operator runs them; orchestrator records the output (jq-extracted) in the closure doc.

---

## 7. Rollout runbook

Three stages, strict sequencing, drain wait between stages 1 and 2.

### Stage 1 — musu-pro deploy (T+0)

0. **Pre-Stage operator check (Critic HIGH #2 resolution)**: operator opens Vercel dashboard → Project Settings → Git, and confirms **Production Branch is `main`**. `.vercel/project.json` contains only `projectId`/`orgId`/`projectName` and does NOT encode the production branch — this can ONLY be verified from the dashboard. If production branch is NOT `main`, halt: push to `main` would create a Preview deployment, not a production deploy, and the smoke curl against `https://musu.pro/...` would hit stale code. Operator records the verification outcome (`yes/no`) as Const VII gate #1 evidence.
1. Operator confirms `F:\Aisaak\Projects\musu-pro` is on `main`, working tree clean (verified at plan time: yes).
2. Builder commits the 3-LOC route.ts change. Suggested commit: `feat(api): /validate returns user_id alongside plan + node_id` (matches musu-pro convention from `git log --oneline -10`: lowercase verb, scope in parens, no period).
3. **Const VII gate #1** (see §8) — operator approves with `진행해` before push. Gate prompt must include the Vercel-branch verification outcome from step 0.
4. Operator runs `git push origin main`. Vercel auto-deploys IF production branch is `main` (verified in step 0).
5. Operator monitors Vercel dashboard for deploy success (typical Next.js 16.2.4 build: 60-120s).
5.5. **Pre-smoke health gate (Critic MEDIUM #2)**: operator runs `curl -fsS https://musu.pro/api/v1/health` and confirms 200 response. Poll every 5s if needed; if >3min elapsed without 200, halt and investigate (production edge cache may still be propagating, or deploy didn't promote).
6. Operator runs the §6.2 curl smoke. If `.user_id` is non-empty string → **proceed to Stage 2**. Otherwise: rollback (`git revert HEAD` + push) and re-investigate; do NOT advance.

### Stage 2 — drain wait (T+0 to T+5min30s)

- Wall-clock wait of ≥ `CACHE_TTL_MS + DEGRADED_GRACE_MS` = 30s + 5min = **5min30s**.
- Purpose: during this window, the musu-bee signaling Fly machine's `validationCache` drains any pre-musu-pro-deploy entries that held `canonicalUserId = claimedUserId` (v21-era fallback provenance). After the drain, every cache entry either (a) was created post-musu-pro-deploy and holds the real canonical id, or (b) expired and will repopulate fresh on next use.
- **Fly auto-scaling caveat** (Phase 0 OQ): `fly.toml:23-26` sets `auto_stop_machines = "off"` + `min_machines_running = 1`. There is **one machine**. No cross-machine drain ambiguity. If the Fly config ever changes to multi-machine, each machine has its own 5min30s cache and the wall-clock drain stays the same — but the operator should re-verify via `fly status` that no machine has been started post-musu-pro-deploy and immediately served stale-cached HELLOs that survived `cache.set(... timestamp: Date.now())` after the deploy edge. With single-machine: not a concern.
- During this window, operator may continue staging the B2-bee commits locally on `v22/gap-analysis`. Do NOT push.

### Stage 3 — musu-bee push (T+5min30s+)

1. Operator confirms wall clock has advanced ≥5min30s past the musu-pro deploy success timestamp.
2. Operator confirms musu-bee `v22/gap-analysis` working tree contains the staged B2-bee commits (see §10).
3. **Const VII gate #2** (see §8) — operator approves with `진행해` before push.
4. Operator runs `git push origin v22/gap-analysis`. **No fly deploy** triggered by this push — Fly deploys are operator-manual via `fly deploy` (verified: `fly.toml:5-14` documents the provisioning checklist explicitly; no GitHub Actions wired to push events in the musu-bee repo per `git log` of `.github/`).
5. Post-push verification: `git log -5 v22/gap-analysis` shows the B2-bee commits at HEAD. Suite green via `npm test` locally.
6. **Operator decision (NOT B2 scope)**: at some later wall-clock-arbitrary moment, operator can `fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1` + `fly secrets unset MUSU_TELEMETRY_SHARED_SECRET` + `fly deploy` to complete the V23.2 Workstream B exit-state. This is the cutover described in wiki/364 §"Operational dependencies & rollout". **B2 plan is complete the moment B2-bee is pushed.** HMAC_ONLY flip timing is the operator's call.

### Verification post-B2

- Signaling logs (`fly logs`) show **zero** `[signaling] validation API did not return user_id` warnings on any post-deploy interval (the warn-once code is deleted).
- `/validate` curl with a real token returns `user_id`.
- Test suite: 178/178 green (177 baseline + 1 new HELLO-rejection negative test).
- `grep -r "_warnedCanonicalIdMissing" musu-relay/src/ musu-relay/tests/` returns zero matches.

### Rollback paths

| Stage failed | Symptom | Rollback |
|---|---|---|
| Stage 1 | Vercel build fails | `git revert HEAD && git push` on musu-pro `main`. No drain wait needed; back to pre-B2 state. |
| Stage 1 smoke fails | `.user_id` missing in response | Same as above. Investigate why `tokenRow.user_id` is null (would mean the `account_tokens` row has a null user_id, which is a schema bug elsewhere). |
| Stage 3 | Tests fail post-mock-rewrite | Fix the mock rewrite. Do NOT push the partial state. musu-pro deploy can safely sit in production indefinitely; the additive field is dormant on the bee side. |
| Stage 3 push completes but HELLO regresses in prod | Mass-disconnect of gateways | `git revert <B2-bee-commit-range> && git push origin v22/gap-analysis`. Note: musu-bee feature-branch push does NOT trigger Fly deploy; the running Fly machine still runs the pre-B2-bee code. So this "regression" can only manifest post-`fly deploy`, which is a separate operator action. **Therefore: post-B2-bee-push but pre-`fly deploy`, the prod signaling is still on B1 code and unaffected.** This is a nice property of the deployment model. |

---

## 8. Constitution gates

Per master plan §"Constitution gates" and wiki/364 §"Operational dependencies & rollout":

| Gate | Applies? | Why |
|---|---|---|
| **Const III** (schema migration) | NO | B2 has zero schema change in either repo. musu-pro `account_tokens.user_id` column already exists; musu-bee has no DB DDL touched. |
| **Const VI** (30% experiment gate) | NO | Not an experimental rollout. |
| **Const VII** (push approval) | **YES — TWO instances** | See below. |

### Const VII gate #1 — musu-pro deploy

**When**: after Builder commits the 3-LOC change to musu-pro `src/app/api/v1/nodes/validate/route.ts`, before `git push origin main` on the musu-pro repo.

**Prompt (orchestrator emits)**:
> Const VII gate: B2-pro is ready to merge to musu-pro `main`. This will auto-deploy to Vercel (production: musu.pro) IF the Vercel dashboard's Project Settings → Git → Production Branch is set to `main`. **Operator must confirm Vercel production-branch = `main`** before approving (Critic HIGH #2; not encoded in repo state). Post-deploy verification: `curl -fsS https://musu.pro/api/v1/health` returns 200, then `curl -X POST https://musu.pro/api/v1/nodes/validate -d '{"token":"<test>"}' | jq .user_id` must return non-empty string. The change adds `user_id` to the `/validate` 200 response (additive, backward-compatible — legacy v21 broker reads only `response.ok`; current V23.2 signaling already prefers `body.user_id` when present). Approve push? `진행해 / no`. Required evidence: Vercel-branch-verified=yes; record in closure doc.

### Const VII gate #2 — musu-bee push

**When**: after Stage 2 drain wait (≥5min30s past musu-pro deploy), before `git push origin v22/gap-analysis` on musu-bee.

**Prompt (orchestrator emits)**:
> Const VII gate: B2-bee is ready to push to `v22/gap-analysis`. This pushes 2 commits (or 1 combined) removing the `validateToken` v21-era fallback at `src/signaling/server.ts:140-151` plus the warn-once machinery, and updates 7 test files' default `global.fetch` mocks. Push does NOT auto-deploy Fly; running prod signaling is unaffected until a separate operator `fly deploy`. Drain wait verified: musu-pro `/validate` returned `user_id` at <timestamp>; wall clock has advanced ≥5min30s. Approve push? `진행해 / no`

**Do NOT merge gate #1 and gate #2 into one approval.** They guard different repos at different wall-clock moments and have different rollback implications. Operator must see both.

### Const VII on `main`-merge

Out of scope for this plan. Per master plan §"Constitution gates": "main-branch merge of any V23.2 work requires explicit 진행해. Cross-repo push to musu-pro is its own Const VII gate." The musu-pro push IS to `main` and is gated by Gate #1; the musu-bee push is to `v22/gap-analysis` (feature branch); main-merge of `v22/gap-analysis` is a downstream V23.2 Workstream B final-closure concern, not B2.

---

## 9. Acceptance criteria

Mirroring master plan §B2 acceptance, with concrete file:line evidence requirements:

### musu-pro side

- [ ] `src/app/api/v1/nodes/validate/route.ts:70` (or equivalent line after edit) includes `user_id: tokenRow.user_id` in the 200 NextResponse body
- [ ] `curl -X POST https://musu.pro/api/v1/nodes/validate -d '{"token":"<real-test-token>","node_id":"smoke"}' | jq .user_id` returns a non-empty string
- [ ] `curl -X POST https://musu.pro/api/v1/nodes/validate -d '{"token":"invalid"}'` still returns `{valid:false, error:"invalid_token"}` (negative regression check)
- [ ] Vercel deploy succeeds (build passes; no new TypeScript or ESLint errors)
- [ ] Legacy v21 broker still works (no `response.ok` regression — best validated post-deploy by confirming an existing relay client still validates; out-of-band check by operator)

### musu-bee side

- [ ] `grep -r "_warnedCanonicalIdMissing" musu-relay/src/ musu-relay/tests/` returns zero matches
- [ ] `grep -rn "claimedUserId" musu-relay/src/signaling/server.ts` returns only the function parameter at `validateToken(...)` and the existing HELLO mismatch warning at the original `:438-443` block — no fallback-assignment occurrences in the `if (valid) { ... }` block at `:136-152`
- [ ] `validateToken(token, claimedUserId)` returns `{valid:true, userId:null}` when upstream returns 200 with no `user_id` (covered by the converted test at `validate-token.test.ts:171-179`)
- [ ] HELLO is rejected with `4003 unauthorized` when `validateToken` returns `userId=null` (covered by new test in `signaling.test.ts`; the existing handler at `server.ts:429-432` is the load-bearing code path)
- [ ] Full test suite green: 177 → 178 (the new negative test). `npm test` returns 178/178 passing
- [ ] `tsc --noEmit` clean
- [ ] No new HIGH or MEDIUM Critic findings unaddressed before Builder starts (this plan's purpose)

### Cross-repo

- [ ] musu-pro deploy timestamp precedes musu-bee push timestamp by ≥5min30s wall-clock
- [ ] Operator-recorded curl smoke output captured in the closure doc (wiki/366 once written) as Stage 1 evidence
- [ ] **Vercel production-branch verified `main` in dashboard before Stage 1 push** (Critic HIGH #2)
- [ ] **`fly status --app musu-signaling` shows exactly one machine running, at the moment of Stage 2 wait start** (Critic INFO #3 promoted). Output captured in closure doc.
- [ ] **`curl -fsS https://musu.pro/api/v1/health` returns 200 before the validate smoke curl** (Critic MEDIUM #2)

---

## 10. Recommended commit order

Two commit plans, depending on the side.

### musu-pro side (single commit)

```
feat(api): /validate returns user_id alongside plan + node_id

Single 3-LOC additive change to the validate route — surfaces the
canonical user_id already retrieved by findByAccountToken into the
200 success body. Backward-compatible (legacy v21 broker reads
response.ok only; current V23.2 signaling already prefers body.user_id
when present).

Required by V23.2 Workstream B2 (musu-bee wiki/365) to remove the
v21-era fallback path in signaling/server.ts that copies the
HELLO-claimed user_id when upstream omits the canonical one.

Per wiki/364, must be deployed ≥CACHE_TTL_MS + DEGRADED_GRACE_MS
(~5min30s) before musu-bee B2-bee push.
```

Branch: `main` (musu-pro convention). No feature branch.

### musu-bee side (2 commits OR 1 combined — Builder's call)

**Option A — 2 commits (recommended for narratability under dual-audit precedent set by B1; Critic MEDIUM #1 aligned to B1 ledger style)**:

```
V23.2 B2 commit 1/2: remove validateToken v21-era fallback (wiki/365)

Drops the {claimedUserId → canonicalUserId} fallback at
src/signaling/server.ts:140-151 and the _warnedCanonicalIdMissing
warn-once machinery at :185-194 + :542. Post-B2-pro, musu.pro
/validate returns canonical user_id in every 200 response (wiki/365
§3.1), so the fallback is unreachable code AND a latent foot-gun
for any future code path that reads validationCache without
forceRefresh=true.

This is defense-in-depth on top of B1 audit-fix e6e2caf, which
already neutralized the active cache-poisoning attack via
forceRefresh=true on the /issue_install_key adapter.

HELLO handler at server.ts:429-432 already rejects userId=null with
4003; that guard becomes load-bearing instead of belt-and-suspenders.

Test impact: zero compile errors; one v21-compat test in
validate-token.test.ts:171-179 begins to fail (covered by commit 2).
Refs: wiki/364 §"Operational dependencies & rollout"; wiki/365.
```

```
V23.2 B2 commit 2/2: update test fixtures + add HELLO-rejection negative (wiki/365)

Seven test files (signaling, visitor, wrtc-handshake, wrtc-bridge-e2e,
gateway, spike-local-demo, telemetry-emit) share a default
global.fetch mock returning {ok:true, status:200} with no json()
method. Pre-B2 the fallback path tolerated this and returned
userId=claimedUserId; post-B2 (commit 1) the strict path returns
userId=null which fails HELLO. Mock updated to return a token-aware
{user_id: `canon-${body.user_id||"default"}`} so existing per-userId
room isolation tests retain their semantics.

validate-token.test.ts:171-179 converted from "v21 compat: falls
back to claimed userId" to "post-B2: rejects (userId=null) when
upstream omits user_id".

New negative test added in signaling.test.ts: "HELLO is rejected
when upstream returns valid+empty-user_id" — locks the post-B2
behavior at the integration boundary.

issue-install-key-cache-bypass.test.ts docstring updated to mark
the v21 fallback reference as historical (removed in B2); test
logic unchanged (route-level Design A enforcement is independent
of the fallback's existence).

Suite count: 177 → 178. tsc --noEmit clean.
```

**Option B — 1 combined commit**: same content, single message. Acceptable; trades commit-ledger granularity for diff size. Builder's call based on Critic feedback on diff narratability.

Branch: `v22/gap-analysis` (existing — continues B1's ledger).

---

## 11. Out of scope (explicit)

Per wiki/364 §"What B1 does NOT do" precedent format:

- **HMAC_ONLY=1 cutover** — operator's `fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1` + `fly deploy`. Downstream of B2-bee push. **Not B2.** (Master plan §B2 implicit; wiki/364 §"Operational dependencies & rollout" explicit.)
- **Removing the `forceRefresh=true` from the `/v1/telemetry` adapter** at `server.ts:366` — stays as defense-in-depth even though B2 closes the attack vector it was originally added to defend. Removing it is a follow-on B1.x candidate, not B2. (The cache-bypass behavior is independently useful: any future cache invalidation bug is contained at the bootstrap path.)
- **Rotation route path** (`X-Musu-Rotate: 1`) — B1.x follow-on per wiki/364.
- **File persistence of `accountKey`** — B4b per wiki/363 Critic HIGH #1 + wiki/364 §"Follow-on tickets".
- **Summary endpoint auth** (`GET /v1/telemetry/summary`) — B3 workstream.
- **Image trim** (`tsconfig.docker.json`) — B5 workstream.
- **musu-pro test framework bootstrapping** — over-scoped for a 1-LOC change; defer to whenever musu-pro grows non-trivial server-side logic that warrants test infra.
- **Any musu-pro change beyond the +1 field** — explicitly. No docstring rewrites in unrelated routes, no `tokenRow.last_used_at` audit, no plan-check refactoring.
- **musu-pro `/validate` schema documentation** — there is no OpenAPI / schema doc file in musu-pro (verified via `ls F:/Aisaak/Projects/musu-pro/`); the JSDoc comment at `route.ts:5-16` IS the schema doc, and updating that is in §4.1 scope.
- **Envelope encryption for `account_key`** — B3 / V23.3 per wiki/364 AR-1.
- **HELLO mismatch hardening** — the warning at `server.ts:438-443` stays observation-only; no rejection on claimed≠canonical. Out-of-scope hardening for a future workstream.

---

## 12. Open questions / Critic-bait

Surfacing for Critic adversarial review (system-architect recommended; see §13):

1. **Asymmetric ordering failure-mode**: if musu-pro Vercel deploy succeeds but smoke curl fails (e.g., `.user_id` is empty string for one specific test token because of a stale `account_tokens` row), what's the rollback policy? Plan says "rollback musu-pro; do NOT advance". But: the Vercel deploy is live; some other consumer might already be reading the new field. Is that any-consumer-other-than-musu-bee a concern? **Critic verdict: confirm rollback path is clean.**

2. **Drain wait sufficiency**: 5min30s is `CACHE_TTL_MS + DEGRADED_GRACE_MS`. Are there code paths that hold cache entries longer than this? Specifically: `degradedGrace()` at `server.ts:202-226` re-reads the cache but does NOT extend `entry.timestamp`. So a cache entry's effective max lifetime is the original 5min30s window from creation. **Confirmed safe; Critic should verify.**

3. **Fly auto-scaling re-emergence**: `fly.toml:23` says `auto_stop_machines = "off"` and `:26` says `min_machines_running = 1`. Plan assumes one machine. If `fly scale count 2` is ever run, each machine has independent cache state and the drain wall clock applies per-machine — wall-clock-uniform, so still 5min30s, but the operator should verify scale count is 1 at the moment of musu-pro deploy. **Critic: should this be an explicit acceptance criterion in §9?**

4. **Test-harness rewrite scope**: §6.1 lists 7 test files needing the default fetch-mock update. Did the inspection pass miss any? Specifically: are there tests that mock fetch at a different scope (test-local instead of `beforeEach`) that send HELLO? Phase 0 Researcher findings list the 7 files; this plan confirms via Grep. **Critic: spot-check `wrtc-handshake.test.ts` and `wrtc-bridge-e2e.test.ts` since they're not in the Phase 0 deep-dive evidence.**

5. **`canon-${claimed}` mock pattern**: §6.1 mitigation uses a derived canonical id (`canon-user1`) instead of a constant. This is fine for room-isolation tests but introduces a new mock-pattern that future test authors will need to know about. Alternative: use the request body's `token` field instead (`canon-${body.token}`). Both work; token-derived is more aligned with the cache-key model (cache is keyed on token, per `server.ts:104`). **Critic: prefer token-derived or user_id-derived?**

6. **`issue-install-key-cache-bypass.test.ts:75-124` docstring-only update**: the test itself remains valid because it primes the cache via `_validationCache.set` directly, not via the fallback. But the test's *narrative* (attack via WS HELLO populating cache) is no longer reachable post-B2-bee. Is the test still semantically meaningful? **Answer: yes** — it still defends the route against any cache-poisoning vector regardless of provenance (HMAC_ONLY-era operational mistakes, future bugs in `validateToken`'s caching logic). Defense-in-depth survives. **Critic: confirm.**

7. **No musu-pro test**: §6.2 punts test coverage to a manual curl. For a 1-LOC change to a route that already has zero tests, the marginal value of bootstrapping a test framework is low. **Critic: is curl-smoke + operator visibility sufficient for Const VII gate evidence?**

8. **`forceRefresh=true` post-B2 redundancy**: now that B2-bee removes the fallback, `forceRefresh=true` on the `/v1/telemetry` adapter at `server.ts:366` arguably becomes redundant defense — there's no v21-era code path for fallback poisoning. But removing it is explicitly out-of-scope (§11). Should the plan note this as a follow-on B1.x candidate, or is "stays as defense-in-depth" the final answer? **Critic: confirm this is final.**

---

## 13. Critic prep

**Recommended Critic agent**: `system-architect` (NOT `security-engineer`).

**Rationale**: the security surface is **closing**, not opening. B2 deletes a tolerated-fallback path that exists to bridge a deploy ordering. The interesting risks are cross-repo coordination, deploy ordering, and rollback paths — all in `system-architect`'s wheelhouse. `security-engineer` would have less to say; the only auth-relevant change is "strict-instead-of-tolerant", which a security engineer would unconditionally rubber-stamp.

**Critic should specifically attack**:

a. **Asymmetric ordering failure-mode (§12 #1)**: what if musu-pro deploy succeeds but goes brown halfway? Is there a half-deployed Vercel state where some edge regions return the new field and some return the old? Vercel's atomic deploy guarantees say no, but the Critic should verify the claim doesn't rest on an assumption.

b. **Drain window adequacy (§12 #2 + #3)**: is 5min30s the actually-correct number? What about cache entries created exactly at musu-pro deploy completion that have full TTL ahead of them — are they v21-provenance or B2-provenance? (Answer: B2-provenance, because the upstream call happens at cache-miss time and returns the new field. Critic verifies.)

c. **Test-harness rewrite scope completeness (§12 #4)**: did the planner miss a test? Are there integration tests or e2e tests outside `tests/` that exercise the validation path? (Plan asserts: no — `tests/` is the only test root, verified via Grep.)

d. **musu-pro deploy mechanism documentation gap (§12 #7)**: the plan documents Vercel auto-deploy as inferred from `.vercel/project.json`. Is that sufficient? Or does the plan need to call out the operator's pre-deploy checklist (e.g., "verify Vercel build hooks are active; verify production branch in Vercel project settings is `main`")? Critic adjudicates.

e. **Single-commit vs split-commit B2-bee (§10)**: is the 2-commit split valuable for audit narratability, or does it artificially fracture a single logical change? Builder will follow whichever Critic prefers.

f. **`canon-${claimed}` mock pattern impact (§12 #5)**: does this introduce mock-fixture drift versus the actual upstream-returned shape?

---

## 14. References

- wiki/361 — V23.2 Workstream B master plan (§B2, §"Sequencing + dependencies", §"Workflow per sub-workstream")
- wiki/363 — V23.2 Workstream B1 detail plan (format reference; §1 ordering flip; §"Critic Findings (resolved)" table format)
- wiki/364 — V23.2 Workstream B1 closure (§"Operational dependencies & rollout" pins B2 dependency; §"What B1 does NOT do" precedent; §"Audit-fix commit detail" describes the cache-poisoning attack B1 closed)
- wiki/362 — V23.2 B0 closure (deployment validation baseline)
- wiki/360 — V23.2 Workstream B prep (predecessor; superseded by wiki/361)
- wiki/359 — V23.2 A2 qualitative evaluation (predecessor)
- Phase 0 Researcher transcript: deep-research-agent pass (this session)
- Phase 0 Explore transcript: Explore agent pass (this session)

**Cross-repo files referenced**:
- `F:\workspace\musu-bee\musu-relay\src\signaling\server.ts` — lines 99-194, 366, 428-432, 542 (musu-bee)
- `F:\workspace\musu-bee\musu-relay\src\server.ts:53` — legacy v21 broker (musu-bee; no change)
- `F:\workspace\musu-bee\musu-relay\fly.toml:23-26` — Fly auto-scaling config (single machine)
- `F:\Aisaak\Projects\musu-pro\src\app\api\v1\nodes\validate\route.ts:70` — musu-pro target line
- `F:\Aisaak\Projects\musu-pro\src\lib\db\repositories\account_tokens.repo.ts:61` — `tokenRow.user_id` source
- `F:\Aisaak\Projects\musu-pro\.vercel\project.json` — Vercel deploy mechanism evidence
- `F:\Aisaak\Projects\musu-pro\package.json` — confirms zero test infrastructure

---

## 15. Critic Findings (resolved)

`system-architect` Critic pass adversarial review of this plan. Verdict: **plan-quality high; ship to Builder after HIGH #1 and HIGH #2 patches landed inline (this section, plus §6.1, §7 Stage 1, §8, §9, §10).**

| # | Severity | Finding (1-line) | Resolution | Where patched |
|---|---|---|---|---|
| H1 | **HIGH** | `canon-${body.user_id}` mock pattern breaks `signaling.test.ts:262-263` `rooms.get("alice")`/`rooms.get("bob")` isolation asserts | Option A pass-through mock: `json: () => ({user_id: body.user_id \|\| "default-canonical-id"})`. Preserves canonical === claimed for all existing tests; post-B2 semantic where canonical ≠ claimed is still exercised by the new HELLO-rejection negative test and existing `mockFetchOk({canonicalUserId: ...})` cases. | §6.1 mitigation block rewritten |
| H2 | **HIGH** | `.vercel/project.json` does NOT encode production branch; "Vercel auto-deploy on push to main" claim is unverifiable from repo state — push could land a Preview deploy and smoke would hit stale code | Add Pre-Stage-1 operator check: confirm Vercel dashboard → Project Settings → Git → Production Branch = `main`. Const VII gate #1 prompt records the verification outcome as evidence. | §7 Stage 1 step 0 (new); §8 gate #1 prompt updated; §9 cross-repo AC added |
| M1 | MEDIUM | Commit message convention `V23.2 B2-bee/1:` drifts from B1 ledger style `V23.2 B1 commit N/6:` | Align to B1 style: `V23.2 B2 commit 1/2: <subject> (wiki/365)` and `V23.2 B2 commit 2/2: ...` | §10 musu-bee commit messages updated |
| M2 | MEDIUM | No `/api/v1/health` pre-smoke gate — Vercel "deploy success" can be a Preview or production-mid-propagation; smoke might hit stale POP | Insert step 5.5 between Vercel-dashboard-success and validate smoke: `curl -fsS https://musu.pro/api/v1/health` returns 200, poll 5s if needed, halt if >3min. Added to AC. | §7 Stage 1 step 5.5 (new); §8 gate #1 prompt; §9 AC |
| M3 | MEDIUM | Plan says "Zero infrastructure" in musu-pro is slightly inaccurate — one orphan `node:test` file exists at `src/app/api/public-config/route.test.ts` | Wording fix: "No npm test runner deps; one orphan `node:test` file not wired into CI". Substantive conclusion unchanged. | §6.2 first paragraph rewritten |
| L1 | LOW | Plan line ranges off-by-one on three test files (wrtc-handshake.test.ts, wrtc-bridge-e2e.test.ts, gateway.test.ts) — missing the `as unknown as typeof fetch;` cast suffix line | Builder will see correct shape regardless via Edit tool; no plan patch required. Cosmetic. | Builder note in HANDOFF |
| L2 | LOW | `forceRefresh=true` post-B2 redundancy on `/v1/telemetry` adapter | **RESOLVED — keep as defense-in-depth.** The cache-bypass property has independent value (containment of any future `validateToken` caching bug at the bootstrap call site). Add to closure doc follow-on tickets: "B1.x: revisit forceRefresh=true on /v1/telemetry adapter once V23.3 cache-invalidation strategy is settled." | §11 already keeps it OoS; closure doc will reference |
| L3 | LOW | `tokenRow.user_id` defensive null-check at route.ts:69 — over-engineering given schema NOT NULL | **RESOLVED — schema-guaranteed.** `015_account_tokens.sql:14` declares `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` → PRIMARY KEY implies NOT NULL. No defensive check needed; note in closure doc. | None |
| I1 | INFO | No tests outside `musu-relay/tests/` exercise the validation path | **VERIFIED.** Grep across F:\workspace\musu-bee returns only docs + musu-relay/src + musu-relay/fly.toml. Plan §6.1 inventory is complete. | None |
| I2 | INFO | `account_tokens.user_id` is NOT NULL (PRIMARY KEY) | **VERIFIED.** `015_account_tokens.sql:14`. Plan §3.1 claim holds. | None |
| I3 | INFO | Single-machine drain wall-clock assumption | **PROMOTED to AC.** Operator runs `fly status --app musu-signaling` at Stage 2 wait start; output captured in closure doc. | §9 cross-repo AC added |
| I4 | INFO | Vercel edge cache propagation half-states | **MITIGATED** by M2's `/api/v1/health` gate. Closure doc may note: smoke validates one POP; geo-distributed re-test optional. | None |

**OQ adjudication summary** (matching plan §12):
- §12 #1 asymmetric ordering failure-mode — RESOLVED (rollback clean; no third-party consumer)
- §12 #2 drain wait sufficiency — RESOLVED (`degradedGrace()` never extends `entry.timestamp`; verified at server.ts:202-226)
- §12 #3 Fly auto-scaling — PROMOTED to AC (I3 above)
- §12 #4 test-harness rewrite scope — RESOLVED (I1 above)
- §12 #5 mock pattern — RESOLVED to Option A (H1 above)
- §12 #6 cache-bypass docstring update — RESOLVED (test logic independent of fallback)
- §12 #7 no musu-pro test — RESOLVED (curl-smoke + health-precheck + dashboard-verify = sufficient evidence)
- §12 #8 forceRefresh redundancy — RESOLVED to keep (L2 above)

**Critic verdict**: Builder may proceed to Phase 3 with this revised plan.

**End of B2 detail plan.**
