# V23.2 Workstream B1 — Per-install HMAC detail plan (wiki/363)

**Date**: 2026-05-16
**Status**: Plan-mode draft. **Post-Critic** (system-architect, 3 HIGH/3 MEDIUM/3 LOW; HIGH all resolved via user decision + plan edits, see §"Critic Findings (resolved)" at bottom). Pre-Builder. **Const III gate not yet requested.**
**Predecessors**: wiki/361 (master plan), wiki/362 (B0 closure), wiki/358–359 (A2 closure + qual-eval)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/363`

## 1. Context

Master plan §B1 said "per-install HMAC, keyed by `musu_install_id`". User has since corrected this: **keys are owned by the user account, not the install**. Quote: "계정으로 로그인 — 계정에 연결된 키가 가게."

Concrete consequences vs master plan §B1:

1. The table called `telemetry_install_keys` in the master plan §B1 SQL is **renamed `telemetry_account_keys`**, primary key `user_id` (canonical, from musu.pro `/validate`), not `musu_install_id`.
2. `/issue_install_key` accepts a **musu.pro tunnel token**, not an installer-bundled secret. The server `validateToken()`s it (reusing `musu-relay/src/signaling/server.ts:99` `validateToken`), derives the canonical `user_id`, and UPSERTs the key keyed on that `user_id`.
3. Same account on N machines = N installs sharing one HMAC key. This is a property, not a bug.
4. Wire format keeps `musu_install_id` in the request body (it's the install correlation key for telemetry rows), but the HMAC key lookup happens by `user_id` carried in a new header.
5. **Ordering flip**: this design depends on `validateToken()` returning a non-null canonical `user_id`. Today (per `server.ts:140-152`) musu.pro `/validate` does NOT return `user_id` and the code falls back to the HELLO-claimed id. That means B2 (musu.pro 3-line change) **must precede the production rollout of B1 HMAC enforcement**, even though the B1 code can be written and unit-tested in parallel.

**Resolution of the ordering dilemma**: **Design A (depend on B2 in production).**

Justification:
- The user said "계정에 연결된 키가 가게" — the invariant is *the same account = the same key*. Design B (token-hash surrogate) breaks that invariant precisely at the moment B2 lands: any user whose pre-B2 key was derived from `SHA-256(token)[:16]` would on first post-B2 call get a fresh key keyed on the canonical `user_id`, and the old hash would be orphaned. Two users who share a token (impossible by design but) or one user who rotates tokens would each get separate keys forever. That is the failure mode the user explicitly rejected.
- Design A's "B1 dead in prod until B2 deploys" is not actually that costly: musu-pro B2 is documented in master plan §B2 as a 3-line change. It can land as a separate PR ahead of B1 enforcement.
- Dual-accept (per-user marker + operator flag) bridges the brief window between "B1 code on Fly" and "B2 musu-pro deploy live" without compromising the invariant. During that window, no user has yet completed `/issue_install_key` (it 503s if `userId` is null), so shared-secret remains the only path. Once B2 is live, gateways begin to migrate.

**Test-time exception**: in tests, `validateToken()` is stubbed; the test mock returns whatever `userId` the test sets. Design A is only a production constraint.

## 2. Wire format spec (Stripe-shaped)

### 2.1 Headers on write endpoints (`/install`, `/nat_pierce`, `/agent_spawn`)

```
X-Musu-Telemetry-Signature: t=<unix_seconds>,v1=<lowercase_hex_hmac>
X-Musu-User-Id: <canonical_user_id>          # lookup key into telemetry_account_keys
Content-Type: application/json
```

- `t` = Unix epoch **seconds** (not ms). Stripe matches.
- `v1` = `hex(HMAC_SHA256(account_key, t + "." + raw_body_bytes))`. Lowercase, no padding, no prefix.
- `account_key` = the 32-byte (256-bit) value the server returned from `/issue_install_key`. Stored client-side; server stores it raw (see §5 — supersedes master plan's "store hash" guidance, **Critic-bait #1**).
- HMAC input is **raw request body bytes**, not re-stringified JSON. Re-stringification reorders keys / changes whitespace and breaks the hash.

### 2.2 Replay window

- Server accepts `|now - t| ≤ 300s` (Stripe standard).
- Outside the window → 401 with body `{ "error": "expired or future-dated signature" }`. No echo of `t` or `now`.
- No nonce store (300s is the only replay defense). If post-B1 audit wants a nonce cache, B3 or later.

### 2.3 Concrete example bytes

```
POST /v1/telemetry/nat_pierce HTTP/1.1
Host: signaling.musu.pro
Content-Type: application/json
X-Musu-User-Id: usr_01HXYZK7Q9F2RZJ3M4
X-Musu-Telemetry-Signature: t=1747396800,v1=4f3a...e9
Content-Length: 132

{"musu_install_id":"inst-abc","attempt_outcome":"success","fail_cause":null,"ice_candidate_count":3,"elapsed_ms":1842}
```

Server reconstructs the signed string as the literal bytes `1747396800.` followed by the raw 132-byte body, then `HMAC_SHA256(account_key, that_string)`.

### 2.4 `/issue_install_key` request/response

```
POST /v1/telemetry/issue_install_key HTTP/1.1
Content-Type: application/json
{
  "tunnel_token": "<musu.pro paid-tier token>",
  "musu_install_id": "inst-abc"     // hint only; stored on first-issue for support diag
}
```

200 OK on fresh issuance:
```
{
  "account_key": "<64-hex chars>",
  "user_id": "usr_01HXYZK7Q9F2RZJ3M4",
  "issued_at": 1747396800
}
```

Status codes:
- 200 on first-issuance for a user_id
- 409 if a key already exists for this user_id (does not return the key; client must persist it on first issuance OR call with `X-Musu-Rotate: 1`)
- 400 if body is missing `tunnel_token`
- 401 if token rejected by `validateToken`
- 503 if `validateToken` returns `valid=true` but `userId=null` (Design A — refuses to issue against the v21-era fallback)
- 502 if `validateToken` upstream errored (circuit open)

**Rotation**: explicit opt-in via `X-Musu-Rotate: 1` header. Same code path, DELETE+INSERT, returns new key. Old key invalidated atomically.

## 3. Schema v41 DDL + migration code pattern

### 3.1 Table

```sql
CREATE TABLE IF NOT EXISTS telemetry_account_keys (
  user_id           TEXT PRIMARY KEY,        -- canonical id from musu.pro /validate
  account_key       TEXT NOT NULL,           -- 64-char lowercase hex; password-equivalent
  first_install_id  TEXT NOT NULL,           -- diag hint; install_id seen at issue time
  issued_at         INTEGER NOT NULL,        -- unix ms (matches other telemetry tables)
  last_seen_at      INTEGER,                 -- unix ms; updated on each successful auth
  rotated_at        INTEGER                  -- non-null after a rotation event
);
CREATE INDEX IF NOT EXISTS idx_account_keys_last_seen
  ON telemetry_account_keys(last_seen_at);
```

**Threat model note**: `account_key` stored as plaintext hex, not SHA-256 hash. This **overrides master plan §B1** which said "Storing SHA-256(install_key) not the key itself." The override is forced by HMAC: you cannot HMAC with a hash. Stripe, GitHub, Twilio all store webhook signing secrets in plaintext in their databases; the trust boundary is database access control, not at-rest encryption of the column. Rotation invalidates compromised keys.

**HKDF alternative rejected (Critic MEDIUM resolved)**: an HKDF-derived per-request key would still need stored IKM (input keying material) somewhere; RFC 5869 makes this explicit. Moving the at-rest secret one layer down doesn't reduce exposure, just adds derivation complexity. Same threat model, more code. The override stands.

See §12 Critic-bait #1 for original framing.

### 3.2 Migration code (sibling constant, conditional exec)

In `src/signaling/telemetry.ts`, **next to** `MIGRATION_V40_TELEMETRY`, add `MIGRATION_V41_ACCOUNT_KEYS` as a sibling, not inlined into v40:

```typescript
const MIGRATION_V41_ACCOUNT_KEYS = `
CREATE TABLE IF NOT EXISTS telemetry_account_keys ( ... );
CREATE INDEX IF NOT EXISTS idx_account_keys_last_seen ...;
`;

function applyMigrations(d: Database.Database): void {
  // v40 baseline (already CREATE IF NOT EXISTS, idempotent)
  d.exec(MIGRATION_V40_TELEMETRY);
  d.prepare("INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)").run(40, Date.now());

  // v41 conditional
  const current = (d.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null }).v ?? 0;
  if (current < 41) {
    d.exec(MIGRATION_V41_ACCOUNT_KEYS);
    d.prepare("INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)").run(41, Date.now());
  }
}
```

Sibling constant + version-gated exec keeps v40 unchanged so older dev DBs upgrade cleanly and the v40 audit fingerprint remains stable.

### 3.3 Idempotency for `/issue_install_key`

Two-step pattern (SELECT then INSERT) — single-statement UPSERT...RETURNING doesn't fit because we need to return the **raw key** on first issue but **only signal collision** on second call:

```typescript
const existing = db.prepare(
  "SELECT issued_at FROM telemetry_account_keys WHERE user_id = ?"
).get(userId) as { issued_at: number } | undefined;

if (existing && !rotateRequested) {
  res.status(409).json({
    error: "account_key already issued for this user_id",
    issued_at: existing.issued_at,
    hint: "persist account_key on first issuance, OR re-issue with X-Musu-Rotate: 1",
  });
  return;
}

const fresh = crypto.randomBytes(32).toString("hex");
if (rotateRequested) {
  db.prepare("DELETE FROM telemetry_account_keys WHERE user_id = ?").run(userId);
}
db.prepare(`
  INSERT INTO telemetry_account_keys
    (user_id, account_key, first_install_id, issued_at, rotated_at)
  VALUES (?, ?, ?, ?, ?)
`).run(userId, fresh, installIdHint, Date.now(), rotateRequested ? Date.now() : null);

res.status(200).json({
  account_key: fresh,
  user_id: userId,
  issued_at: Math.floor(Date.now() / 1000),
});
```

**Race condition fix (Critic HIGH #3 resolved)**: the INSERT must be wrapped in try/catch. On `SQLITE_CONSTRAINT_PRIMARYKEY` the loser re-SELECTs and returns 409 with the existing row's `issued_at`. Without this the loser route handler 500s with an unhelpful body.

```typescript
const fresh = crypto.randomBytes(32).toString("hex");
try {
  db.prepare(`
    INSERT INTO telemetry_account_keys
      (user_id, account_key, first_install_id, issued_at, rotated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, fresh, installIdHint, Date.now(), rotateRequested ? Date.now() : null);
} catch (err) {
  if (err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
    const winner = db.prepare(
      "SELECT issued_at FROM telemetry_account_keys WHERE user_id = ?"
    ).get(userId) as { issued_at: number } | undefined;
    res.status(409).json({
      error: "account_key already issued for this user_id",
      issued_at: winner?.issued_at ?? null,
    });
    return;
  }
  throw err;  // unexpected DB error → 500
}
res.status(200).json({
  account_key: fresh,
  user_id: userId,
  issued_at: Math.floor(Date.now() / 1000),
});
```

This handles both the multi-machine scenario AND the single-machine double-click installer scenario. better-sqlite3 is synchronous but Express request handling is not — two parallel POSTs from one client can race the same SELECT-INSERT gap.

## 4. Routes added/changed

| Route | Before | After |
|---|---|---|
| `POST /v1/telemetry/issue_install_key` | (does not exist) | **NEW**. Body `{tunnel_token, musu_install_id}`. Returns `{account_key, user_id, issued_at}` (200) or 401/409/503. |
| `POST /v1/telemetry/install` | `requireTelemetrySecret` | `requireInstallHmac` (dual-accept fallback to shared-secret only if user has no row AND `MUSU_TELEMETRY_HMAC_ONLY != "1"`) |
| `POST /v1/telemetry/nat_pierce` | same | same |
| `POST /v1/telemetry/agent_spawn` | same | same |
| `GET /v1/telemetry/summary` | public | **unchanged in B1.** B3 owns this. |

Status code conventions for `requireInstallHmac`:
- Missing both `X-Musu-User-Id` and `X-Musu-Telemetry-Signature` → 401 `{"error":"missing signature"}` (or dual-accept fallback to `requireTelemetrySecret`, see §5)
- Header present but malformed → 401 `{"error":"malformed signature"}`
- `t` outside ±300s → 401 `{"error":"expired or future-dated signature"}`
- `X-Musu-User-Id` not in `telemetry_account_keys` and `MUSU_TELEMETRY_HMAC_ONLY=1` → 401 `{"error":"unknown account"}`
- Signature mismatch → 401 `{"error":"invalid signature"}`
- Valid → continue, also `UPDATE telemetry_account_keys SET last_seen_at = ? WHERE user_id = ?`

## 5. Server middleware — `requireInstallHmac()`

```
function requireInstallHmac(req, res):
  // Raw body MUST already be captured. Router-level express.json must use
  // { verify: (req,_res,buf) => { (req as any).rawBody = buf } }. Without it
  // the HMAC input is meaningless.
  if (!req.rawBody) → 500 internal "raw body not captured" (dev assertion)

  userId = req.header("x-musu-user-id")
  sigHdr = req.header("x-musu-telemetry-signature")

  if dual-accept enabled (MUSU_TELEMETRY_HMAC_ONLY != "1") AND no userId+sigHdr present:
     return requireTelemetrySecret(req, res)   // legacy shared-secret path

  if !userId or !sigHdr → 401 "missing signature"

  parsed = parseSigHeader(sigHdr)   // {t: number, v1: hex-string} | null
  if !parsed → 401 "malformed signature"

  now = floor(Date.now() / 1000)
  if abs(now - parsed.t) > 300 → 401 "expired or future-dated signature"

  row = db.prepare("SELECT account_key FROM telemetry_account_keys WHERE user_id = ?").get(userId)
  if !row:
    if MUSU_TELEMETRY_HMAC_ONLY = "1" → 401 "unknown account"
    else: return requireTelemetrySecret(req, res)   // dual-accept fallthrough

  // Dual-accept invariant (Critic HIGH #2 resolved, weakened):
  //   "if X-Musu-User-Id header is present AND a row exists for that user_id,
  //    HMAC is mandatory."
  // A request with NO X-Musu-User-Id header is anonymous from the server's
  // perspective — even if the underlying user happens to have issued a key,
  // there's no way to identify them without the header. Such requests fall
  // through to requireTelemetrySecret (the legacy gateway path). This is
  // closed by MUSU_TELEMETRY_HMAC_ONLY=1 at full cutover (§8 step 4).

  signedString = Buffer.concat([Buffer.from(String(parsed.t) + "."), req.rawBody])
  expectedHmac = createHmac("sha256", row.account_key).update(signedString).digest()
  suppliedHmac = Buffer.from(parsed.v1, "hex")

  if suppliedHmac.length !== expectedHmac.length → 401 "invalid signature"
  if !timingSafeEqual(suppliedHmac, expectedHmac) → 401 "invalid signature"

  db.prepare("UPDATE telemetry_account_keys SET last_seen_at = ? WHERE user_id = ?")
    .run(Date.now(), userId)
  return true
```

## 6. Gateway client changes

### 6.1 Config changes (`src/gateway/client.ts:92-119`)

Remove:
- `telemetrySharedSecret?: string;` (line 113)

Add:
- `accountKey?: string;` — 64-hex chars, returned by `/issue_install_key`
- `userId: string` is already present (line 95); reused as the `X-Musu-User-Id` header value

### 6.2 Header construction (`client.ts:397-414`)

Replace:

```typescript
if (this.cfg.telemetrySharedSecret) {
  headers["x-musu-telemetry-secret"] = this.cfg.telemetrySharedSecret;
}
```

With:

```typescript
if (this.cfg.accountKey) {
  const t = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(record);           // exact bytes we'll ship
  const signedString = `${t}.${rawBody}`;
  const v1 = crypto.createHmac("sha256", this.cfg.accountKey)
                   .update(signedString)
                   .digest("hex");
  headers["x-musu-user-id"] = this.cfg.userId;
  headers["x-musu-telemetry-signature"] = `t=${t},v1=${v1}`;
}
// ... and use `body: rawBody` (NOT a second JSON.stringify) on the fetch call.
```

The `body:` arg must be the **same `rawBody` string** the HMAC was computed over. One variable, used twice. Writing two `JSON.stringify(record)` is the bug pattern.

### 6.3 Key acquisition (Critic HIGH #1 resolved — persistence DEFERRED to B4b)

**B1 scope: in-memory `accountKey` only. No file persistence.**

Reasoning: Node's `fs.chmod(path, 0o600)` is a no-op on Windows (only the read-only bit honored), and `%LOCALAPPDATA%\musu\account_key` would default to user-readable ACL inheritance. Doing this properly requires `icacls` shell-out + cross-platform test surface; doing it sloppily ships a "password-equivalent" file world-readable on Windows. Per user decision, deferring file persistence to B4b which owns the installer-side ACL story.

B1 behavior:
- `GatewayClient` constructor accepts `accountKey: string` in config (no default).
- If `accountKey` is unset, gateway calls `/issue_install_key` on first `connect()` using `this.cfg.token` + `this.cfg.userId` placeholder (actual userId comes back in the response).
- On 200, stores `accountKey` in memory only. On 409, gateway hard-fails with: `"Account already has a telemetry key. Provide it via accountKey config or rotate with X-Musu-Rotate. Persistent storage lands in V23.2 B4b."`. On 503, telemetry is disabled but gateway proceeds (Design A — pre-B2-deploy state).
- Process restart re-fetches if `accountKey` is unset → triggers 409 path → operator must wire the config. Acceptable in B1 because the consumer here is dev machines + Fly signaling itself; production installs come via B4b.

Caller of `GatewayClient` in B4b will:
1. Read `account_key` from `%LOCALAPPDATA%\musu\account_key` (or Linux equivalent) where the installer wrote it during install
2. Pass it into `accountKey` config
3. Installer is responsible for the ACL (`icacls` on Windows, `chmod 0600` on Linux)

## 7. Test plan

New test file `musu-relay/tests/telemetry-hmac.test.ts` mirroring `telemetry-auth.test.ts`:

### 7.1 `requireInstallHmac` unit tests (in-memory DB)

- `rejects /install with no headers (401, error="missing signature")` (in HMAC_ONLY mode)
- `rejects /install with X-Musu-User-Id only (no signature header) → 401`
- `rejects /install with signature header but no user-id → 401`
- `rejects /install with malformed signature header "v1=abc" (no t=) → 401`
- `rejects /install with non-hex v1 → 401 "malformed signature"`
- `rejects /install with t in the past beyond 300s → 401 "expired"`
- `rejects /install with t in the future beyond 300s → 401 "expired or future-dated"`
- `rejects /install with unknown user_id (no row) when MUSU_TELEMETRY_HMAC_ONLY=1 → 401 "unknown account"`
- `rejects /install with valid headers but wrong key → 401 "invalid signature"`
- `accepts /install with valid signature → 204`
- `accepts /install when body bytes differ from expected stringification (raw-body capture verification)` — POST with manually-crafted body bytes that JSON.parse round-trips differently and confirms the HMAC over raw bytes verifies
- `accepts /nat_pierce, /agent_spawn analogously (3 tests)`
- `updates last_seen_at on successful auth`

### 7.2 `/issue_install_key` route tests (with `validateToken` mocked)

- `400 on missing tunnel_token in body`
- `401 when validateToken returns {valid:false}`
- `503 when validateToken returns {valid:true, userId:null}` (Design A B2-required path)
- `200 with fresh 64-hex account_key when validateToken returns {valid:true, userId:"u1"}`
- `409 on second call for same userId without X-Musu-Rotate header`
- `200 with NEW account_key when X-Musu-Rotate: 1 supplied; old key no longer verifies on /install`

### 7.3 Dual-accept tests

- `with MUSU_TELEMETRY_HMAC_ONLY unset AND user has no row: accepts shared-secret on /install`
- `with MUSU_TELEMETRY_HMAC_ONLY unset AND user has issued key: refuses shared-secret on /install for that user (401)`
- `with MUSU_TELEMETRY_HMAC_ONLY=1: shared-secret path is dead, every /install demands HMAC`

### 7.4 `checkTelemetryAuthBootConfig` extension (existing 3 tests stay)

Add:
- `returns null in production when MUSU_TELEMETRY_HMAC_ONLY=1 even without MUSU_TELEMETRY_SHARED_SECRET`
- `returns error string in production when both unset`

### 7.5 Gateway emission tests (update `tests/telemetry-emit.test.ts`)

Existing `T2.AUTH.2 interim` block stays as dual-accept regression coverage. Add:
- `T2.AUTH.2-final — gateway with accountKey sends HMAC signature, body verifies`
- `T2.AUTH.2-final — gateway without accountKey omits HMAC headers`

**Test count target**: ~18 new tests in `telemetry-hmac.test.ts`, ~2 added in `telemetry-emit.test.ts`. Suite goes from 107 to ~127.

## 8. Dual-accept rollout

- **State machine per user_id**: `(no_row, has_row)`. Once `has_row`, shared-secret from that user is refused.
- **Operator flag `MUSU_TELEMETRY_HMAC_ONLY`** (default unset = dual-accept; `=1` = HMAC-only).
- **`checkTelemetryAuthBootConfig`** extension: production boot succeeds if EITHER `MUSU_TELEMETRY_SHARED_SECRET` is set (legacy) OR `MUSU_TELEMETRY_HMAC_ONLY=1`.

Rollout sequence in production:

1. Deploy B1 to Fly with `MUSU_TELEMETRY_SHARED_SECRET` still set, `MUSU_TELEMETRY_HMAC_ONLY` unset. → dual-accept active. No gateway has issued yet → all traffic on shared-secret.
2. Wait for B2 musu-pro deploy (canonical `user_id` returned).
3. New gateway releases call `/issue_install_key` on first launch → row appears → that account's gateway switches to HMAC. Other accounts still on shared-secret.
4. When telemetry shows ~all accounts have rows: `fly secrets set MUSU_TELEMETRY_HMAC_ONLY=1`, then `fly secrets unset MUSU_TELEMETRY_SHARED_SECRET`. (Order matters: unsetting first would break the still-on-shared-secret accounts.)
5. Old shared-secret code path removed in V23.3.

## 9. Const III gate

The schema v41 migration code, the `requireInstallHmac` middleware, the `/issue_install_key` route, the gateway changes, and all tests can be **written and unit-tested without authorization** — tests run against `MUSU_TELEMETRY_DB=:memory:`.

The Const III gate fires at exactly one moment: **the production DB bump from v40 to v41 on the live Fly volume**. Concretely, this is the first `fly deploy` after the v41 code lands on the `v22/gap-analysis` branch.

**Gate prompt**: at the close of B1's implementation phase, before `fly deploy`, the orchestrator emits: `"Const III gate: B1 will run a schema v41 migration on the production telemetry DB at /data/telemetry.db on next fly deploy. The migration adds telemetry_account_keys table and is idempotent (CREATE IF NOT EXISTS). Approve? 진행해 / no"`. User reply unblocks the deploy.

**Defensive in-code env-gate (Critic MEDIUM resolved)**: `applyMigrations()` checks at the v41 conditional:

```typescript
if (current < 41) {
  if (process.env.NODE_ENV === "production" &&
      process.env.MUSU_TELEMETRY_V41_AUTHORIZED !== "1") {
    throw new Error(
      "[telemetry] schema v41 migration blocked: " +
      "set MUSU_TELEMETRY_V41_AUTHORIZED=1 via `fly secrets set` after " +
      "obtaining Const III 진행해 from operator. Refusing to start."
    );
  }
  d.exec(MIGRATION_V41_ACCOUNT_KEYS);
  d.prepare("INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)").run(41, Date.now());
}
```

This is belt-and-suspenders for a one-way schema change: if the user runs `fly deploy` from CI / muscle memory without seeing the orchestrator prompt, the migration refuses to apply. The env var is set by the same workflow that records the 진행해.

Tests in `:memory:` DB do not hit this branch (NODE_ENV ≠ production).

The Const III gate does NOT block the local code merge to `v22/gap-analysis` — that's a separate Const VII concern.

## 10. Acceptance criteria

Master plan §B1 acceptance, restated with B1's resolved design:

- [ ] All three POST routes (`/install`, `/nat_pierce`, `/agent_spawn`) reject missing or malformed signature headers with 401
- [ ] Wrong signature for known `user_id` → 401
- [ ] Correct signature → 204
- [ ] Replay rejection: same valid signature but `t > 300s` ago → 401
- [ ] `/issue_install_key` returns 409 on known user_id (not a new key) unless `X-Musu-Rotate: 1`
- [ ] `/issue_install_key` returns 503 when validateToken yields `userId=null` (Design A enforcement)
- [ ] Gateway emits correct HMAC header on every telemetry POST (positive + negative test)
- [ ] Raw-body capture verified by a test that uses bytes-not-equal-to-restringify
- [ ] Per-account-key invariant: same canonical `user_id` from two gateway processes → same `account_key`
- [ ] Dual-accept window: account with no row falls through to shared-secret (when not HMAC_ONLY); account with row refuses shared-secret
- [ ] `checkTelemetryAuthBootConfig` accepts `MUSU_TELEMETRY_HMAC_ONLY=1` as a valid prod config without `MUSU_TELEMETRY_SHARED_SECRET`
- [ ] Full suite green (target ~127 tests)

## 11. Files touched

| File | Change |
|---|---|
| `musu-relay/src/signaling/telemetry.ts:17` | Add `createHmac, randomBytes` to crypto import |
| `musu-relay/src/signaling/telemetry.ts:55-107` | Add `MIGRATION_V41_ACCOUNT_KEYS` sibling constant; extend `applyMigrations` with conditional v41 exec |
| `musu-relay/src/signaling/telemetry.ts:151-179` | Add `requireInstallHmac()`; keep `requireTelemetrySecret` as fallback for dual-accept |
| `musu-relay/src/signaling/telemetry.ts:191-203` | Extend `checkTelemetryAuthBootConfig` to accept `MUSU_TELEMETRY_HMAC_ONLY=1` as valid |
| `musu-relay/src/signaling/telemetry.ts:207-294` | New `/issue_install_key` route; swap `requireTelemetrySecret` → new combined middleware on `/install`, `/nat_pierce`, `/agent_spawn` |
| `musu-relay/src/signaling/telemetry.ts:209` | Change `express.json({ limit: "16kb" })` → `express.json({ limit: "16kb", verify: (req, _res, buf) => { (req as any).rawBody = buf; } })` |
| `musu-relay/src/gateway/client.ts:109-113` | Remove `telemetrySharedSecret`; add `accountKey?: string` |
| `musu-relay/src/gateway/client.ts:395-415` | Replace shared-secret header logic with HMAC computation; ensure body string identity |
| `musu-relay/src/gateway/client.ts` (new method) | `bootstrapAccountKey()` called from `connect()` if `accountKey` unset; persist to local file path |
| `musu-relay/tests/telemetry-hmac.test.ts` | NEW — ~18 tests per §7 |
| `musu-relay/tests/telemetry-emit.test.ts:311-389` | Add HMAC-header positive/negative tests; keep shared-secret tests as dual-accept regression |
| `musu-relay/tests/telemetry-auth.test.ts:107-138` | Add HMAC_ONLY-without-shared-secret boot config tests |
| `musu-relay/fly.toml:11` | Document `MUSU_TELEMETRY_HMAC_ONLY=1` cutover step in the provisioning checklist comment |
| `musu-relay/Dockerfile:15-17` | Update the `docker run` example comment to include either secret OR HMAC_ONLY |

musu-pro: **zero changes in B1**. B2 is the musu-pro change.

## 12. Open questions / Critic-bait

Surfacing for Critic adversarial review:

1. **Store raw `account_key` in DB** (§3.1, §5). Master plan §B1 said "Storing SHA-256(install_key) not the key itself: DB compromise yields hashes, not usable keys." That guidance is **incorrect for HMAC** — you cannot HMAC with a hash. Either (a) store raw and accept DB-as-trust-boundary (Stripe pattern), or (b) abandon HMAC for bearer-token + hash compare (loses request-binding). I picked (a). **Critic: confirm the threat model is acceptable, or argue for (b).**

2. **Multi-machine UPSERT race in `/issue_install_key`**. Fly is currently `min_machines_running=1` so non-issue, but if we ever scale up two writers can race. Mitigation: `user_id PRIMARY KEY` makes one INSERT fail with UNIQUE constraint. The losing INSERT leaks a `randomBytes(32)` call's worth of CPU but no security impact. **Critic: am I missing a window where both calls succeed and one client thinks they have a key that's been overwritten?**

3. **Gateway key persistence in B1 scope or B4b scope?** I scoped a `~/.musu/account_key` file into B1 because without it the gateway can't survive a restart. Master plan §B4b says "Uses HMAC auth from B1" — implying installer-side persistence. **Critic: should B1 ship with in-memory-only and hard-fail-on-409, leaving persistence to B4b?**

4. **`X-Musu-User-Id` header vs body field**. Stripe puts customer context in URL path. I'm using a header to keep URL stable. Alternative: put in body, parse-before-HMAC-verify. **Critic: is the header a privacy concern in middleware/proxy logs?**

5. **Dual-accept marker is implicit (row presence) rather than explicit boolean**. Researcher described "per-install marker pattern". I'm using "row exists for this user_id". Equivalent semantically but less self-documenting. **Critic: prefer an explicit `migrated_to_hmac_at` column?**

6. **No nonce store**. 300s replay window only. Replayed events are best-effort idempotent-ish telemetry inserts (extra `nat_pierce` rows). **Critic: is the duplicate-row consequence significant enough to justify a nonce cache?**

7. **`/issue_install_key` rate limiting**. Not in the plan. An attacker with a valid token can spam `/issue_install_key` with `X-Musu-Rotate: 1` to rotate the legitimate user's key over and over, locking them out. **Critic: should B1 add a "1 rotation per user per minute" guard?**

## Recommended commit order (Critic handoff)

Per Critic HANDOFF NOTES, B1 implementation should land as 6 commits:

1. **raw-body capture wiring + test for `req.rawBody` invariant** (smallest, isolates the most error-prone change before any consumer relies on it)
2. **schema v41 migration + Const III env-gate + tests** (sibling constant, conditional exec, defensive prod env-var check)
3. **`requireInstallHmac` middleware + unit tests** (per §5; consumes raw body from #1, uses placeholder DB rows from #2)
4. **`/issue_install_key` route + try/catch race fix + tests** (per §3.3; depends on schema)
5. **gateway-side HMAC header swap + `bootstrapAccountKey()` (in-memory only, hard-fail on 409) + tests** (per §6.2/§6.3 deferred file persistence)
6. **`MUSU_TELEMETRY_HMAC_ONLY` boot-config extension + dual-accept fallthrough + tests** (closes the loop with §5 dual-accept fallback + §8 rollout flag)

**Rotation (`X-Musu-Rotate: 1` header path, §2.4 / §3.3 rotateRequested branch) is EXTRACTED to a follow-on B1.x commit** per Critic MEDIUM on scope creep. Rotation has no consumer in V23.2 (no `musu-cli rotate-telemetry-key` exists yet); cutting it saves ~3 tests and one code path. Re-introduces in B1.x or V23.3 when consumer arrives.

Dual-audit (`security-engineer` × 2 in parallel) runs on the **combined** diff after all 6 commits land. One audit-fix commit if needed. Closure doc covers all 6 + audit-fix.

## Critic Findings (resolved)

System-architect Critic pass returned 3 HIGH / 3 MEDIUM / 3 LOW findings against this plan. Resolutions (in plan-edit order):

| # | Severity | Section | Finding | Resolution |
|---|---|---|---|---|
| 1 | HIGH | §6.3, §11 | Node `fs.chmod(0o600)` is a no-op on Windows; `%LOCALAPPDATA%\musu\account_key` would be user-readable + admin-readable | **B1 defers file persistence to B4b** (user decision). B1 ships in-memory `accountKey` only; gateway hard-fails on 409 from `/issue_install_key`. §6.3 rewritten. |
| 2 | HIGH | §5 invariant comment | "row exists → refuse shared-secret" cannot be enforced when `X-Musu-User-Id` header is absent (server doesn't know which user) | **Invariant weakened**: "if `X-Musu-User-Id` header is present AND a row exists for that user_id, HMAC is mandatory." Anonymous requests fall through to shared-secret; closed by `MUSU_TELEMETRY_HMAC_ONLY=1` at full cutover. §5 comment rewritten. |
| 3 | HIGH | §3.3 race code | INSERT throws on UNIQUE conflict; route 500s instead of 409 because no try/catch | **Code added**: try/catch around INSERT, catches `SQLITE_CONSTRAINT_PRIMARYKEY`, re-SELECTs to return 409 with existing `issued_at`. Handles both multi-machine and double-click scenarios. §3.3 rewritten. |
| 4 | MEDIUM | §3.1 raw-key storage | Override of "store SHA-256" guidance vs master plan needs HKDF alternative explicitly rejected for durability | **§3.1 note added**: HKDF still requires stored IKM (RFC 5869); same threat model, more complexity. Override stands. |
| 5 | MEDIUM | §9 Const III gate | Orchestrator prompt is policy; no defensive in-code check if user runs `fly deploy` without seeing the prompt | **§9 env-gate added**: `applyMigrations()` checks `NODE_ENV=production && MUSU_TELEMETRY_V41_AUTHORIZED !== "1"` and refuses to advance v40→v41. Belt-and-suspenders for one-way schema change. |
| 6 | MEDIUM | §1 ordering | Master plan §"Sequencing + dependencies" still shows B2 ∥ B1 parallel — wrong after Design A flip | **Master plan update required** (in B1 closure doc): the arrow from B0 to B2 stays parallel, but **B2-musu-pro-deploy gates B1-cutover**. Add explicit note in master plan sequencing. Not blocking Builder start; carry into closure. |
| 7 | MEDIUM | §6.3 + §10 + §11 | Scope creep — schema migration + new endpoint + rotation + persistence + boot-config + dual-accept all in one PR | **Two cuts**: (a) file persistence DEFERRED to B4b (Critic HIGH #1 resolution); (b) rotation header path DEFERRED to follow-on commit B1.x. PR diff target ≤ ~600 lines net. |
| 8 | LOW | §3.1 column type | SQLite TEXT default collation — concern raised, but BINARY is the default; no issue | No change. Mentioned in Critic for explicitness. |
| 9 | LOW | §12 Critic-bait #7 | Rotation rate-limiting — real concern but out of B1 scope | Documented as known limitation; Auditor will see in PRIOR ARTIFACTS. Defer to B3 or later. |
| 10 | LOW | §2.1 header vs body | `X-Musu-User-Id` header — synthetic id, industry-acceptable | No change. Same pattern as Stripe-Account header. |

**All HIGH findings resolved. Builder cleared to start with commit order above.** Critic HANDOFF NOTES preserved as-is below for Auditor's reference:

> 1. Address all three HIGH findings before opening the first commit. *[Done; see resolutions above.]*
> 2. Recommended commit order: (a) raw-body capture + tests; (b) schema v41 + boot check; (c) requireInstallHmac + tests; (d) `/issue_install_key` + tests with try/catch; (e) gateway header swap + tests; (f) skip persistence per HIGH #1 resolution; (g) HMAC_ONLY boot-config extension. *[Captured as §"Recommended commit order" above.]*
> 3. HMAC input is raw bytes, not re-stringified JSON. Verify with bytes-not-equal-to-restringify test on first green. *[Test #11 in §7.1.]*
> 4. Drop rotation from the first PR. *[Done — rotation extracted to B1.x follow-on.]*
> 5. Two `security-engineer` auditors in parallel will read full diff. Keep diff narratable: one logical change per commit message. *[Captured in commit-order intent.]*
