# V23.2 Workstream B3 — Admin auth for GET /v1/telemetry/summary (wiki/367)

**Date**: 2026-05-16
**Status**: Plan-mode draft. **In plan mode, awaiting Critic** (security-engineer recommended; see §11). Pre-Builder. Single-repo: musu-bee only.
**Predecessors**: wiki/361 (Workstream B master plan §B3), wiki/363 (B1 detail plan — shared-secret middleware pattern reference at `telemetry.ts:213-241`), wiki/364 (B1 closure — security posture + boot-config pattern), wiki/365 (B2 detail plan — format reference), wiki/366 (B2 closure — just landed)
**Branch**: `v22/gap-analysis` (continues B1+B2 ledger; no new branch)
**Wiki ID**: `wiki/367`

---

## 1. Summary

B3 is the last unauthenticated administrative surface in the V23.2 telemetry plane. `GET /v1/telemetry/summary` at `musu-relay/src/signaling/telemetry.ts:665-703` currently returns aggregate install / NAT-pierce / agent-spawn counts to anyone who knows the URL — production operators rely on Fly app obscurity, not real auth. B3 adds a bearer-token check (`Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>`) using the same constant-time SHA-256 + `crypto.timingSafeEqual` pattern that B1 hardened for `requireTelemetrySecret` (`telemetry.ts:230-240`). Scope is a single-repo, single-endpoint, ~30 LOC change plus five new tests and one boot-config extension. With B3 landed, the V23.2 Workstream B security-posture exit-state is achieved: every write endpoint is HMAC-authenticated (B1), the v21-era token-validation fallback is closed (B2), and the read/summary endpoint is admin-authenticated (B3). Risk profile is LOW — no schema, no production data path, GET-only, additive env var, single-commit rollback.

---

## 2. Design intent

### 2.1 Bearer-token pattern (not custom header)

`Authorization: Bearer <secret>` is industry standard for opaque admin tokens, supports `curl -H "Authorization: Bearer ..."` ergonomics, and gives any future automation (Prometheus scraper, on-call dashboard, ops shell) a single well-known header to set. The cost is one extra parser step ("Bearer " prefix check) versus a custom header like `X-Musu-Admin-Secret`. The benefit is alignment with every operator's muscle memory and every HTTP client's built-in bearer-auth helper.

Custom header (`X-Musu-Admin-Secret`) was considered for consistency with the write-endpoint `x-musu-telemetry-secret` header. Rejected because: (a) write endpoints carry a per-installer secret with a defined audience (the installer fleet); `/summary` carries an operator-scoped secret with a different audience (humans + ops tooling); (b) Bearer is the right semantic for the latter; (c) the write-endpoint header is interim and being phased out by HMAC anyway (B1) — no value in mirroring a deprecating convention.

### 2.2 Constant-time SHA-256 + timingSafeEqual

Identical pattern to `requireTelemetrySecret` at `telemetry.ts:230-240`. Specifically:

```typescript
const supplied = /* extracted bearer token */;
const suppliedHash = createHash("sha256").update(supplied).digest();
const secretHash = createHash("sha256").update(adminSecret).digest();
if (!timingSafeEqual(suppliedHash, secretHash)) {
  res.status(401).json({ error: "bad admin secret" });
  return false;
}
return true;
```

SHA-256 both sides BEFORE `timingSafeEqual` avoids the length-equality oracle that timingSafeEqual would otherwise leak (it throws on unequal-length inputs; comparing post-hash makes inputs always 32 bytes). Same defense, same code shape, same audit posture as B1.

### 2.3 Boot-config check (refuse-to-start in production)

Production deploys MUST set `MUSU_TELEMETRY_ADMIN_SECRET`; otherwise the signaling server refuses to start. This matches the existing `checkTelemetryAuthBootConfig` pattern at `telemetry.ts:404-420` and B1 commit 6's HMAC_ONLY posture.

Specifically, the existing function returns an error string when production lacks BOTH `MUSU_TELEMETRY_SHARED_SECRET` AND `MUSU_TELEMETRY_HMAC_ONLY=1` (write-endpoint auth gating). B3 adds a PARALLEL check: in production, `MUSU_TELEMETRY_ADMIN_SECRET` must be set, independently of write-endpoint auth mode. The two checks are orthogonal — write-endpoint auth and admin-endpoint auth are independent surfaces guarding independent data flows.

**Master-plan drift note**: wiki/361 §B3 line 120 originally said "log a WARN (not refuse to start — summary endpoint failure is non-fatal, unlike write endpoints)". This plan adopts refuse-to-start per the user's B3 task brief direction (post-B1+B2 closure, the production posture has tightened). Critic adjudicates whether to revert to WARN-only or keep refuse-to-start. Plan default: refuse-to-start.

### 2.4 Dev-mode tolerance preserved

If `MUSU_TELEMETRY_ADMIN_SECRET` is unset AND `NODE_ENV !== "production"`, the middleware returns 200 without authentication — preserving local-dev ergonomics. This matches the v21 dev posture (`requireTelemetrySecret` at `telemetry.ts:218-228` does the same with a warn-once log line).

The boot-config refuse-to-start backstops the dev-mode tolerance: a misconfigured prod env (`NODE_ENV=production`, secret unset) cannot reach a running state, so dev-mode auth-skip never executes in prod. Critic should verify this backstop is tight (see §11 attack #2).

### 2.5 No new schema, no new DB table, no new wire format outside one header

Zero migration risk. The request body shape is unchanged on the return path; only one new request header is consumed. Existing tests that don't hit `/summary` (signaling.test.ts, telemetry-emit.test.ts, all of the test files updated in B2) are unaffected.

---

## 3. File-by-file changes

| File | Lines | Change |
|---|---|---|
| `musu-relay/src/signaling/telemetry.ts` (new helper near `:213`) | ~25 lines added | New `requireAdminSecret(req, res): boolean` mirroring `requireTelemetrySecret` shape. Parses `Authorization: Bearer <token>` header, SHA-256s both sides, `timingSafeEqual` compare. Dev-mode tolerance when env unset + `NODE_ENV !== "production"`. 401 with `{error: "bad admin secret"}` on mismatch, 401 with `{error: "missing admin auth"}` on missing/malformed header. |
| `musu-relay/src/signaling/telemetry.ts:666` (wire onto `/summary`) | ~3 lines edited | Insert `if (!requireAdminSecret(_req, res)) return;` as the first line of the `/summary` handler. `_req` becomes `req` since it's now consumed. |
| `musu-relay/src/signaling/telemetry.ts:208-209` (comment) | 2 lines edited | Update the misleading block comment that says "GET /summary is unaffected — T2.AUTH.2-final adds auth there too" — convert to "(B3 wiki/367) GET /summary requires `Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>` in production; dev-mode tolerance when env unset + NODE_ENV != production." |
| `musu-relay/src/signaling/telemetry.ts:404-420` (`checkTelemetryAuthBootConfig`) | ~10 lines added | Extend the existing function to ALSO require `MUSU_TELEMETRY_ADMIN_SECRET` in production. Return a clear error string when missing; combine with the existing write-auth error when both are unconfigured. Order of checks: write-auth first (existing), admin-auth second (new). Both checks must pass for the function to return null in production. |
| `musu-relay/src/signaling/telemetry.ts` test helper (`_resetTelemetryAuthState`) | ~1 line added | If a warn-once flag is added for admin-secret dev-mode tolerance (matching `_warnedNoSharedSecret` at `:211`), reset it here. |
| `musu-relay/tests/telemetry-summary-auth.test.ts` (NEW) | ~120 lines | Five test cases (see §5). Mirrors `tests/telemetry-auth.test.ts` shape (supertest + makeTelemetryRouter + stub validator). |
| `musu-relay/tests/telemetry-auth.test.ts` (extend) | ~30 lines added | Add boot-config cases for the new ADMIN_SECRET-required-in-prod check, alongside the existing SHARED_SECRET / HMAC_ONLY cases. |

**Total**: ~30 LOC functional change + ~150 LOC test additions. Single commit on `v22/gap-analysis`.

---

## 4. Wire-format change

| Endpoint | Before (V23.2 post-B2) | After (V23.2 post-B3) |
|---|---|---|
| `GET /v1/telemetry/summary` | 200 OK + JSON body, no auth required | **Prod (env set)**: 200 OK + JSON body when `Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>` matches; 401 `{error: "missing admin auth"}` when header absent or not Bearer-scheme; 401 `{error: "bad admin secret"}` when Bearer token doesn't match. **Dev (env unset + NODE_ENV != production)**: 200 OK + JSON body, no auth (warn-once on first call). |
| Boot | Refuses to start in production unless write-auth is configured (`MUSU_TELEMETRY_SHARED_SECRET` set OR `MUSU_TELEMETRY_HMAC_ONLY=1`) | **Same write-auth requirement** + new admin-auth requirement: production also requires `MUSU_TELEMETRY_ADMIN_SECRET` set. Refuses to start when either is missing. |

Response body shape is unchanged. No new query params. No new response headers (optional `Cache-Control: no-store` is OQ #3 for Critic).

---

## 5. Test plan

**Suite count baseline (post-B2)**: 178 tests. **Post-B3 target**: 183 (5 new) + 1-2 boot-config additions → ≈184-185 green.

### 5.1 New file: `tests/telemetry-summary-auth.test.ts`

Five test cases, mirroring `tests/telemetry-auth.test.ts` shape (supertest + express harness):

1. **`rejects /summary with no Authorization header (401)`** — bare GET request. Expect 401 + `error: /missing|admin/i`.
2. **`rejects /summary with wrong scheme (401)`** — `Authorization: Basic <base64>`. Expect 401 + `error: /missing|admin/i` (the parser refuses non-Bearer schemes; same outcome as no header).
3. **`rejects /summary with Bearer token mismatch (401)`** — `Authorization: Bearer wrong-secret`. Expect 401 + `error: /bad admin secret/i`. Verifies the constant-time compare path returns the right error class.
4. **`accepts /summary with matching Bearer token (200)`** — `Authorization: Bearer test-admin-abc` (the value the test sets via `process.env.MUSU_TELEMETRY_ADMIN_SECRET`). Expect 200 + JSON body with `install` + `nat_pierce` keys (same shape as pre-B3).
5. **`dev-mode tolerance: env unset + NODE_ENV=test returns 200 without header`** — clears `MUSU_TELEMETRY_ADMIN_SECRET`, sets `NODE_ENV=test` (it already is during jest), bare GET request. Expect 200 + JSON body. Validates the dev-ergonomic locks; signaling.test.ts and friends don't break when they spin up the telemetry router incidentally.

### 5.2 Extension to `tests/telemetry-auth.test.ts` boot-config block

The existing file has boot-config tests for `checkTelemetryAuthBootConfig` (search for `NODE_ENV=production` cases). Add:

6. **`refuse-to-start when NODE_ENV=production + MUSU_TELEMETRY_ADMIN_SECRET unset`** — even when write-auth is correctly configured (`MUSU_TELEMETRY_SHARED_SECRET` set), the function should return a non-null error string mentioning `MUSU_TELEMETRY_ADMIN_SECRET`.
7. **`accept when NODE_ENV=production + both write-auth AND admin-auth configured`** — `MUSU_TELEMETRY_SHARED_SECRET` set + `MUSU_TELEMETRY_ADMIN_SECRET` set → returns null.

### 5.3 Tests that MUST NOT regress

- `tests/signaling.test.ts` (14 tests) — doesn't hit `/summary`. No fetch mock changes needed beyond what B2 already landed.
- `tests/telemetry-emit.test.ts` (18 tests) — emits POSTs only; doesn't read `/summary`.
- `tests/telemetry-hmac.test.ts` (23 tests) — HMAC write-endpoint tests; unaffected.
- `tests/telemetry.test.ts` (13 tests) — uses `/summary` for assertions IF the existing tests verify count totals. Check during Builder phase — if any test calls `GET /summary` without an Authorization header, it will start failing post-B3. Fix is one-line: set the env var in `beforeAll` of that file (same pattern as `tests/telemetry-auth.test.ts:10`) OR send the Bearer header on the GET. Grep target: `supertest(app).get("/v1/telemetry/summary")` across `tests/`. Initial inspection: not located in the grep at plan time, but Builder must verify.

### 5.4 Manual curl smoke (local dev)

```bash
# 1. Spin up locally with the env var set
MUSU_TELEMETRY_ADMIN_SECRET=test-admin-abc npm start

# 2. Without header — expect 401
curl -i http://localhost:8080/v1/telemetry/summary
# expect: HTTP/1.1 401 Unauthorized; body {"error":"missing admin auth"}

# 3. Wrong token — expect 401
curl -i -H "Authorization: Bearer wrong" http://localhost:8080/v1/telemetry/summary
# expect: HTTP/1.1 401; body {"error":"bad admin secret"}

# 4. Correct token — expect 200
curl -i -H "Authorization: Bearer test-admin-abc" http://localhost:8080/v1/telemetry/summary
# expect: HTTP/1.1 200; body {"install":{...},"nat_pierce":{...}}
```

Operator records the three responses in the closure doc (wiki/368) as smoke-test evidence.

---

## 6. Constitution gates

| Gate | Applies? | Why |
|---|---|---|
| **Const III** (schema migration) | NO | Zero schema change. |
| **Const VI** (30% experiment) | NO | Not experimental. |
| **Const VII** (push approval) | YES — single instance | Feature-branch push to `v22/gap-analysis` requires `진행해`. Main-branch merge of V23.2 Workstream B (B1+B2+B3 collectively) is a separate downstream gate, not B3. |

### Const VII gate — feature-branch push

**When**: after Builder commits the single B3 commit on `v22/gap-analysis`, before `git push origin v22/gap-analysis`.

**Prompt (orchestrator emits)**:
> Const VII gate: B3 is ready to push to `v22/gap-analysis`. This pushes 1 commit adding `requireAdminSecret` middleware enforcing `Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>` on `GET /v1/telemetry/summary`, plus boot-config tightening that refuses to start in production when the env var is unset. Push does NOT auto-deploy Fly. Operator action required POST-push, PRE-`fly deploy`: `fly secrets set MUSU_TELEMETRY_ADMIN_SECRET=$(openssl rand -hex 32)`. If the operator runs `fly deploy` without setting the secret, the new boot config will refuse to start and the deploy will fail-safe. Approve push? `진행해 / no`.

---

## 7. Rollout / operator action

### 7.1 Operator sequence post-push

```
1. git push origin v22/gap-analysis            # B3 commit lands on feature branch
2. fly secrets set MUSU_TELEMETRY_ADMIN_SECRET=$(openssl rand -hex 32)
3. fly deploy                                  # boot config now satisfied
4. curl -i https://<fly-domain>/v1/telemetry/summary
   # expect: 401 (no header)
5. curl -i -H "Authorization: Bearer <secret-value>" https://<fly-domain>/v1/telemetry/summary
   # expect: 200 + JSON body
6. Save the bearer-secret to the operator's password manager.
   It is the ONLY way to scrape /summary going forward.
```

### 7.2 Failure modes

- **Operator runs `fly deploy` before `fly secrets set`**: signaling server logs the boot-config refuse-to-start error string mentioning `MUSU_TELEMETRY_ADMIN_SECRET`, exits non-zero, Fly restarts the machine in a loop. Fly health check fails. Operator sees the error in `fly logs` within seconds and sets the secret. **Fail-safe**: no half-open state where `/summary` is exposed unauthenticated.
- **Operator sets a weak secret** (e.g., `password`): boot config passes (presence-only check), but the secret is brute-forceable. Mitigation: docstring on the env var, runbook section recommending `openssl rand -hex 32`. Not enforced in code; over-engineering for a single ops endpoint.
- **Operator loses the secret**: rotate via `fly secrets set MUSU_TELEMETRY_ADMIN_SECRET=$(openssl rand -hex 32)` + `fly deploy`. No DB state involved; rotation is instant.

### 7.3 Rollback

`git revert <B3-commit> && git push origin v22/gap-analysis`. Fly machine continues running pre-B3 code until next `fly deploy`. If a `fly deploy` of the revert has been issued, `/summary` is back to its V23.2-pre-B3 state (open, unauthenticated). No data loss; no state to migrate. **Note**: the V23.2 master-plan §"Verification" criterion that `/summary` returns 401 without admin secret would regress; closure doc captures the rollback.

---

## 8. Acceptance criteria

- [ ] `grep -n "requireAdminSecret" musu-relay/src/signaling/telemetry.ts` returns exactly two matches: the function definition (~`:213` area) and the one wiring at `/summary` (~`:666` area).
- [ ] `grep -n "Authorization" musu-relay/src/signaling/telemetry.ts` returns at least one match in the new helper (header read).
- [ ] `grep -n "MUSU_TELEMETRY_ADMIN_SECRET" musu-relay/src/signaling/telemetry.ts` returns at least two matches: one in `requireAdminSecret`, one in `checkTelemetryAuthBootConfig`.
- [ ] `npm test` returns 183/183 (or 184-185 with the boot-config additions) green. Specifically `tests/telemetry-summary-auth.test.ts` reports 5/5 passing.
- [ ] `tsc --noEmit` clean.
- [ ] Curl smoke (§5.4) returns the expected 401 / 401 / 200 sequence locally with `MUSU_TELEMETRY_ADMIN_SECRET=test-admin-abc npm start`.
- [ ] Block comment at `telemetry.ts:208-209` updated (no longer claims `/summary` is unaffected by auth).
- [ ] No new HIGH or MEDIUM Critic findings unaddressed before Builder starts (this plan's purpose; resolutions land in §13 once Critic runs).

---

## 9. Recommended commit order

Single commit on `v22/gap-analysis`:

```
V23.2 B3: admin auth on /v1/telemetry/summary (wiki/367)

Adds requireAdminSecret middleware enforcing
Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET> on GET /summary.
Constant-time SHA-256 compare via crypto.timingSafeEqual matching the
B1 shared-secret pattern at telemetry.ts:230-240. Boot-config refusal
in production when MUSU_TELEMETRY_ADMIN_SECRET unset, extending the
existing checkTelemetryAuthBootConfig (telemetry.ts:404-420). Dev
tolerance (env unset + NODE_ENV != production) preserves local-dev
ergonomics; backstopped by the prod boot-config refuse-to-start so
misconfigured prod cannot silently fall through to dev-mode.

Last unauthenticated administrative surface closed; V23.2 Workstream B
security posture exit-state achieved with B1+B2+B3.

Tests: 178 -> 183 green (5 new in tests/telemetry-summary-auth.test.ts)
plus boot-config cases in tests/telemetry-auth.test.ts. tsc --noEmit
clean.

Refs: wiki/361 §B3, wiki/367.
```

Single-commit choice rationale: ~30 LOC functional + tests are tightly coupled (the middleware and its tests land together; the boot-config check has no value without the middleware). Splitting into two commits would fracture a single logical change without audit-narratability benefit (contrast B2's 2-commit split, which separated production code from test-fixture rewrites — different audiences for each diff). B3's diff has a single reviewer audience: the security-engineer Auditor reading the new middleware + its tests + the boot-config tightening as one coherent change.

---

## 10. Out of scope (explicit)

- **Rotation automation**: operator-driven (`fly secrets set` + `fly deploy`); no auto-rotation in code. No expiry on the bearer token. Rotation cadence is an ops concern documented in the closure doc.
- **Per-user admin roles / claims-based auth (OAuth, JWT, etc.)**: massively over-scoped for a single ops endpoint with one human-operator audience. Defer to V23.3+ if multi-operator audit trails ever become a requirement.
- **Audit-logging of `/summary` access**: candidate for B3.x or B4c follow-on. Today `/summary` is read by humans on rare occasions; not worth the SQLite write per GET. If `/summary` ever becomes a Prometheus scrape target (high-frequency), reassess.
- **WebSocket-based push of summary metrics**: over-scoped; the polling pattern is fine for ops dashboard cadence.
- **Per-IP rate-limiting / throttling on `/summary`**: surfaced as Critic OQ #5. Default OoS unless Critic escalates.
- **Encrypting `MUSU_TELEMETRY_ADMIN_SECRET` at rest** (Fly secrets envelope encryption): Fly already handles secret encryption at the platform level; no app-side work needed.
- **Operator-facing UI for `/summary`**: this plan ships the HTTP endpoint only. Dashboard / CLI wrapper is downstream.
- **Removing the `_req` underscore at `telemetry.ts:666`**: cosmetic, included in §3 file-by-file changes because the request object now gets consumed.
- **Migration story for any prod deploy that's currently relying on `/summary` being open**: per master plan §B3, the production posture today is "Fly app non-public + obscurity"; there are no known consumers of an unauthenticated `/summary`. If an unknown consumer surfaces post-B3, they break loudly with a 401 (not silently with stale data); easy to triage.

---

## 11. Critic prep

**Recommended Critic agent**: `security-engineer` (NOT `system-architect`).

**Rationale**: adding admin auth to an endpoint that exposes operational data IS a security surface change, even though the surface is shrinking. The interesting risks are auth-mechanism choice, boot-config tightening migration, and dev-mode tolerance escape paths — all in `security-engineer`'s wheelhouse. B1 set the precedent for `security-engineer` on auth-touching workstreams (wiki/361 step 5 role map).

**Critic should specifically attack**:

a. **Bearer vs custom header (§2.1)**: is `Authorization: Bearer` the right pattern, or does mirroring the existing `x-musu-telemetry-secret` convention have value? Plan defaults to Bearer for operator ergonomics; Critic may push back.

b. **Dev-mode tolerance leak path (§2.4)**: could a misconfigured prod env (e.g., `NODE_ENV` accidentally unset, `MUSU_TELEMETRY_ADMIN_SECRET` accidentally unset) silently expose `/summary`? Plan claims the boot-config refuse-to-start is a tight backstop because `checkTelemetryAuthBootConfig` gates BOTH on `NODE_ENV === "production"`. But if `NODE_ENV` itself is the env var that's missing, the boot check returns null (treats it as non-prod) — and the middleware also treats it as non-prod, returning 200 without auth. **Defense**: add a Fly machine assertion that `NODE_ENV=production` is set in `fly.toml` (already true per `fly.toml` env block — verify at plan time). Critic adjudicates whether this is sufficient.

c. **Boot config tightening migration story (§7.1)**: prod currently runs without `MUSU_TELEMETRY_ADMIN_SECRET`. The next `fly deploy` of the B3 commit will refuse to start unless the operator sets the secret FIRST. This is a desired fail-safe but means a deploy without operator awareness regresses uptime. Is the master-plan §B3 WARN-only posture safer for one release cycle, with refuse-to-start landing in B3.x? Plan default: refuse-to-start matching B1 precedent and task-brief direction. Critic adjudicates.

d. **SHA-256 + timingSafeEqual reuse vs HMAC-based auth (§2.2)**: the write endpoints use HMAC (B1) precisely because shared-secret bearer tokens are replayable. Is bearer-replay a meaningful threat on `/summary`? The endpoint is GET (no body to sign), the response is non-sensitive aggregate counts, and the secret is operator-known (not fleet-distributed). Replay only matters if an attacker observes a valid `/summary` request mid-flight (HTTPS terminates this) or if the secret leaks (rotation is the answer). Plan default: bearer is sufficient. Critic verifies the threat model.

e. **`/summary` response body sensitivity (§10 rate-limiting OoS)**: install / NAT-pierce / agent-spawn counts are aggregate metrics, not per-user data. Does the response body itself need additional rate-limiting (per-IP throttling)? Plan says no — the bearer auth is the single chokepoint. Critic may argue for express-rate-limit on top of bearer for defense-in-depth.

f. **Single-commit choice (§9)**: is the 30 LOC + 150 LOC test split into one commit appropriate, or should the middleware + boot-config land separately from the test additions? B2 used 2 commits; B3 plan defaults to 1. Builder follows whichever Critic prefers.

g. **Comment-debt cleanup at `telemetry.ts:208-209`**: the existing block comment claims `/summary` is unaffected by auth and that T2.AUTH.2-final will add it. The plan updates this comment in the same commit. Critic verifies the rewritten comment doesn't drift from the post-B3 reality (e.g., shouldn't say "added in T2.AUTH.2-final" — should reference B3 / wiki/367 explicitly).

---

## 12. References

- wiki/361 — V23.2 Workstream B master plan (§B3 line 113-126, §"Sequencing + dependencies" line 175 places B3 parallel with B1)
- wiki/363 — V23.2 Workstream B1 detail plan (`requireTelemetrySecret` middleware pattern at `telemetry.ts:213-241`)
- wiki/364 — V23.2 Workstream B1 closure (boot-config pattern, HMAC_ONLY posture, security-engineer audit precedent)
- wiki/365 — V23.2 Workstream B2 detail plan (format reference for this doc; cross-repo §6.2 manual-smoke pattern reused for §5.4)
- wiki/366 — V23.2 Workstream B2 closure (just landed; locks the v21-era fallback closure as the predecessor to B3)
- `F:\workspace\musu-bee\musu-relay\src\signaling\telemetry.ts:208-209` — misleading comment block (B3 fixes)
- `F:\workspace\musu-bee\musu-relay\src\signaling\telemetry.ts:213-241` — `requireTelemetrySecret` pattern reference
- `F:\workspace\musu-bee\musu-relay\src\signaling\telemetry.ts:404-420` — `checkTelemetryAuthBootConfig` extension target
- `F:\workspace\musu-bee\musu-relay\src\signaling\telemetry.ts:665-703` — `/summary` route handler (B3 wires auth here)
- `F:\workspace\musu-bee\musu-relay\tests\telemetry-auth.test.ts:1-60` — boot-config + auth-test format reference

---

## 13. Critic Findings (resolved)

*Pending* `security-engineer` Critic pass. Findings will be appended here in the wiki/365 §15 table format once the Critic runs:

| # | Severity | Finding (1-line) | Resolution | Where patched |
|---|---|---|---|---|
| — | — | (awaiting Critic) | — | — |

**End of B3 detail plan.**
