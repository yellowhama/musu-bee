# V23.2 Workstream B1 — Per-install HMAC closure (wiki/364)

**Date**: 2026-05-16
**Status**: Code-complete, dual-audited, audit-fix landed. Local on branch `v22/gap-analysis`; **not yet pushed** (operator push gate is feature-branch level; Const VII applies only on `main` merge).
**Predecessors**: wiki/361 (Workstream B master plan), wiki/363 (B1 detail plan with §"Critic Findings (resolved)"), wiki/362 (B0 closure — format reference), wiki/360 (Workstream B prep), wiki/359 (V23.2 A2 qual-eval)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/364`

---

## Summary

B1 replaces interim shared-secret telemetry auth with per-account HMAC, Stripe-shaped wire format (`X-Musu-Telemetry-Signature: t=<unix_seconds>,v1=<hex_hmac>`), keyed by canonical `user_id` returned from musu.pro `/validate` (B2-dependent in production; tests stub `validateToken`). Six implementation commits (`e51ae9b → f616c15`) plus one audit-fix commit (`e6e2caf`) landed on `v22/gap-analysis`. Test suite went from 157 (pre-B1) → 174 (post implementation) → **177 green** after audit-fix; `tsc --noEmit` clean. Dual-audit (two `security-engineer` passes, attack-surface and crypto-hygiene seeds) issued SHIP verdicts contingent on M1 (now closed). Three Critic HIGHs from wiki/363 confirmed RESOLVED by both auditors with file:line evidence. Ready for feature-branch push; main-branch merge gated by V23.2 Workstream B final closure (separate doc).

---

## Commit ledger

| # | SHA | Subject | Key files | Tests added |
|---|---|---|---|---|
| 1 | `e51ae9b` | raw body capture via `express.json` verify callback | `src/signaling/telemetry.ts:209`, `src/signaling/express-augment.d.ts` (new) | +3 in `telemetry-raw-body.test.ts` |
| 2 | `d19627b` | schema v40→v41 + `MIGRATION_V41_ACCOUNT_KEYS` sibling + Const III env-gate | `src/signaling/telemetry.ts:55-107` | +12 in `telemetry-migration.test.ts` |
| 3 | `2090983` | `requireInstallHmac()` middleware wired on `/install`, `/nat_pierce`, `/agent_spawn` | `src/signaling/telemetry.ts:151-346` | +21 in `telemetry-hmac.test.ts` |
| 4 | `918dcfe` | `/issue_install_key` route + race-fix try/catch + paranoid non-leak on 409 | `src/signaling/telemetry.ts:207-294, 621-652` | +14 in `issue-install-key.test.ts` |
| 5 | `9b96d29` | gateway-side HMAC emission + `bootstrapAccountKey()` | `src/gateway/client.ts:92-119, 153-157, 395-415, 407-480` | +11 in `telemetry-emit.test.ts` |
| 6 | `f616c15` | `MUSU_TELEMETRY_HMAC_ONLY` boot-config + strengthened fallthrough-guard | `src/signaling/telemetry.ts:191-203, 332-346` | +4 boot + 2 fallthrough = 6 in `telemetry-auth.test.ts` |
| 7 | `e6e2caf` | **AUDIT-FIX** — `forceRefresh=true` in `/v1/telemetry` adapter to bypass `validationCache` for `/issue_install_key` | `src/signaling/server.ts` (adapter section) | +3 in `tests/issue-install-key-cache-bypass.test.ts` |

Suite count: 157 → 174 (after commits 1–6) → **177** (after audit-fix commit 7). `tsc --noEmit`: clean.

---

## What changed end-to-end

### Wire format (Stripe-shaped, raw-body-bound)

Telemetry writes (`/install`, `/nat_pierce`, `/agent_spawn`) now carry:

```
X-Musu-User-Id: <canonical_user_id>
X-Musu-Telemetry-Signature: t=<unix_seconds>,v1=<lowercase_hex_hmac>
```

`v1 = HMAC_SHA256(account_key, "${t}." + raw_body_bytes)`. The signed string is the literal `t` + dot + raw request body — **not** re-stringified JSON. This is enforced on both sides via a single `rawBody` variable used in both HMAC compute and `fetch(..., { body: rawBody })` (client.ts:407-480) and via `express.json({ verify: (req,_res,buf) => { (req as any).rawBody = buf } })` on the server (telemetry.ts:209). Two regression tests pin the invariant: `telemetry-hmac.test.ts` includes a body-identity test where bytes are crafted to round-trip differently through `JSON.parse/stringify`; `telemetry-emit.test.ts` asserts the gateway uses the same string for HMAC input and HTTP body.

### Schema migration (v40 → v41, Const-III env-gated)

`MIGRATION_V41_ACCOUNT_KEYS` is a **sibling constant** to `MIGRATION_V40_TELEMETRY` (telemetry.ts:55-107), not inlined. `applyMigrations()` is exported (for test setup) and conditionally applies v41 only when `current < 41`. In production, the conditional refuses unless `MUSU_TELEMETRY_V41_AUTHORIZED=1` is set — belt-and-suspenders for a one-way schema change that the Const III gate prompt also guards procedurally.

Tests use `MUSU_TELEMETRY_DB=:memory:` and do not hit the production env-gate branch.

### Dual-accept rollout flag

`MUSU_TELEMETRY_HMAC_ONLY=1` (operator-set via `fly secrets`) flips the server from dual-accept (shared-secret OR HMAC) to HMAC-only. `checkTelemetryAuthBootConfig()` (telemetry.ts:191-203) now accepts production boot if EITHER `MUSU_TELEMETRY_SHARED_SECRET` is set OR `MUSU_TELEMETRY_HMAC_ONLY=1`; both unset → refuse-to-start with a FATAL line naming BOTH env vars.

### Bootstrap path (`/issue_install_key` + gateway `bootstrapAccountKey`)

New route accepts `{ tunnel_token, musu_install_id }`, validates the token via `validateToken()` (signaling/server.ts:99), derives canonical `user_id`, and UPSERTs `telemetry_account_keys`. Status codes: 200 first-issue, 409 already-exists (does **not** leak existing key — only `issued_at`), 503 `valid=true, userId=null` (Design A — refuses v21-era fallback), 502 upstream error, 401 token rejected, 400 missing body. The INSERT is wrapped in try/catch on both `SQLITE_CONSTRAINT_PRIMARYKEY` and `SQLITE_CONSTRAINT_UNIQUE` and re-SELECTs the winner's row to produce 409 (telemetry.ts:621-652).

Gateway-side: `GatewayClient` config gains `accountKey?: string`. If unset on `connect()`, `bootstrapAccountKey()` POSTs to `/issue_install_key`. 200 stores the key in **memory only** (file persistence deferred to B4b per Critic HIGH #1 resolution); 409 hard-fails with a directive to wire the config or rotate via B4b installer; 503 disables telemetry but lets the gateway proceed; 401/network failures are logged + retried per the gateway's existing reconnect cadence (client.ts:407-480).

### "제품만 올리라고" boundary preserved

B1 is entirely within `musu-relay/` (signaling server + gateway). Zero changes in `musu-bee/`. musu-pro changes for `validateToken` to return canonical `user_id` are the B2 workstream and remain pre-deploy-blocking for HMAC_ONLY cutover.

---

## Critic Findings (resolved) — verified by Audit

The wiki/363 §"Critic Findings (resolved)" table is reproduced below with an added "Verified by Audit" column. File:line citations are from both auditors' independent passes.

| # | Sev | Section | Finding | Plan-time resolution | Verified by Audit |
|---|---|---|---|---|---|
| 1 | HIGH | §6.3, §11 | Windows ACL: `fs.chmod(0o600)` no-op; `%LOCALAPPDATA%\musu\account_key` would be user/admin-readable | B1 defers file persistence to B4b; in-memory only; 409 hard-fails | **Confirmed**: client.ts:153-157, 407-480 show no `fs.writeFile`/`fs.readFile` for `accountKey`; tests/telemetry-emit.test.ts:776-809 assert in-memory-only and 409 hard-fail message |
| 2 | HIGH | §5 invariant | Server cannot enforce "row exists → refuse shared-secret" if `X-Musu-User-Id` header absent | Invariant weakened to "header-present ∧ row-exists → HMAC mandatory"; closed by HMAC_ONLY=1 cutover | **Strengthened beyond plan**: commit `f616c15` added a fallthrough-guard at telemetry.ts:332-346 so that an HMAC-headered request for an **unknown** `user_id` always 401s (closing the shared-secret-forges-HMAC-headers bypass the wiki/363 wording left ajar). Regression at tests/telemetry-hmac.test.ts:436-473 |
| 3 | HIGH | §3.3 race | INSERT throws on UNIQUE conflict; route 500s instead of 409 | try/catch on SQLITE_CONSTRAINT_PRIMARYKEY; re-SELECT existing `issued_at` for 409 | **Confirmed + extended**: telemetry.ts:621-652 catches BOTH `SQLITE_CONSTRAINT_PRIMARYKEY` and `SQLITE_CONSTRAINT_UNIQUE`; paranoid non-leak (only `issued_at`, never `account_key`). Regression at tests/issue-install-key.test.ts:271-294 (race) and :296-316 (paranoid-non-leak) |
| 4 | MED | §3.1 raw-key storage | Override of master-plan "store hash" needs HKDF alt explicitly rejected | §3.1 note added: HKDF needs stored IKM; same threat model, more complexity | Auditor B M-B1 accepted-risk (see §"Accepted-risk register") |
| 5 | MED | §9 Const III | No defensive in-code check if operator `fly deploy`s without prompt | env-gate `MUSU_TELEMETRY_V41_AUTHORIZED=1` in `applyMigrations()` | **Confirmed**: telemetry.ts conditional in v41 branch; tests/telemetry-migration.test.ts covers prod-without-env-var refuse path |
| 6 | MED | §1 ordering | Master plan §Sequencing still shows B2 ∥ B1 parallel — wrong after Design A | Master plan note required (carry into closure) | **This doc** — see §"Operational dependencies & rollout" below |
| 7 | MED | §6.3 + §10 + §11 | Scope creep — migration + endpoint + rotation + persistence + boot-config + dual-accept | Two cuts: file persistence to B4b; rotation to B1.x | Rotation header path **not present in any of the 7 commits**; B4b deferral confirmed via Finding #1 evidence |
| 8 | LOW | §3.1 collation | SQLite TEXT default BINARY — non-issue | No change | n/a |
| 9 | LOW | §12 #7 | Rotation rate-limiting — out of B1 scope | Document; defer | n/a (rotation itself deferred) |
| 10 | LOW | §2.1 header | `X-Musu-User-Id` privacy in proxy logs — synthetic id, acceptable | No change | Auditor B INFO accepted; user_ids are opaque ULID-shaped |

---

## Dual-audit results

Two `security-engineer` auditors ran in parallel on the combined diff of commits #1-#6 (pre-audit-fix). Per MODE_Agent_Team.md, both auditors received wiki/363 as PRIOR ARTIFACTS so they could verify the Critic HIGHs.

### Auditor A — attack-surface seed

Verdict: **SHIP-OK contingent on M1 audit-fix**. M1 (MEDIUM, blocking): an attacker holding any valid tunnel-token could prime `validationCache` via WS HELLO carrying `user_id: VICTIM_ID` under the v21-era fallback, then POST `/issue_install_key` and squat the victim's `telemetry_account_keys` row before the victim ever bootstraps. The cache hit at the `/v1/telemetry` adapter layer skipped a fresh `validateToken` call, so the attacker's pre-primed cache entry passed.

LOW/INFO carry-forward (4 items, scoped to B1.x):

- **L1** — `bootstrapAccountKey` 200-path `await resp.json()` not wrapped in try/catch; a malformed signaling response (proxy injecting HTML) would surface as `SyntaxError` during gateway connect, turning a telemetry misconfig into a signaling outage (client.ts:407-480). Recommend wrap + treat parse failure as `disable telemetry, proceed`.
- **L2** — `requireInstallHmac` returns 500 on non-JSON `Content-Type` rather than 415. Acts as a route-fingerprint oracle (500 vs 401 reveals presence of the HMAC middleware). Recommend 415.
- **L3** — No defense-in-depth comment in `server.ts` warning future contributors against a global `app.use(express.json())` above the telemetry router. A global parser would strip the `req.rawBody` capture silently. Recommend a 3-line comment block.
- **L4** — `checkTelemetryAuthBootConfig` could log a WARN (not fatal) when `MUSU_TELEMETRY_HMAC_ONLY=1` ∧ `SELECT COUNT(*) FROM telemetry_account_keys = 0` — meaning the operator flipped HMAC-only before a single account bootstrapped, locking all gateways out. Loud-and-survivable beats silent-and-correct here.

### Auditor B — crypto-hygiene + defense-in-depth seed

Verdict: **SHIP** (no blockers). 3 MEDIUMs (all classified as accepted-risk or follow-on, none gating B1):

- **M-B1** — plaintext `account_key` at rest in SQLite. **Accepted-risk** (HMAC mathematically requires raw key bytes; Stripe/GitHub/Twilio precedent). Document explicitly in the accepted-risk register. Envelope encryption is B3/V23.3 scope.
- **M-B2** — v40 `CREATE IF NOT EXISTS` `INSERT OR IGNORE` (idempotent) runs **before** the v41 Const III env-gate check. An unauthorized production instance touches 1 row of the production DB (the v40 `schema_version` row) before refusing v41. Concretely: the row-touch is the `INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (40, ...)` call. Recommend wrapping in `if (current === 0)` to make the unauthorized path strictly read-only. Follow-on B1.x.
- **M-B3** — `validateToken` adapter normalization is narrow: whitespace, the literal string `"null"`, and BOM-prefixed user_ids slip through as primary-key values into `telemetry_account_keys`. Recommend `trim()` + denylist (`["", "null", "undefined"]`). Follow-on B1.x.

LOW/INFO (accepted-risks, no follow-on planned):

- 401 messages on `requireInstallHmac` differentiate "missing", "malformed", "expired", "unknown account", "invalid signature" — acts as an oracle. **Accepted** given user_ids are opaque ULID-shaped and the bandwidth-budget for differential probing is bounded by Fly's rate limits. Tighten only if user_ids become guessable.
- No string-zeroization on gateway close. V8/JS limitation (GC-managed strings cannot be reliably wiped). Mitigation lives at OS layer via Fly's core-dump policy.
- Signature regex `^t=(\d+),v1=([0-9a-f]+)$` is anchored at both ends and on a fixed-prefix slow path; no ReDoS exposure.

### Disagreement resolution

Auditor A flagged M1 as MEDIUM-blocking; Auditor B's seed focused on crypto hygiene and didn't traverse the cache path. Per MODE_Agent_Team.md "one auditor flags ∧ other is silent → finding stays": M1 stayed, fixed in commit `e6e2caf`. No other disagreements required orchestrator adjudication. Both auditors independently confirmed all 3 Critic HIGHs RESOLVED (see Critic Findings table above for file:line citations).

---

## Audit-fix commit detail — `e6e2caf`

**Attack chain.** v21 deployed `validateToken()` as the WS-HELLO authorizer with a per-token in-memory `validationCache` (TTL ~5min, `DEGRADED_GRACE_MS` extending the window on upstream errors). The `/v1/telemetry` adapter in `server.ts` re-used the same `validateToken` to authorize `/issue_install_key`. Under the v21-era fallback, `validateToken` would return `{ valid: true, userId: null }` for any well-formed tunnel_token. The adapter, however, passed the HELLO-claimed `user_id` straight through. An attacker could (a) open a WS connection with their own valid tunnel_token, HELLO with `user_id: VICTIM_ID`, priming `validationCache` for that token to map to `VICTIM_ID`; (b) within the cache window, POST `/v1/telemetry/issue_install_key` with the same token — the adapter sees the cached `{ valid: true, userId: VICTIM_ID }` and `INSERT`s an attacker-controlled `account_key` keyed on `VICTIM_ID`. Once the legitimate victim later tries to bootstrap, they get 409 (paranoid-non-leak: no key returned), and their gateway hard-fails per the B1 design. Result: victim locked out of HMAC telemetry; attacker-controlled key accepted by `requireInstallHmac`.

**Fix.** The `/v1/telemetry` adapter in `server.ts` now passes `forceRefresh=true` to `validateToken()` when invoked from the `/issue_install_key` path, bypassing `validationCache` and forcing a live musu.pro `/validate` round-trip. The cache remains in place for the WS-HELLO hot path (its original purpose); the bootstrap path is the only consumer of `forceRefresh=true`.

**Regression test.** `tests/issue-install-key-cache-bypass.test.ts` (new, 3 tests). Two of them are deliberately load-bearing: one asserts `503` is returned when the upstream `/validate` returns `userId=null` even though the cache was pre-primed with `VICTIM_ID`; the other asserts `fetch` was called against `/validate` (cache bypass evidence). If a future refactor drops `forceRefresh=true`, both tests fail — the cache hit would silently pass the request, returning 200 with no fetch call. Belt-and-suspenders: a third test asserts the cache entry for the attacker token still exists after the bootstrap call (cache is preserved for HELLO, only bypassed for the issue call).

---

## Accepted-risk register

Three items the team has explicitly accepted for the V23.2 cutover. Each entry: the risk, why accepted, and the revisit trigger.

### AR-1 — plaintext `account_key` at rest in SQLite

- **Risk**: a read of `/data/telemetry.db` on the Fly volume yields password-equivalent HMAC keys for every bootstrapped account. Anyone with that file can forge telemetry POSTs as those accounts.
- **Why accepted**: HMAC verification mathematically requires the raw key bytes server-side. Storing a hash makes HMAC impossible (you can't HMAC with a hash). Stripe, GitHub, and Twilio all store webhook signing secrets in plaintext under the same trust boundary. The mitigation is DB access control: only the signaling process (uid 1001 on Fly) reads/writes the file; Fly volumes are not snapshot to a cross-tenant location.
- **Revisit trigger**: Workstream B3 / V23.3 introduces envelope encryption (KEK in Fly Secrets, DEK encrypting the column). Revisit also if Fly's volume-isolation guarantees materially change, or if a different threat actor (insider, sidecar process) enters the model.

### AR-2 — 401 oracle messages

- **Risk**: `requireInstallHmac` distinguishes "missing signature", "malformed signature", "expired or future-dated signature", "unknown account", "invalid signature". An attacker probing the endpoint can determine which user_ids have issued keys (the differential between "unknown account" and "invalid signature").
- **Why accepted**: user_ids are opaque ULID-shaped, 26 chars, not derivable from email/username. Probing space is `2^128`; even unbounded scanning is not practical, and Fly's per-IP rate limits cap probe rates further. Operationally, "unknown account" vs "invalid signature" is high-value for debugging an installer that hasn't bootstrapped vs one that has but is misconfigured.
- **Revisit trigger**: if user_ids ever become guessable (sequential, email-derived, exposed in URLs), collapse all five 401 messages to a single `{ "error": "unauthorized" }` and rely on server logs for differentiation.

### AR-3 — no V8 string-zeroization on gateway close

- **Risk**: `accountKey` lives as a JS string in `GatewayClient`. On crash/dump, the string is recoverable from a core dump of the gateway process.
- **Why accepted**: V8/JS language limitation. Strings are GC-managed immutable values; there is no reliable wipe primitive. Even `Buffer.from(key).fill(0)` doesn't zero the source string. Industry-standard mitigation lives at the OS layer.
- **Revisit trigger**: if gateways begin shipping into hostile environments where core dumps could be exfiltrated (we're currently in dev machines + Fly signaling itself), revisit at the OS/container layer: set `RLIMIT_CORE=0`, disable Fly's crash reporting for the relevant process group.

---

## Follow-on tickets

### B1.x (this workstream, near-term)

- **B1.x-1**: Auditor A L1 — wrap `bootstrapAccountKey` 200-path `resp.json()` in try/catch; treat parse failure as "disable telemetry, proceed".
- **B1.x-2**: Auditor A L2 — return 415 (not 500) on non-JSON `Content-Type` to `/install`, `/nat_pierce`, `/agent_spawn`.
- **B1.x-3**: Auditor A L3 — add defense-in-depth comment block above the telemetry router mount in `server.ts` warning against a global `express.json()`.
- **B1.x-4**: Auditor A L4 — `checkTelemetryAuthBootConfig` emits WARN (non-fatal) when `MUSU_TELEMETRY_HMAC_ONLY=1` ∧ `telemetry_account_keys` count is 0.
- **B1.x-5**: Auditor B M-B2 — wrap v40 `INSERT OR IGNORE INTO schema_version` in `if (current === 0)` so unauthorized production instance is strictly read-only before the Const III env-gate refuses v41.
- **B1.x-6**: Auditor B M-B3 — `validateToken` adapter user_id normalization: `trim()` + denylist `["", "null", "undefined"]` before INSERT to `telemetry_account_keys`.
- **B1.x-rotation** (existing carry from wiki/363): `X-Musu-Rotate: 1` route path + rate-limiter ("1 rotation per user per minute") + `musu-cli rotate-telemetry-key` consumer.

### B3 / V23.3 (future workstreams)

- **B3-envelope** (Auditor B M-B1): envelope encryption for `account_key` at rest. KEK in Fly Secrets, DEK encrypting the column. Design with key-rotation and online migration.
- **B3-summary** (existing master plan §B3): `/v1/telemetry/summary` HMAC auth (currently still public per wiki/363 §4).

---

## Operational dependencies & rollout

The wiki/363 §1 Design A dependency made explicit, generalized from Auditor A's "Verdict if M1 deferred" reasoning:

**B2 (musu-pro `/validate` returns canonical `user_id`) must be deployed and live for at least `CACHE_TTL_MS + DEGRADED_GRACE_MS` (~5min30s) before flipping `MUSU_TELEMETRY_HMAC_ONLY=1`** on the signaling deployment. The cache-window drain ensures no stale fallback-provenance entries (`{ valid: true, userId: null }`) survive into the HMAC-only enforcement window. Without the drain, gateways that bootstrapped in the cache-overlap window could hold an `account_key` keyed on a `null` user_id slot — an undefined state.

The Const III prompt remains required at v41 migration apply time. Concretely: on the first `fly deploy` after this branch lands, the orchestrator emits the wiki/363 §9 prompt; operator replies `진행해`; operator sets `fly secrets set MUSU_TELEMETRY_V41_AUTHORIZED=1`; `fly deploy` proceeds.

**Master plan correction**: wiki/361 §"Sequencing + dependencies" still shows B1 ∥ B2 parallel. Per Critic MEDIUM #6 (wiki/363 §"Critic Findings (resolved)") this is **technically true for code** (B1 code can be written and unit-tested with `validateToken` stubbed) but **false for production cutover**. Action item: add a footnote to the wiki/361 sequencing graph noting "B2 must precede HMAC_ONLY=1 cutover". Not in scope for this closure doc; carried as a one-line patch to wiki/361.

---

## What B1 does NOT do (explicit out-of-scope)

Mirroring master plan §"Sequencing" and the wiki/363 §"Critic Findings (resolved)" scope-creep cut (Finding #7):

- **No file persistence of `accountKey`** (B4b — installer-side ACL story; `icacls` + `chmod 0600` cross-platform)
- **No `X-Musu-Rotate: 1` route path** (B1.x follow-on commit; no current consumer)
- **No `/v1/telemetry/summary` HMAC auth** (B3 — separate workstream)
- **No telemetry image trim** (B5)
- **No Windows installer** (B4b)
- **No envelope encryption of `account_key`** (B3 / V23.3 — see AR-1)
- **No rotation rate limiting** (B1.x-rotation; documented in wiki/363 §12)
- **No nonce store** (300s replay window only; B3 or later if duplicate-row consequence becomes significant)
- **musu-pro zero changes** in B1 ("제품만 올리라고" — B2 is the musu-pro workstream)

---

## References / cross-doc links

- wiki/361 — V23.2 Workstream B master plan
- wiki/363 — V23.2 Workstream B1 detail plan (includes §"Critic Findings (resolved)" table)
- wiki/362 — V23.2 B0 closure (format reference for this doc)
- wiki/360 — V23.2 Workstream B prep / sub-workstream sequencing
- wiki/359 — V23.2 A2 qualitative evaluation (predecessor)
- Auditor A transcript (attack-surface seed): in-session, this closure is the audit-of-record
- Auditor B transcript (crypto-hygiene seed): in-session, this closure is the audit-of-record
- Commit range: `e51ae9b..e6e2caf` on `v22/gap-analysis`

---

## Files touched (B1 total)

| File | Change |
|---|---|
| `musu-relay/src/signaling/telemetry.ts` | Crypto imports; `MIGRATION_V41_ACCOUNT_KEYS`; `applyMigrations` exported + env-gated v41; `requireInstallHmac`; fallthrough-guard; `/issue_install_key`; `checkTelemetryAuthBootConfig` extension; `express.json` verify callback |
| `musu-relay/src/signaling/express-augment.d.ts` | NEW — type augmentation for `req.rawBody: Buffer` |
| `musu-relay/src/signaling/server.ts` | `/v1/telemetry` adapter passes `forceRefresh=true` to `validateToken` for `/issue_install_key` (audit-fix `e6e2caf`) |
| `musu-relay/src/gateway/client.ts` | Remove `telemetrySharedSecret`; add `accountKey`; `bootstrapAccountKey()`; HMAC header construction; body-identity invariant |
| `musu-relay/tests/telemetry-raw-body.test.ts` | NEW — 3 raw-body capture tests |
| `musu-relay/tests/telemetry-migration.test.ts` | NEW — 12 v41 migration + Const III env-gate tests |
| `musu-relay/tests/telemetry-hmac.test.ts` | NEW — 21 `requireInstallHmac` tests including body-identity regression |
| `musu-relay/tests/issue-install-key.test.ts` | NEW — 14 tests including race + paranoid-non-leak |
| `musu-relay/tests/telemetry-emit.test.ts` | +11 gateway-side HMAC emission tests including body-identity regression |
| `musu-relay/tests/telemetry-auth.test.ts` | +6 boot-config + fallthrough-guard tests |
| `musu-relay/tests/issue-install-key-cache-bypass.test.ts` | NEW — 3 audit-fix regression tests (load-bearing on `forceRefresh=true`) |

Test count: 157 (pre-B1) → 174 (post commits #1-#6) → **177 (post audit-fix `e6e2caf`)**. `tsc --noEmit` clean across all 7 commits.

---

**End of B1 closure.** Ready for orchestrator-side commit of this doc + push of `v22/gap-analysis`. Const VII (main-branch merge) is gated on V23.2 Workstream B final closure, not this doc.
