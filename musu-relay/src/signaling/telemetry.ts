// musu.pro signaling telemetry collector (V23.1 T1.5 + T1.6)
//
// Per docs/V23_MASTER_PLAN_2026_05_15.md §9.3:
//   - Captures install / nat_pierce / agent_spawn events from musu-relay
//     running on user PCs
//   - Stores in musu.pro's own SQLite (no Sentry, no PostHog)
//   - NEVER stores user identity, workspace contents, agent outputs,
//     file paths, code, chat history. Plumbing health ONLY
//   - Retention: 90 days raw; aggregated metrics retained indefinitely
//     (TODO V23.5: separate aggregation job)
//
// Schema (T1.6) defined in v40_telemetry.sql; this module applies it
// on startup and exposes Express routers for the three event types.

import express from "express";
import Database from "better-sqlite3";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import path from "path";

// ── DB bootstrap ──────────────────────────────────────────────────────────

const DB_PATH =
  process.env.MUSU_TELEMETRY_DB || path.join(process.cwd(), "telemetry.db");

let db: Database.Database;
let _warnedEphemeralDbPath = false;

function openDb(): Database.Database {
  if (db) return db;
  // V23.2 audit LOW #11: telemetry.db defaults to cwd. On Fly.io that's
  // the ephemeral container fs — telemetry vanishes on restart. Warn
  // loudly in production if MUSU_TELEMETRY_DB isn't pointed at a mounted
  // volume.
  if (
    !_warnedEphemeralDbPath &&
    process.env.NODE_ENV === "production" &&
    !process.env.MUSU_TELEMETRY_DB
  ) {
    _warnedEphemeralDbPath = true;
    console.warn(
      `[telemetry] WARNING: MUSU_TELEMETRY_DB not set in production; ` +
        `defaulting to ephemeral path ${DB_PATH}. Set it to a mounted ` +
        `volume path (e.g. /data/telemetry.db) per ` +
        `docs/V23_T1_7_FLY_IO_DEPLOY_DECISION.md provisioning checklist.`,
    );
  }
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  applyMigrations(db);
  return db;
}

// Schema v40_telemetry. Inlined so the signaling server can self-bootstrap;
// migrations directory remains the canonical source if/when we add v41+.
const MIGRATION_V40_TELEMETRY = `
CREATE TABLE IF NOT EXISTS schema_version (
  version  INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_install (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at        INTEGER NOT NULL,
  musu_install_id    TEXT NOT NULL,
  os                 TEXT NOT NULL,         -- 'windows'|'linux'|'macos'
  os_version         TEXT NOT NULL,
  musu_version       TEXT NOT NULL,
  wsl2_present_at_start INTEGER,            -- 0|1|NULL when not applicable
  wsl2_feature_enabled  INTEGER,            -- 0|1|NULL
  bios_virtualization_detected TEXT,        -- 'yes'|'no'|'unknown'|NULL
  step_failed        TEXT,                  -- NULL = success
  step_error_class   TEXT,                  -- 'hard_blocker_bios'|'timeout'|'permission'|'network'|...
  elapsed_ms         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_install_received ON telemetry_install(received_at);
CREATE INDEX IF NOT EXISTS idx_install_fail ON telemetry_install(step_failed)
  WHERE step_failed IS NOT NULL;

CREATE TABLE IF NOT EXISTS telemetry_nat_pierce (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at        INTEGER NOT NULL,
  musu_install_id    TEXT NOT NULL,
  attempt_outcome    TEXT NOT NULL,          -- 'success'|'fail'
  fail_cause         TEXT,                   -- 'cgnat_detected'|'symmetric_nat'|'firewall'|'timeout'|NULL
  ice_candidate_count INTEGER,
  elapsed_ms         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nat_received ON telemetry_nat_pierce(received_at);
CREATE INDEX IF NOT EXISTS idx_nat_outcome ON telemetry_nat_pierce(attempt_outcome);

CREATE TABLE IF NOT EXISTS telemetry_agent_spawn (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at        INTEGER NOT NULL,
  musu_install_id    TEXT NOT NULL,
  spawn_outcome      TEXT NOT NULL,          -- 'success'|'fail'
  cold_start_ms      INTEGER,
  node_count_in_cluster INTEGER
);
CREATE INDEX IF NOT EXISTS idx_spawn_received ON telemetry_agent_spawn(received_at);
`;

// V23.2 B1 commit 2: schema v41 — per-account HMAC key registry.
// Sibling constant (NOT inlined into v40) so the v40 baseline stays a
// pure idempotent CREATE IF NOT EXISTS block and the v41 advance is
// gated on schema_version, allowing the Const III env-gate below to
// veto it in production without disturbing v40 boot.
//
// Schema rationale (wiki/363 §3.1):
//   - user_id PRIMARY KEY: canonical musu.pro user id from /validate;
//     one HMAC key per account (not per install) so re-installs and
//     multi-machine setups share the key.
//   - account_key: 32-byte hex secret used as HMAC-SHA256 key by the
//     install gateway (commit 3 verifier).
//   - first_install_id: provenance — which install registered the key.
//   - issued_at / last_seen_at / rotated_at: rotation telemetry, also
//     drives the idx_account_keys_last_seen for liveness reports.
const MIGRATION_V41_ACCOUNT_KEYS = `
CREATE TABLE IF NOT EXISTS telemetry_account_keys (
  user_id           TEXT PRIMARY KEY,
  account_key       TEXT NOT NULL,
  first_install_id  TEXT NOT NULL,
  issued_at         INTEGER NOT NULL,
  last_seen_at      INTEGER,
  rotated_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_account_keys_last_seen
  ON telemetry_account_keys(last_seen_at);
`;

export function applyMigrations(d: Database.Database): void {
  // v40 baseline (already CREATE IF NOT EXISTS, idempotent).
  d.exec(MIGRATION_V40_TELEMETRY);
  d.prepare(
    "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)",
  ).run(40, Date.now());

  // v41 conditional advance. We read schema_version rather than relying
  // on CREATE IF NOT EXISTS alone because the env-gate must short-circuit
  // BEFORE any DDL runs in production without authorization.
  const current = (
    d.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {
      v: number | null;
    }
  ).v ?? 0;
  if (current < 41) {
    // Const III env-gate (wiki/363 §9). Schema migrations are one-way on
    // the production telemetry volume; the orchestrator-prompt policy
    // alone is insufficient if someone runs `fly deploy` directly. This
    // defensive check enforces a manual `fly secrets set
    // MUSU_TELEMETRY_V41_AUTHORIZED=1` step gated on operator 진행해
    // approval, and the server refuses to start otherwise. Test envs
    // (NODE_ENV !== "production") bypass the gate so unit tests and
    // local dev are unaffected.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.MUSU_TELEMETRY_V41_AUTHORIZED !== "1"
    ) {
      throw new Error(
        "[telemetry] schema v41 migration blocked: " +
          "set MUSU_TELEMETRY_V41_AUTHORIZED=1 via `fly secrets set` after " +
          "obtaining Const III 진행해 from operator. Refusing to start.",
      );
    }
    d.exec(MIGRATION_V41_ACCOUNT_KEYS);
    d.prepare(
      "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)",
    ).run(41, Date.now());
  }
}

// ── Validation helpers ───────────────────────────────────────────────────

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  return null;
}
function asBool(v: unknown): number | null {
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}
function isValidOs(v: unknown): v is "windows" | "linux" | "macos" {
  return v === "windows" || v === "linux" || v === "macos";
}
function isValidOutcome(v: unknown): v is "success" | "fail" {
  return v === "success" || v === "fail";
}

// ── Auth (V23.2 T2.AUTH.2 interim) ────────────────────────────────────────
//
// Closes V23.1 audit HIGH #2 in the simplest form: shared-secret header
// on every POST. The installer (Workstream B) will be configured with
// the same secret at build time, env-injected.
//
// This is INTERIM. Workstream B replaces it with per-install HMAC keys:
// each install registers at /v1/telemetry/install with this shared
// secret + a fresh client-generated key, server stores the key and
// thereafter validates HMAC(body, key) on subsequent POSTs. That's a
// schema-v41 change and lives in V23.2 T2.AUTH.2-final.
//
// Behavior:
//   - If MUSU_TELEMETRY_SHARED_SECRET is set: require an exact match in
//     the `x-musu-telemetry-secret` header; reject with 401 otherwise.
//   - If unset: log a one-time warning at first POST and accept anything
//     (V23.1 / dev / test behavior). Production deploy MUST set the env.
//   - GET /summary is unaffected — it's admin-internal and lives on a
//     trusted network in V23.2; T2.AUTH.2-final adds auth there too.

let _warnedNoSharedSecret = false;

function requireTelemetrySecret(
  req: express.Request,
  res: express.Response,
): boolean {
  const sharedSecret = process.env.MUSU_TELEMETRY_SHARED_SECRET;
  if (!sharedSecret) {
    if (!_warnedNoSharedSecret) {
      _warnedNoSharedSecret = true;
      console.warn(
        `[telemetry] WARNING: MUSU_TELEMETRY_SHARED_SECRET not set; ` +
          `accepting all telemetry POSTs unauthenticated. Set this env ` +
          `var to the installer-bundled secret before production deploy ` +
          `(audit HIGH #2).`,
      );
    }
    return true;
  }
  const supplied = req.header("x-musu-telemetry-secret") ?? "";
  // V23.2 audit HIGH #2: constant-time comparison. We SHA-256 both
  // sides so the length-equality precondition on timingSafeEqual
  // doesn't itself leak the secret's length.
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const secretHash = createHash("sha256").update(sharedSecret).digest();
  if (!timingSafeEqual(suppliedHash, secretHash)) {
    res.status(401).json({ error: "bad telemetry secret" });
    return false;
  }
  return true;
}

// ── HMAC auth (V23.2 T2.AUTH.2-final / Workstream B1) ────────────────────
//
// Per-account HMAC signature verification on the three write endpoints.
// Wire format (wiki/363 §2.1):
//
//   X-Musu-User-Id:               <canonical user id from /validate>
//   X-Musu-Telemetry-Signature:   t=<unix_seconds>,v1=<lowercase_hex>
//
// where v1 = HMAC_SHA256(account_key, `${t}.` + raw_body_bytes), lookup
// of account_key is by user_id in telemetry_account_keys (schema v41,
// commit 2). Raw body bytes come from req.rawBody (commit 1).
//
// Dual-accept (wiki/363 §8 + Critic HIGH #2 resolution): until cutover,
// a request with NEITHER X-Musu-User-Id NOR X-Musu-Telemetry-Signature
// header falls through to requireTelemetrySecret() — the legacy
// shared-secret path. Once MUSU_TELEMETRY_HMAC_ONLY=1 is set, the
// fallthrough is severed and every POST demands HMAC.
//
// Commit 6 fallthrough-guard: the dual-accept path is ONLY available
// when NO HMAC headers are present. The moment a request emits
// X-Musu-User-Id and X-Musu-Telemetry-Signature it has opted into the
// HMAC path; unknown-account or signature-mismatch errors are 401s,
// they do NOT fall back to shared-secret. This closes the attack where
// a holder of the shared secret would otherwise be able to forge HMAC
// headers for an unknown user_id and bypass the HMAC verifier.

const SIG_HEADER_RE =
  /^(?:t=(?<t1>\d+),v1=(?<v1a>[0-9a-f]+)|v1=(?<v1b>[0-9a-f]+),t=(?<t2>\d+))$/;

function parseSigHeader(
  raw: string,
): { t: number; v1: string } | null {
  const m = raw.match(SIG_HEADER_RE);
  if (!m || !m.groups) return null;
  const tStr = m.groups.t1 ?? m.groups.t2;
  const v1 = m.groups.v1a ?? m.groups.v1b;
  if (!tStr || !v1) return null;
  const t = Number(tStr);
  if (!Number.isFinite(t) || !Number.isInteger(t)) return null;
  return { t, v1 };
}

export function requireInstallHmac(
  req: express.Request,
  res: express.Response,
): boolean {
  // Dev-assertion: this middleware is meaningful only when the router-level
  // `express.json({ verify })` captured the raw bytes. A future POST route
  // mounted without that verify hook would have undefined rawBody and the
  // HMAC input would be uncomputable. We refuse to fail-open silently.
  if (!req.rawBody) {
    res.status(500).json({ error: "raw body not captured" });
    return false;
  }

  const userId = req.header("x-musu-user-id");
  const sigHdr = req.header("x-musu-telemetry-signature");
  const hmacOnly = process.env.MUSU_TELEMETRY_HMAC_ONLY === "1";

  // Dual-accept fallthrough: no HMAC headers at all → delegate to legacy
  // shared-secret middleware. Disabled when MUSU_TELEMETRY_HMAC_ONLY=1.
  if (!hmacOnly && !userId && !sigHdr) {
    return requireTelemetrySecret(req, res);
  }

  if (!userId || !sigHdr) {
    res.status(401).json({ error: "missing signature" });
    return false;
  }

  const parsed = parseSigHeader(sigHdr);
  if (!parsed) {
    res.status(401).json({ error: "malformed signature" });
    return false;
  }

  // Replay window: ±300s (Stripe-aligned). No nonce cache in B1; if
  // post-B1 audit demands one, lands in B3 or later. No echo of t or
  // server-now to keep the response oracle-free.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.t) > 300) {
    res.status(401).json({ error: "expired or future-dated signature" });
    return false;
  }

  const row = openDb()
    .prepare("SELECT account_key FROM telemetry_account_keys WHERE user_id = ?")
    .get(userId) as { account_key: string } | undefined;

  if (!row) {
    // Commit 6 fallthrough-guard tightening (wiki/363 §5, plan §5
    // dual-accept rollout, B1 builder handoff). Once a client emits
    // HMAC headers it has opted into the HMAC path; falling back to
    // shared-secret here would let an attacker who knows the shared
    // secret forge HMAC headers for an unknown user_id and slip past
    // the HMAC verifier entirely. We therefore reject with 401
    // "unknown account" regardless of HMAC_ONLY — the dual-accept
    // path is only available when NO HMAC headers are present (the
    // top-of-function fallthrough). Legacy gateways that haven't
    // bootstrapped a key must not emit X-Musu-User-Id /
    // X-Musu-Telemetry-Signature in the first place.
    res.status(401).json({ error: "unknown account" });
    return false;
  }

  // Build signed string from raw body bytes. Restringifying req.body would
  // reorder keys and break verification; raw bytes are the contract.
  const signedString = Buffer.concat([
    Buffer.from(`${parsed.t}.`, "utf8"),
    req.rawBody,
  ]);
  const expectedHmac = createHmac("sha256", row.account_key)
    .update(signedString)
    .digest();

  // hex decode is safe — SIG_HEADER_RE already constrained v1 to
  // lowercase hex. Buffer.from with "hex" silently truncates on odd
  // length; the length check below catches that case.
  const suppliedHmac = Buffer.from(parsed.v1, "hex");
  if (suppliedHmac.length !== expectedHmac.length) {
    res.status(401).json({ error: "invalid signature" });
    return false;
  }
  if (!timingSafeEqual(suppliedHmac, expectedHmac)) {
    res.status(401).json({ error: "invalid signature" });
    return false;
  }

  // Success: bump last_seen_at for liveness reporting. Stamp in unix ms
  // to match issued_at/rotated_at columns (schema v41).
  openDb()
    .prepare(
      "UPDATE telemetry_account_keys SET last_seen_at = ? WHERE user_id = ?",
    )
    .run(Date.now(), userId);
  return true;
}

// Test helper: clear the warned-state. Called from tests so each
// describe block can re-trigger the one-time warning if needed.
export function _resetTelemetryAuthState(): void {
  _warnedNoSharedSecret = false;
}

// V23.2 audit HIGH #3 + B1 commit 6 (wiki/363 §7.4, §8 step 4):
// refuse to start in production without an auth mechanism.
//
// During the B1 dual-accept rollout, EITHER auth mode is a valid
// production config:
//   1. Legacy / dual-accept: MUSU_TELEMETRY_SHARED_SECRET set. Requests
//      without HMAC headers fall through to the shared-secret check.
//   2. HMAC-only (post-cutover): MUSU_TELEMETRY_HMAC_ONLY=1. Shared
//      secret may be unset; every POST must carry HMAC headers.
//
// The legacy case alone (no HMAC_ONLY, no shared secret) is the
// dangerous state — every POST would be accepted unauthenticated. That
// remains a refuse-to-start condition. The error string mentions BOTH
// env vars so the operator knows their two options.
//
// Returns null when configured correctly or in a non-production env;
// returns an error string when the operator must intervene.
export function checkTelemetryAuthBootConfig(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV !== "production") return null;
  const hasSharedSecret = !!env.MUSU_TELEMETRY_SHARED_SECRET;
  const hmacOnly = env.MUSU_TELEMETRY_HMAC_ONLY === "1";
  if (hasSharedSecret || hmacOnly) return null;
  return (
    "Telemetry auth is unconfigured in production. Set EITHER " +
    "MUSU_TELEMETRY_SHARED_SECRET (legacy / dual-accept) OR " +
    "MUSU_TELEMETRY_HMAC_ONLY=1 (HMAC-only cutover). Without one, the " +
    "signaling server accepts anonymous telemetry from anyone on the " +
    "internet. Set the legacy path via `fly secrets set " +
    "MUSU_TELEMETRY_SHARED_SECRET=$(openssl rand -hex 32)` and bake the " +
    "same value into installer builds, OR set " +
    "MUSU_TELEMETRY_HMAC_ONLY=1 once all installs have completed the " +
    "B1 HMAC migration. Refusing to start (audit HIGH #3, wiki/363 §8)."
  );
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * Token-validation function injected into makeTelemetryRouter() for the
 * /v1/telemetry/issue_install_key route (V23.2 B1 commit 4).
 *
 * Dependency-injected (rather than imported from ../signaling/server.ts)
 * to avoid a circular import: server.ts already imports makeTelemetryRouter
 * from this file. Injection also makes the route trivially testable —
 * tests pass a jest stub returning whatever {valid, userId} they need.
 *
 * Contract:
 *   - token: the musu.pro tunnel token from the request body
 *   - returns {valid:false, userId:null} when the token is rejected
 *   - returns {valid:true,  userId:<canonical-id>} on a B2-deployed
 *     musu.pro upstream (Design A happy path)
 *   - returns {valid:true,  userId:null} when the upstream is v21-era
 *     and does NOT return a canonical user_id; the route 503s in that
 *     case per Design A (wiki/363 §1 ordering flip)
 *   - throws on upstream network/circuit error; the route maps to 502
 */
export type TelemetryTokenValidator = (
  token: string,
) => Promise<{ valid: boolean; userId: string | null }>;

export function makeTelemetryRouter(
  validateToken: TelemetryTokenValidator,
): express.Router {
  const router = express.Router();
  // V23.2 B1 commit 1: capture the raw request body bytes for HMAC signing.
  // The `verify` callback fires synchronously between the raw-body read and
  // JSON.parse, so `buf` is the exact payload the client sent — whitespace,
  // key order, and all. Subsequent middleware/handlers reach this as
  // `req.rawBody` (type augmented in ./express-augment.d.ts). The HMAC
  // verifier in commit 3 signs over these bytes; restringifying req.body
  // would reorder keys and break the signature. See
  // docs/V23_2_WORKSTREAM_B1_PLAN_2026_05_16.md §2.1.
  router.use(
    express.json({
      limit: "16kb",
      verify: (req, _res, buf) => {
        // `verify` is typed against http.IncomingMessage, not Express.Request;
        // the cast bridges that gap. Consumers see the typed `rawBody` thanks
        // to the global augmentation in express-augment.d.ts.
        (req as unknown as express.Request).rawBody = buf;
      },
    }),
  );
  const _db = openDb();

  // POST /v1/telemetry/install
  router.post("/install", (req, res) => {
    if (!requireInstallHmac(req, res)) return;
    const b = req.body || {};
    if (!asStr(b.musu_install_id) || !isValidOs(b.os) || !asStr(b.os_version) || !asStr(b.musu_version) || asInt(b.elapsed_ms) === null) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }
    _db
      .prepare(
        `INSERT INTO telemetry_install
           (received_at, musu_install_id, os, os_version, musu_version,
            wsl2_present_at_start, wsl2_feature_enabled,
            bios_virtualization_detected, step_failed, step_error_class,
            elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        b.musu_install_id,
        b.os,
        b.os_version,
        b.musu_version,
        asBool(b.wsl2_present_at_start),
        asBool(b.wsl2_feature_enabled),
        asStr(b.bios_virtualization_detected),
        asStr(b.step_failed),
        asStr(b.step_error_class),
        asInt(b.elapsed_ms),
      );
    res.status(204).end();
  });

  // POST /v1/telemetry/nat_pierce
  router.post("/nat_pierce", (req, res) => {
    if (!requireInstallHmac(req, res)) return;
    const b = req.body || {};
    if (!asStr(b.musu_install_id) || !isValidOutcome(b.attempt_outcome) || asInt(b.elapsed_ms) === null) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }
    _db
      .prepare(
        `INSERT INTO telemetry_nat_pierce
           (received_at, musu_install_id, attempt_outcome, fail_cause,
            ice_candidate_count, elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        b.musu_install_id,
        b.attempt_outcome,
        asStr(b.fail_cause),
        asInt(b.ice_candidate_count),
        asInt(b.elapsed_ms),
      );
    res.status(204).end();
  });

  // POST /v1/telemetry/agent_spawn (debug-mode optional)
  router.post("/agent_spawn", (req, res) => {
    if (!requireInstallHmac(req, res)) return;
    const b = req.body || {};
    if (!asStr(b.musu_install_id) || !isValidOutcome(b.spawn_outcome)) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }
    _db
      .prepare(
        `INSERT INTO telemetry_agent_spawn
           (received_at, musu_install_id, spawn_outcome, cold_start_ms,
            node_count_in_cluster)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        b.musu_install_id,
        b.spawn_outcome,
        asInt(b.cold_start_ms),
        asInt(b.node_count_in_cluster),
      );
    res.status(204).end();
  });

  // POST /v1/telemetry/issue_install_key (V23.2 B1 commit 4, wiki/363 §2.4)
  //
  // Bootstrap endpoint that creates the per-account HMAC key the install
  // gateway will use to sign subsequent telemetry POSTs. Lives OUTSIDE
  // requireInstallHmac() — by definition the caller has no key yet.
  //
  // Auth model: the caller proves account ownership by supplying their
  // musu.pro tunnel token in the body; we validate it via the injected
  // validateToken() and derive the canonical user_id from the response.
  //
  // Design A enforcement (wiki/363 §1): when the upstream /validate
  // returns valid=true but userId=null (v21-era fallback), we 503
  // instead of issuing a key keyed on a hash-of-token surrogate. This
  // forces musu.pro B2 to deploy BEFORE B1 cuts over in production.
  //
  // Race fix (Critic HIGH #3, wiki/363 §3.3 FINAL): two parallel POSTs
  // for the same user_id (double-click installer, concurrent gateways)
  // both call randomBytes() and try to INSERT. The second one trips the
  // user_id PRIMARY KEY UNIQUE constraint. We catch
  // SQLITE_CONSTRAINT_PRIMARYKEY / SQLITE_CONSTRAINT_UNIQUE, re-SELECT
  // the winner's issued_at, and return 409. The 409 body intentionally
  // does NOT echo the existing account_key — clients must persist on
  // first issuance or contact support.
  //
  // Rotation (X-Musu-Rotate: 1) is OUT OF SCOPE for B1; extracted to
  // B1.x per Critic MEDIUM #7. Until rotation lands, a second call from
  // the same user always 409s.
  router.post("/issue_install_key", async (req, res) => {
    const body = req.body ?? {};
    const tunnelToken = asStr(body.tunnel_token);
    const installIdHint = asStr(body.musu_install_id);
    if (!tunnelToken) {
      res.status(400).json({ error: "missing tunnel_token" });
      return;
    }

    let validation: { valid: boolean; userId: string | null };
    try {
      validation = await validateToken(tunnelToken);
    } catch {
      // Upstream network error / circuit open. We don't leak the
      // underlying error string — the caller's recovery is the same
      // either way (retry with backoff).
      res.status(502).json({ error: "validation upstream error" });
      return;
    }
    if (!validation.valid) {
      res.status(401).json({ error: "invalid tunnel_token" });
      return;
    }
    if (!validation.userId) {
      // Design A: refuse to issue against the v21-era fallback. Once
      // musu.pro B2 deploys, /validate returns the canonical user_id
      // and this branch goes dormant.
      res.status(503).json({
        error:
          "canonical user_id not available; musu.pro /validate must deploy B2 first",
      });
      return;
    }
    const userId = validation.userId;

    const fresh = randomBytes(32).toString("hex");
    const now = Date.now();

    try {
      _db
        .prepare(
          `INSERT INTO telemetry_account_keys
             (user_id, account_key, first_install_id, issued_at, last_seen_at, rotated_at)
           VALUES (?, ?, ?, ?, NULL, NULL)`,
        )
        .run(userId, fresh, installIdHint ?? "", now);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      // better-sqlite3 reports the error code as either
      // SQLITE_CONSTRAINT_PRIMARYKEY (newer builds) or the broader
      // SQLITE_CONSTRAINT_UNIQUE (older). Handle both so the test
      // matrix isn't pinned to one sqlite version.
      if (
        code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
        code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        const winner = _db
          .prepare(
            "SELECT issued_at FROM telemetry_account_keys WHERE user_id = ?",
          )
          .get(userId) as { issued_at: number } | undefined;
        res.status(409).json({
          error: "account_key already issued for this user_id",
          issued_at: winner?.issued_at ?? null,
          hint: "persist account_key on first issuance; rotation lands in B1.x",
        });
        return;
      }
      throw err;
    }

    // issued_at in the response body is unix SECONDS (Stripe-aligned)
    // even though the DB column stores milliseconds. Keeping the wire
    // format stable across the two representations is the simplest
    // contract for the client.
    res.status(200).json({
      account_key: fresh,
      user_id: userId,
      issued_at: Math.floor(now / 1000),
    });
  });

  // GET /v1/telemetry/summary — internal admin (no auth in V23.1; add for prod)
  router.get("/summary", (_req, res) => {
    const installCount = (
      _db.prepare("SELECT COUNT(*) AS n FROM telemetry_install").get() as {
        n: number;
      }
    ).n;
    const installFails = (
      _db
        .prepare(
          "SELECT COUNT(*) AS n FROM telemetry_install WHERE step_failed IS NOT NULL",
        )
        .get() as { n: number }
    ).n;
    const natTotal = (
      _db.prepare("SELECT COUNT(*) AS n FROM telemetry_nat_pierce").get() as {
        n: number;
      }
    ).n;
    const natSuccess = (
      _db
        .prepare(
          "SELECT COUNT(*) AS n FROM telemetry_nat_pierce WHERE attempt_outcome='success'",
        )
        .get() as { n: number }
    ).n;
    res.json({
      install: {
        total: installCount,
        failures: installFails,
        failure_rate: installCount > 0 ? installFails / installCount : 0,
      },
      nat_pierce: {
        total: natTotal,
        success: natSuccess,
        success_rate: natTotal > 0 ? natSuccess / natTotal : 0,
      },
    });
  });

  return router;
}

// ── Test helpers ─────────────────────────────────────────────────────────

export function _resetDb(): void {
  if (!db) return;
  db.exec(
    `DELETE FROM telemetry_install;
     DELETE FROM telemetry_nat_pierce;
     DELETE FROM telemetry_agent_spawn;
     DELETE FROM telemetry_account_keys;`,
  );
}

// Test helper: hand back the singleton DB so HMAC tests can seed
// telemetry_account_keys rows directly. `:memory:` databases are NOT
// shared across `new Database(":memory:")` instances, so opening a
// second one in tests wouldn't see the same data the router uses.
// Exported for test code only — never call from production code paths.
export function _getDbForTests(): Database.Database {
  return openDb();
}

export function _closeDb(): void {
  if (db) {
    db.close();
    db = undefined as any;
  }
}
