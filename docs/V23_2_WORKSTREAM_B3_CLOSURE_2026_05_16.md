# V23.2 Workstream B3 — /v1/telemetry/summary admin auth closure (wiki/368)

**Date**: 2026-05-16
**Status**: Code-complete, audited (SHIP). Single commit `e63f329` staged locally on `v22/gap-analysis`; **not yet pushed** — awaiting Const VII gate prompt #3. No production deploy triggered by this push itself; operator must `fly secrets set MUSU_TELEMETRY_ADMIN_SECRET=...` BEFORE the next `fly deploy` or the signaling app refuses to start (fail-safe).
**Predecessors**: wiki/361 (Workstream B master plan), wiki/364 (B1 closure — HMAC write-auth + AR carry), wiki/366 (B2 closure — validateToken fallback removal + AR carry), wiki/367 (B3 detail plan with §13 Critic Findings (resolved))
**Branch**: `v22/gap-analysis` (continues B1+B2 ledger)
**Wiki ID**: `wiki/368`

---

## Summary

B3 closes the last unauthenticated administrative surface on the signaling server. `GET /v1/telemetry/summary` — pre-B3 reachable by anyone who could reach the Fly app — now requires `Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>` and the boot path refuses to start in production when the secret is unset (same refuse-to-start posture B1 established for write-auth). With this commit, **V23.2 Workstream B's security exit-state is achieved**: write endpoints HMAC-authenticated (B1), v21-era `validateToken` fallback closed (B2), `/summary` admin-authenticated (B3) — all three layers gated independently by `checkTelemetryAuthBootConfig`. Single-commit workstream `e63f329`: middleware + boot-config extension + warn-once flag + one new test file (7 tests) + rewrite of 1 pre-B3 test + 3 modified boot-config tests + 1 comment block in `tests/telemetry.test.ts`. Test suite went from 178 (post-B2) → **189 green**; `npx tsc --noEmit` clean. Single security-engineer audit (per plan §11 — auth-heavy but well-scoped, write-auth invariants from B1 are the cited blast-radius bound) issued **SHIP** with zero new HIGH/MEDIUM findings, 10 INFO-level confirmations, and two new comment/convention accepted-risks (AR-B3-1, AR-B3-2) bundled for the next docs-hygiene pass.

---

## Commit ledger

Single-commit workstream per plan §9 (atomic security boundary; partial pushes would leave `/summary` open OR refuse-to-start without the secret being settable mid-flight).

| # | SHA | Subject | Key files | Tests added |
|---|---|---|---|---|
| 1 | `e63f329` | `V23.2 B3: admin auth on /v1/telemetry/summary (wiki/367)` | `src/signaling/telemetry.ts` (`requireAdminSecret` middleware + `_warnedNoAdminSecret` warn-once + `checkTelemetryAuthBootConfig` extension + `/summary` wiring + comment at `:208-209`); `tests/telemetry-summary-auth.test.ts` (NEW); `tests/telemetry-auth.test.ts` (rewrite + 4 new boot-configs + 3 modified existing boot-configs); `tests/telemetry.test.ts` (comment block at `:164`) | +7 in new file; +4 boot-config + 1 rewritten /summary test in `telemetry-auth.test.ts`; net **+11** |

Suite count: 178 (post-B2) → **189** (post-B3). `npx tsc --noEmit`: clean (no output).

File diff summary: 1 src file (`telemetry.ts`), 1 NEW test file (`telemetry-summary-auth.test.ts`), 2 modified test files (`telemetry-auth.test.ts`, `telemetry.test.ts`), 1 plan doc with embedded Critic resolutions (wiki/367), 0 schema/migration changes, 0 wire-format changes beyond one new request header.

---

## What changed end-to-end

### Wire format — one new request header on `/summary`

`GET /v1/telemetry/summary` now requires:

```
Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>
```

Bearer scheme matches IETF RFC 6750 §2.1 (HTTP Authentication framework) and is case-insensitive per RFC 7235 §2.1 (Critic M3 RESOLVED — regex `/^Bearer\s+(.+)$/i` at `telemetry.ts:285` accepts `Bearer`, `bearer`, `BEARER`). The captured token must be ≥1 char (empty `Bearer ` rejected per Critic L1; test at `tests/telemetry-summary-auth.test.ts:51-59`). No body or query-string fallback — header-only, single canonical surface.

### Constant-time comparison — reuse of B1 crypto pattern

Token verification follows the B1 `requireInstallHmac` pattern: both supplied and expected secrets are SHA-256-hashed FIRST, then compared via `crypto.timingSafeEqual()` on the fixed-32-byte digests. This avoids the `timingSafeEqual` length-mismatch throw on attacker-controlled lengths and ensures constant-time over the digest space rather than the variable input space. Auditor verified ordering (SHA-256 both sides BEFORE `timingSafeEqual`) and confirmed regex is anchored + linear (no ReDoS exposure; Express `maxHeaderSize=8KB` caps input length anyway).

### Boot-config tightening — the prod posture backstop

`checkTelemetryAuthBootConfig` (originally added in B1 commit `f616c15` for write-auth) extends to additionally require `MUSU_TELEMETRY_ADMIN_SECRET` in production. The joint-axis matrix is now:

- `NODE_ENV=production` ∧ neither `SHARED_SECRET` nor `HMAC_ONLY=1` → refuse-to-start (B1 invariant; unchanged)
- `NODE_ENV=production` ∧ `ADMIN_SECRET` unset → refuse-to-start (B3 NEW)
- Both required → refuse-to-start FATAL line names both env vars
- Non-prod (`NODE_ENV !== "production"`) → tolerate unset; `_warnedNoAdminSecret` fires WARN-once on first `/summary` hit referencing "B3 wiki/367" (telemetry.ts:213 declaration, :273-280 emission, :445-448 reset for test isolation)

Three existing B1/B2 boot-config tests in `tests/telemetry-auth.test.ts` were modified to set `ADMIN_SECRET` in their environment to keep the joint-axis assertion isolated to the write-auth axis they were originally testing.

### Dev-mode tolerance preserved + platform backstop

Non-prod boots without `ADMIN_SECRET` are tolerated to support local development and CI test setup. The WARN-once flag is the in-process signal; the platform-level backstop is `fly.toml:69` which hard-codes `NODE_ENV=production` for the Fly app, so a misconfigured dev-mode deploy cannot reach production. See AR-B3-1 below for the line-of-defense layering caveat.

### Test rewrites and comment block

Per Critic H1, two pre-B3 tests directly asserted unauthenticated `/summary` reachability:

- `tests/telemetry-auth.test.ts:109` — pre-B3 single assertion "GET /summary remains accessible" was rewritten at `:109-141` into a 2-part split: (a) without `Authorization` header → 401; (b) with valid Bearer → 200 + body shape unchanged.
- `tests/telemetry.test.ts:164` — body-shape test continues to pass dev-mode (no `NODE_ENV=production` set in this suite) and now carries a 10-line comment block at `:164-173` documenting why this suite's request omits the Bearer header (dev-mode tolerance, gated explicitly by absence of `NODE_ENV=production`, with cross-reference to `telemetry-summary-auth.test.ts` for the 401 + 200 assertions).

This is the H1 RESOLVED-CONFIRMED evidence: pre-B3 "GET /summary remains accessible" lies have been replaced with the post-B3 truth, and the dev-mode tolerance path retains explicit test coverage in a separate file.

### "제품만 올리라고" boundary preserved

B3 is entirely within `musu-relay/src/signaling/telemetry.ts` + adjacent tests. **Zero musu-pro changes** (B2 was the only V23.2 workstream that touched musu-pro). No schema change, no migration, no Const III gate.

---

## Critic Findings (resolved) — verified by Audit

The wiki/367 §13 Critic table (security-engineer pass) is reproduced below with the auditor's "Resolution status" column appended. All 5 inline patches (H1, M1, M2, M3, M4) were applied to the plan doc pre-Build; Builder executed against the patched plan and Auditor verified the resulting code.

| # | Sev | Finding (1-line) | Plan-time resolution | Verified by Audit |
|---|---|---|---|---|
| H1 | HIGH | Two pre-B3 tests directly assert unauthenticated `/summary` reachability; must be updated IN the B3 commit | Rewrote §5.3 with explicit rename + split instructions; updated §8 AC to target ≈186 green | **RESOLVED-CONFIRMED.** Pre-B3 single assertion at `tests/telemetry-auth.test.ts:109` rewritten to 2-part split at `:109-141`; comment block landed at `tests/telemetry.test.ts:164-173`. Final test count 189 (above the ≈186 plan target). |
| M1 | MEDIUM | `_warnedNoAdminSecret` warn-once flag was optional; without it, mis-set NODE_ENV gets zero log signal | Promoted mandatory; text references "B3 wiki/367"; both flags reset in `_resetTelemetryAuthState` | **RESOLVED-CONFIRMED.** Flag declared at `telemetry.ts:213`, fires at `:273-280` with `"B3 wiki/367"` ref string verbatim, reset at `:445-448`. |
| M2 | MEDIUM | Boot-config tests missing: case 7b (admin set + write unset = error) and case 8 (non-prod ignores) | Added cases 7b and 8 to §5.2 mirroring B1 pattern | **RESOLVED-CONFIRMED.** Case 7b at `tests/telemetry-auth.test.ts:271-281`; case 8 at `:283-296`. |
| M3 | MEDIUM | Bearer scheme case-handling unspecified — RFC 7235 §2.1 requires case-insensitive | Updated §2.2 to `/^Bearer\s+(.+)$/i`; added test 2b | **RESOLVED-CONFIRMED.** Regex with `/i` flag at `telemetry.ts:285`; test 2b ("accepts lowercase 'bearer' scheme") at `tests/telemetry-summary-auth.test.ts:71-80`. |
| M4 | MEDIUM | §5.4 manual smoke didn't handle operator's `NODE_ENV=production` shell export (boot refuses to start) | Added preconditions + explicit `NODE_ENV=development MUSU_TELEMETRY_ADMIN_SECRET=test-admin-abc npm start` | **RESOLVED-CONFIRMED.** Plan §5.4 carries the preconditions; no in-code change required. |
| L1 | LOW | Empty Bearer token edge case not enumerated | Added test case 1b in §5.1; regex `/^Bearer\s+(.+)$/i` requires ≥1 char | **RESOLVED-CONFIRMED.** Empty Bearer test at `tests/telemetry-summary-auth.test.ts:51-59`. |
| L2 | LOW | No `Cache-Control: no-store` — irrelevant unless CDN-fronted | Deferred; closure-doc note | **DEFERRED.** See §"Follow-on items" — revisit if `/summary` ever sits behind a CDN. |
| L3 | LOW | Structured audit logging of `/summary` access out-of-scope | Closure-doc note | **DEFERRED.** See §"Follow-on items" — revisit if `/summary` becomes a high-frequency scrape target. |
| I1 | INFO | Token logging on 401: B1 precedent at `:236-238` does NOT log supplied bearer | Builder confirms no `console.log(supplied)` in new code | **VERIFIED.** Auditor grepped 401 paths; no bearer token appears in any log statement. |
| I2 | INFO | Single-commit choice in §9 is sound | No change | **VERIFIED.** |
| I3 | INFO | `_req → req` rename at `:666` enforced by tsc unused-var warning | No change | **VERIFIED.** `tsc --noEmit` clean. |

---

## Audit results

Single security-engineer audit per master plan §B3 + plan §11 rationale: B3 is auth-heavy but the surface is well-scoped (GET-only read endpoint, no schema change, no cross-repo coordination, no migration). Write-auth invariants from B1 + token-validation invariants from B2 are the cited blast-radius bound; B3 cannot regress them because it touches different code paths.

### Verdict: **SHIP** (no blockers)

Test verification (verbatim):
```
Test Suites: 18 passed, 18 total
Tests:       189 passed, 189 total
Snapshots:   0 total
Time:        17.448 s
Ran all test suites.
```
Plus: `npx tsc --noEmit` — clean (no output).

### New findings (INFO only, no HIGH/MEDIUM, no LOW)

Auditor issued 10 INFO-level confirmations of independent checks. None block, none warrant follow-on tickets; two bundle into the accepted-risk register as documentation/convention items (AR-B3-1, AR-B3-2):

- **INFO-1** — Constant-time comparison correctness verified: SHA-256 both sides BEFORE `timingSafeEqual`, fixed 32-byte digest comparison. Avoids length-mismatch throw + ensures constant-time over digest space.
- **INFO-2** — Regex `^Bearer\s+(.+)$` (with `/i`) is anchored, linear-time, ReDoS-safe. Input length is bounded by Express `maxHeaderSize` default of 8KB.
- **INFO-3** — Empty-string env var (`MUSU_TELEMETRY_ADMIN_SECRET=""`) is consistently treated as unset at both boot-config check and runtime middleware. Mirrors B1's handling for `SHARED_SECRET`.
- **INFO-4** — `NODE_ENV` strict-equal comparison (`process.env.NODE_ENV === "production"`) is consistent with codebase convention used in B1's `checkTelemetryAuthBootConfig`. See AR-B3-2 below for the case-sensitivity caveat.
- **INFO-5** — Boot-config error strings leak no secrets (env var names only, no values).
- **INFO-6** — No bearer-token value appears in any log statement on 401 paths (B1 precedent honored; Critic I1 confirmed).
- **INFO-7** — Comment block at `telemetry.ts:264-266` implies the middleware checks `NODE_ENV` at request time; in fact `NODE_ENV` is only consulted at boot-config time, with the middleware behaving uniformly thereafter. Defense layering is correctly implemented (boot-config + `fly.toml:69` platform backstop both enforce prod posture). Comment tightening deferred → AR-B3-1.
- **INFO-8** — `_warnedNoAdminSecret` warn-once log text includes the "B3 wiki/367" backref per Critic M1, which provides good signal for future operators encountering an unexpected WARN.
- **INFO-9** — Test-isolation reset of warn-once flags (`telemetry.ts:445-448`) covers both B1's `_warnedShared*` flags and B3's `_warnedNoAdminSecret` flag. No cross-test bleed.
- **INFO-10** — Joint-axis matrix in `checkTelemetryAuthBootConfig` is complete: all 4 combinations of `{SHARED_SECRET|HMAC_ONLY, ADMIN_SECRET}` × `{set, unset}` in prod are exercised by tests `telemetry-auth.test.ts` cases 7, 7b, 8, and the pre-existing B1 cases.

### Audit addressed every prior Critic HIGH

Per MODE_Agent_Team.md §"Phase 5 Auditor addresses every prior Critic HIGH": Auditor explicitly named H1 in HANDOFF NOTES with the file:line citations above (`tests/telemetry-auth.test.ts:109-141` rewrite + `tests/telemetry.test.ts:164-173` comment block). No silent pass-through; the audit confirms the plan-time resolution actually shipped in code.

---

## Critical invariants preserved (post-B3)

Audit-verified, file:line citations to `musu-relay/src/signaling/telemetry.ts` and adjacent files:

1. **V23.2 Workstream B security exit-state achieved.** Three independent authentication gates: (a) write endpoints (`/install`, `/nat_pierce`, `/agent_spawn`) under B1 HMAC; (b) WS-HELLO + `/issue_install_key` under B2 strict token validation (no v21 fallback); (c) `/summary` under B3 Bearer admin auth. Each gated independently by `checkTelemetryAuthBootConfig`.
2. **Production refuse-to-start on missing env vars.** Boot-config matrix refuses if EITHER write-auth axis (`SHARED_SECRET` or `HMAC_ONLY=1`) OR admin-auth axis (`ADMIN_SECRET`) is unset in prod. FATAL line names the specific missing env var(s).
3. **Dev-mode tolerance preserved + platform-backstopped.** Non-prod boots tolerate unset secrets; `fly.toml:69` hard-codes `NODE_ENV=production` so a misconfigured dev-mode deploy cannot land in prod. `_warnedNoAdminSecret` fires WARN-once on first `/summary` hit referencing "B3 wiki/367" for operator signal.
4. **No new schema, no new wire format outside one new header.** B3 adds `Authorization: Bearer <token>` to one route. No DB columns, no migrations, no Const III gate. Response body shape unchanged (200 path preserves pre-B3 JSON shape; verified by `tests/telemetry.test.ts:164` body-shape suite still passing).
5. **No bearer-token logging on 401 paths.** B1 precedent honored (Critic I1, Auditor INFO-6). All 401 responses use `{ error: "..." }` shape with no token echo.
6. **Constant-time comparison preserves B1 crypto-hygiene pattern.** SHA-256 + `timingSafeEqual` on 32-byte digests; identical to `requireInstallHmac` construction.

---

## Accepted-risk register

New B3 entries plus B1 + B2 carry-forwards. Each entry: risk, why accepted, revisit trigger.

### AR-B3-1 (new) — comment at `telemetry.ts:264-266` implies middleware checks NODE_ENV

- **Risk**: comment text reads as if `requireAdminSecret` consults `process.env.NODE_ENV` at request time; in fact `NODE_ENV` is only consulted at boot-config time, with the middleware behaving uniformly post-boot. Defense layering is correctly implemented (boot-config + `fly.toml:69` backstop), but a future reader might attempt to "harden" the middleware by adding a runtime NODE_ENV check and inadvertently break dev mode.
- **Why accepted**: pure documentation drift; zero behavior or test impact. Comment tightening is a 3-5 line change with no risk surface.
- **Revisit trigger**: bundle into the next docs-hygiene commit on any B-workstream cleanup pass (alongside AR-B2-1 line-drift, AR-B3-2 below, and any B1.x follow-on commits).

### AR-B3-2 (new) — `NODE_ENV === "production"` is strict-case-sensitive

- **Risk**: `process.env.NODE_ENV === "Production"` (capitalized) or `"PRODUCTION"` would slip past the prod gate and silently enable dev-mode tolerance in a misconfigured production environment.
- **Why accepted**: mirrors codebase convention used in B1's `checkTelemetryAuthBootConfig` and elsewhere; `fly.toml:69` hard-codes lowercase `production` so the actual deploy path is safe. Tightening this comparison would require sweeping every `NODE_ENV ===` site in the codebase to maintain consistency; out of scope for B3.
- **Revisit trigger**: any future Node.js framework migration or codebase-wide convention change. Cheap fix: a single utility `isProduction()` exported from a shared module. Bundle into V23.3 if it ever surfaces.

### AR-B2-1 (B2 carry) — comment line-number drift at `server.ts:338` and `:347`

Unchanged by B3. See wiki/366 §"Accepted-risk register" / AR-B2-1. Revisit on the same docs-hygiene pass that addresses AR-B3-1 and AR-B3-2.

### AR-B2-2 (B2 carry) — degraded-grace path returns cached canonical id

Unchanged by B3. See wiki/366 / AR-B2-2. Revisit at V23.3 cache-invalidation strategy review.

### AR-1 (B1 carry) — plaintext `account_key` at rest in SQLite

Unchanged by B3. See wiki/364 §"Accepted-risk register" / AR-1. Revisit at B3-envelope (V23.3); the encryption workstream is named B3-envelope but is **distinct from this B3** (admin-auth) and remains future-scoped per master plan.

### AR-2 (B1 carry) — 401 oracle messages on `requireInstallHmac`

Unchanged by B3. See wiki/364 / AR-2. Note: B3's `requireAdminSecret` does NOT distinguish error reasons (single `{ error: "unauthorized" }` shape across all 401 paths); the oracle concern is contained to the write-auth surface. Revisit if user_ids become guessable.

### AR-3 (B1 carry) — no V8 string-zeroization on gateway close

Unchanged by B3. The admin secret lives in `process.env`, not in a gateway-process string, so the V8/JS GC-string limitation is even less relevant on the admin-auth axis. See wiki/364 / AR-3. Revisit if signaling ships into hostile environments.

---

## Rollout outcome

### Stage 1 — local commit complete

- **Commit**: `e63f329` "V23.2 B3: admin auth on /v1/telemetry/summary (wiki/367)" landed on `v22/gap-analysis`.
- **Local verification**: `npm test` → 189/189 green; `npx tsc --noEmit` clean.
- **Diff scope**: 1 src file modified, 1 NEW test file, 2 modified test files, 1 plan doc with embedded Critic resolutions. No schema, no migration.

### Stage 2 — Const VII gate #3 push: PENDING

Orchestrator-side. Operator-facing gate prompt template (Const VII):

> B3 closure (wiki/368) is ready. Single commit `e63f329` on `v22/gap-analysis` adds admin auth to `/v1/telemetry/summary`. Test suite 178 → 189 green; tsc clean; security audit issued SHIP with zero HIGH/MEDIUM findings.
>
> Next-action sequence (operator-controlled):
> 1. `git push origin v22/gap-analysis`
> 2. **BEFORE next `fly deploy`**: `fly secrets set MUSU_TELEMETRY_ADMIN_SECRET=$(openssl rand -hex 32) --app musu-signaling`
> 3. `fly deploy --app musu-signaling` (will refuse-to-start if `ADMIN_SECRET` unset — fail-safe by design)
> 4. Curl smoke: `curl -fsS https://<host>/v1/telemetry/summary` should return **401** (no header); `curl -fsS -H "Authorization: Bearer <secret>" https://<host>/v1/telemetry/summary` should return **200** with the expected JSON body shape.
>
> Reply `진행해` to proceed.

Timestamps (push-time, deploy-time, smoke-time) to be filled in by orchestrator once the push lands and operator confirms `fly deploy` + smoke evidence.

### Stage 3 — V23.2 Workstream B security exit-state declared

After Stage 2 deploy + smoke pass, the V23.2 Workstream B security posture is declared complete:

- Write endpoints under HMAC (B1, live since B1 push)
- Token validation strict (B2, live since B2-bee push)
- Admin endpoint under Bearer (B3, live after Stage 2)

Operator may at this point flip `MUSU_TELEMETRY_HMAC_ONLY=1` (per wiki/364 §"Operational dependencies & rollout" + wiki/366 §"Operational dependency forward — HMAC_ONLY=1 cutover") to complete the cutover from dual-accept to HMAC-only on the write-auth axis. That cutover is itself outside B3 scope.

---

## Operational dependency forward — main-branch merge

`v22/gap-analysis` → `main` merge remains gated by V23.2 Workstream B final closure (a separate closure doc summarizing the cumulative state of B1+B2+B3+B4+B5, not this per-workstream doc). Per master plan wiki/361 sequencing, the next workstreams are:

- **B5**: telemetry image trim (`tsconfig.docker.json`) — independent of B3, can run in parallel.
- **B4a/b/c**: Windows installer + `accountKey` file persistence with proper ACL (`icacls` + `chmod 0600` cross-platform) — closes wiki/363 Critic HIGH #1 / wiki/364 AR-1 follow-on.

B3 has zero ordering dependencies with B4 or B5. The V23.2 Workstream B final closure will pull from all of B1/B2/B3/B4/B5 closures.

---

## Follow-on items

### Near-term (bundled docs-hygiene commit on next B-workstream pass)

- **B3.x-1**: tighten comment at `telemetry.ts:264-266` to clarify `NODE_ENV` is boot-time only (AR-B3-1).
- **B3.x-2**: introduce shared `isProduction()` utility for case-sensitivity hardening across `NODE_ENV ===` sites (AR-B3-2). Sweep affects B1's `checkTelemetryAuthBootConfig` siblings as well.
- **B2.x-1, B2.x-2** (carry from wiki/366): comment line-number drift at `server.ts:338` and `:347`; HANDOFF wording correction.

### Deferred conditionally (revisit if triggering condition appears)

- **Critic L2** — `Cache-Control: no-store` on `/summary` response. Add if `/summary` is ever placed behind a CDN; currently direct-to-Fly so cache headers are moot.
- **Critic L3** — structured audit logging of `/summary` access. Add if `/summary` becomes a high-frequency scrape target (e.g., Prometheus exporter); currently low-volume admin tool.
- **Rate-limiting on `/summary`** (wiki/367 §11 OQ-e): defense-in-depth deferred to follow-on. Express + `fly.toml` rate limiting at the platform layer is the current backstop.

### Sequencing forward (per master plan wiki/361)

- **B4a-c**: Windows installer + `accountKey` file persistence (wiki/363 Critic HIGH #1 follow-on).
- **B5**: telemetry image trim (`tsconfig.docker.json`).
- **V23.2 Workstream B final closure**: pulls from B1/B2/B3/B4/B5 closures; gates `main` merge.

### B1.x carry-forwards (still open from wiki/364)

B1.x-1 through B1.x-6 + B1.x-rotation: see wiki/364 §"Follow-on tickets". Unchanged by B3.

---

## What B3 does NOT do (explicit out-of-scope)

Mirroring wiki/364 §"What B1 does NOT do" + wiki/366 §"What B2 does NOT do" precedent format:

- **HMAC for `/summary`** — overscoped for a GET endpoint with no request body to bind. Bearer + constant-time-compare matches the threat model (admin tool, infrequent access, single operator-held secret).
- **Per-user admin roles** — single shared secret is sufficient for V23.2 operator-only access. Multi-operator + RBAC is V23.3+ scope.
- **Audit log in SQLite of `/summary` accesses** — Critic L3 deferred; revisit if endpoint becomes high-frequency.
- **Rate-limiting on `/summary`** — defense-in-depth; deferred to follow-on per wiki/367 §11 OQ-e.
- **Rotation automation for `MUSU_TELEMETRY_ADMIN_SECRET`** — manual `fly secrets set` is sufficient. Automated rotation is V23.3+.
- **CDN cache headers (`Cache-Control: no-store`)** — Critic L2 deferred until `/summary` sits behind a CDN.
- **OAuth/JWT** — overscoped for a single-secret admin tool. Bearer with constant-time-compare is the smallest construction satisfying the threat model.
- **HMAC_ONLY=1 cutover** — operator's `fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1` + `fly deploy`. Downstream of B3 push (wiki/364 §"Operational dependencies & rollout" + wiki/366 §"Operational dependency forward — HMAC_ONLY=1 cutover").
- **musu-pro changes** — B3 is musu-relay-only ("제품만 올리라고"; B2 was the only V23.2 workstream that touched musu-pro).
- **Schema migration** — no DB change; no Const III gate.
- **`main`-branch merge of `v22/gap-analysis`** — gated by V23.2 Workstream B final closure (separate doc), not B3.

---

## References / cross-doc links

- wiki/361 — V23.2 Workstream B master plan
- wiki/363 — V23.2 Workstream B1 detail plan
- wiki/364 — V23.2 Workstream B1 closure (HMAC write-auth; AR-1, AR-2, AR-3 carry-forwards)
- wiki/365 — V23.2 Workstream B2 detail plan
- wiki/366 — V23.2 Workstream B2 closure (`validateToken` fallback removal; AR-B2-1, AR-B2-2 carry-forwards; format reference)
- wiki/367 — V23.2 Workstream B3 detail plan (with §13 Critic Findings (resolved) table; embedded Critic patches H1, M1-M4)
- wiki/362 — V23.2 B0 closure (deployment validation baseline)
- Critic transcript (security-engineer, plan-time): in-session, wiki/367 §13 is the record
- Audit transcript (security-engineer, post-Builder): in-session, this closure is the audit-of-record
- Commit: `e63f329` on `v22/gap-analysis` (single commit, local, pending push)

### Files touched (B3 total)

| File | Change |
|---|---|
| `musu-relay/src/signaling/telemetry.ts` | `requireAdminSecret` middleware + `_warnedNoAdminSecret` flag at `:213` + WARN-once at `:273-280` + `checkTelemetryAuthBootConfig` extension + `/summary` route wiring + `_resetTelemetryAuthState` extension at `:445-448` + regex with `/i` flag at `:285` + comment update at `:208-209` |
| `musu-relay/tests/telemetry-summary-auth.test.ts` | NEW — 7 tests: 401 no-header, 401 empty Bearer, 401 wrong-secret, 200 valid Bearer, 200 lowercase `bearer` scheme (test 2b), 200 mixed-case scheme, dev-mode WARN-once |
| `musu-relay/tests/telemetry-auth.test.ts` | Rewrote `:109` single assertion into 2-part split at `:109-141` (401 + 200); added 4 new boot-config tests (case 7b at `:271-281`, case 8 at `:283-296`, plus 2 joint-axis combinations); modified 3 existing B1/B2 boot-configs to add `MUSU_TELEMETRY_ADMIN_SECRET` in joint-axis check |
| `musu-relay/tests/telemetry.test.ts` | Comment block at `:164-173` explaining dev-mode tolerance + cross-reference to `telemetry-summary-auth.test.ts` for 401 + 200 assertions |
| `docs/V23_2_WORKSTREAM_B3_PLAN_2026_05_16.md` | Modified — Critic resolutions embedded (H1 §5.3+§8; M1 §3 row 5; M2 §5.2; M3 §2.2+§5.1; M4 §5.4) |

Test count: 178 (post-B2, wiki/366) → **189** (post-B3). `tsc --noEmit` clean.

---

**End of B3 closure.** Ready for orchestrator-side commit of this doc + Const VII gate #3 push of `v22/gap-analysis` (single commit `e63f329`). Operator-side `MUSU_TELEMETRY_ADMIN_SECRET` set is the next downstream action; B3 plan completes the moment `e63f329` is pushed and the secret is provisioned in Fly Secrets before the next deploy.
