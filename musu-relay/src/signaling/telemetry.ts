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

// V23.3 B2 (wiki/390 §2): schema v42 — pre-bootstrap install_attempt
// telemetry. Unauth POST endpoint accepts failure-step metadata from
// hosts that never reach a working musu install (so the existing HMAC-
// authed /install route is unreachable to them). Sibling constant
// (NOT inlined into v40 or v41) for the same defensive reason called
// out above the V41 constant: the v42 advance is gated on
// schema_version so the Const III env-gate can veto it in production
// without disturbing v40/v41 boot.
//
// Schema rationale (wiki/390 §2.1):
//   - INTEGER PRIMARY KEY AUTOINCREMENT + received_at + musu_install_id
//     mirror v40 telemetry_install for prepared-statement parity.
//   - step / error_class: free-form at write time (forward-compat for
//     future installer versions); char-class regex enforced at the route
//     layer per Critic C-B2-M1.
//   - elapsed_ms: bigint-safe via asInt(); range-checked 0..24h at route
//     layer per Critic C-B2-M2.
//   - optional context columns (os_version, bios_vt, host_class,
//     installer_version) match what install-wsl2.ps1 collects in
//     PrereqResult.
//   - source_ip_hash: sha256(req.ip).substring(0,8) — 32-bit prefix,
//     collision-tolerant for analytics, raw IP never persisted (privacy).
//   - schema_version: payload-schema version, allows additive evolution
//     without a v43 migration.
const MIGRATION_V42_INSTALL_ATTEMPT = `
CREATE TABLE IF NOT EXISTS install_attempt (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at         INTEGER NOT NULL,
  musu_install_id     TEXT NOT NULL,
  step                TEXT NOT NULL,
  error_class         TEXT NOT NULL,
  elapsed_ms          INTEGER NOT NULL,
  os_version          TEXT,
  bios_vt             TEXT,
  host_class          TEXT,
  installer_version   TEXT,
  source_ip_hash      TEXT,
  schema_version      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_install_attempt_received ON install_attempt(received_at);
CREATE INDEX IF NOT EXISTS idx_install_attempt_step ON install_attempt(step);
CREATE INDEX IF NOT EXISTS idx_install_attempt_install ON install_attempt(musu_install_id);
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

  // v42 conditional advance (V23.3 B2 / wiki/390 §2.2). Mirrors the v41
  // pattern above verbatim, swapping 41 → 42 and V41_AUTHORIZED →
  // V42_AUTHORIZED. We re-read schema_version after the v41 block so the
  // gate sees the freshest state (v40-only DBs that just advanced to v41
  // should now also advance to v42 in the same boot).
  const currentAfterV41 = (
    d.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {
      v: number | null;
    }
  ).v ?? 0;
  if (currentAfterV41 < 42) {
    // Const III env-gate (wiki/363 §9 precedent applied to v42). Schema
    // migrations are one-way on the production telemetry volume; the
    // orchestrator-prompt policy alone is insufficient if someone runs
    // `fly deploy` directly. Operator must `fly secrets set
    // MUSU_TELEMETRY_V42_AUTHORIZED=1` after obtaining Const III 진행해
    // approval; the server refuses to start otherwise. Tests
    // (NODE_ENV !== "production") bypass the gate.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.MUSU_TELEMETRY_V42_AUTHORIZED !== "1"
    ) {
      throw new Error(
        "[telemetry] schema v42 migration blocked: " +
          "set MUSU_TELEMETRY_V42_AUTHORIZED=1 via `fly secrets set` after " +
          "obtaining Const III 진행해 from operator. Refusing to start.",
      );
    }
    d.exec(MIGRATION_V42_INSTALL_ATTEMPT);
    d.prepare(
      "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)",
    ).run(42, Date.now());
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

// ── V23.3 B2 (wiki/390) — install_attempt validators + rate limiter ──────
//
// Per Critic C-B2-M1 (resolved in wiki/390 §4.6): free-form strings on
// the unauth /install_attempt route MUST pass char-class regexes at write
// time. Length-cap alone admits log-injection / future-stored-XSS payloads
// when paired with H1 (which would otherwise let an attacker rotate
// install_id and persist thousands of `<script>` / newline-injection
// payloads). The regex caps below also implement Critic L1's tightenings
// (installer_version ≤ 32, host_class ≤ 64) so the real fingerprint
// surface stays narrow.
const INSTALL_ID_RE = /^[0-9a-f]{32}$/;
const STEP_RE = /^[a-z0-9_]{1,64}$/;
const ERROR_CLASS_RE = /^[a-z0-9_]{1,64}$/;
const BIOS_VT_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const HOST_CLASS_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const INSTALLER_VERSION_RE = /^[a-zA-Z0-9._-]{1,32}$/;
const OS_VERSION_RE = /^[a-zA-Z0-9._\s()-]{1,128}$/;

// Per-instance in-memory token bucket. Scoped per (install_id, source_ip)
// tuple. NOT global — fly.toml min_machines_running=1 makes per-instance
// approximately global at steady state; auto-scale hops are a V23.4
// follow-on (wiki/390 §3.1 trade-off).
//
// Memory bound: a Map<string, BucketState> with RL_MAP_HARD_CAP active
// entries. Each entry ~80 bytes (key ~50 bytes + state ~30 bytes); ~800KB
// worst case. Reaper sweeps entries older than RL_REAPER_MAX_AGE_MS every
// RL_REAPER_INTERVAL_MS. Test isolation via _resetInstallAttemptLimiter().
//
// Per Critic C-B2-M5 (resolved in wiki/390 §4.6):
//   - RL_REAPER_MAX_AGE_MS: 1h → 10min (tighten reaper window so
//     adversarial-install_id-rotation DoS-of-legitimate-callers releases
//     map slots faster).
//   - RL_REAPER_INTERVAL_MS: 5min → 1min (run reaper more often).
//   - LRU eviction at cap: when at hard cap and a NEW key arrives, evict
//     the single oldest entry (min lastRefillMs) before insert — converts
//     cap-hit failure mode from "deny legitimate for 60min" to "evict
//     oldest attacker entry, admit legitimate caller" (asymmetric in the
//     right direction).
interface BucketState {
  tokens: number;       // float, refilled lazily on hit
  lastRefillMs: number; // Date.now() of last refill
}

const RL_CAPACITY = 20;            // max burst per tuple
const RL_TOKENS_PER_HOUR = 20;     // refill 20/hour ≈ one every 3min
const RL_REFILL_PER_MS = RL_TOKENS_PER_HOUR / (60 * 60 * 1000);
const RL_REAPER_INTERVAL_MS = 60_000;        // C-B2-M5: 5min → 1min
const RL_REAPER_MAX_AGE_MS = 10 * 60_000;    // C-B2-M5: 1h → 10min
const RL_MAP_HARD_CAP = 10_000;

const _installAttemptBuckets = new Map<string, BucketState>();
let _lastReaperRunMs = 0;

// Exported for tests (T20/T21 assert LRU bound at scale; calling this
// directly avoids the supertest+express+sqlite round-trip cost of
// hammering the route 10k+ times). Production callers use it via the
// /install_attempt route handler. The leading-underscore name follows
// the same convention as _resetDb / _getDbForTests in this module.
export function _consumeInstallAttemptToken(
  installId: string,
  sourceIp: string,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  // Opportunistic reaper — runs at most once per RL_REAPER_INTERVAL_MS
  // on the hot path; bounded work per call.
  if (now - _lastReaperRunMs > RL_REAPER_INTERVAL_MS) {
    _lastReaperRunMs = now;
    for (const [k, v] of _installAttemptBuckets) {
      if (now - v.lastRefillMs > RL_REAPER_MAX_AGE_MS) {
        _installAttemptBuckets.delete(k);
      }
    }
  }
  const key = `${installId}|${sourceIp}`;
  let st = _installAttemptBuckets.get(key);
  if (!st) {
    // C-B2-M5: LRU eviction at cap (NOT refuse). If the map is at the
    // hard cap and the key is new, evict the single oldest entry (min
    // lastRefillMs) before insert. Bounded scan (O(N) once per cap-hit,
    // where N ≤ RL_MAP_HARD_CAP) — acceptable for the failure mode it
    // mitigates.
    if (_installAttemptBuckets.size >= RL_MAP_HARD_CAP) {
      let oldestKey: string | null = null;
      let oldestMs = Infinity;
      for (const [k, v] of _installAttemptBuckets) {
        if (v.lastRefillMs < oldestMs) {
          oldestMs = v.lastRefillMs;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) {
        _installAttemptBuckets.delete(oldestKey);
      }
    }
    st = { tokens: RL_CAPACITY, lastRefillMs: now };
    _installAttemptBuckets.set(key, st);
  } else {
    // Lazy refill: add (elapsed_ms * refill_per_ms) tokens, clamp to capacity.
    const elapsed = now - st.lastRefillMs;
    st.tokens = Math.min(RL_CAPACITY, st.tokens + elapsed * RL_REFILL_PER_MS);
    st.lastRefillMs = now;
  }
  if (st.tokens < 1) {
    const deficit = 1 - st.tokens;
    // RL_REFILL_PER_MS is tokens-per-ms, so deficit/RL_REFILL_PER_MS is
    // ms-until-1-token. Convert to whole seconds for the Retry-After
    // header (RFC 7231 §7.1.3 — integer seconds).
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(deficit / RL_REFILL_PER_MS / 1000)),
    };
  }
  st.tokens -= 1;
  return { allowed: true, retryAfterSec: 0 };
}

// Test isolation — call from beforeEach() in install-attempt.test.ts.
export function _resetInstallAttemptLimiter(): void {
  _installAttemptBuckets.clear();
  _lastReaperRunMs = 0;
}

// Test-only window into the limiter state so T20/T21 can assert size
// bounds without exporting the Map directly.
export function _getInstallAttemptLimiterSize(): number {
  return _installAttemptBuckets.size;
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
//   - (B3 wiki/367) GET /summary requires
//     `Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>` in production;
//     dev-mode tolerance when env unset + NODE_ENV != production.

let _warnedNoSharedSecret = false;
let _warnedNoAdminSecret = false;

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

// ── Admin auth for GET /summary (V23.2 Workstream B3 / wiki/367) ─────────
//
// Closes V23.2 audit gap: GET /v1/telemetry/summary was the last
// unauthenticated administrative surface. B3 adds a bearer-token check
// using the same constant-time SHA-256 + crypto.timingSafeEqual pattern
// as requireTelemetrySecret above.
//
// Wire format (wiki/367 §2.1):
//   Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>
//
// RFC 7235 §2.1: auth-scheme tokens are case-insensitive. The regex
// /^Bearer\s+(.+)$/i accepts "Bearer", "bearer", "BEARER" alike.
//
// Behavior:
//   - If MUSU_TELEMETRY_ADMIN_SECRET is set: require a Bearer header
//     whose token SHA-256s to the same digest as the env-var SHA-256;
//     401 with {error:"missing admin auth"} when the header is absent
//     or malformed (non-Bearer scheme, empty token); 401 with
//     {error:"bad admin secret"} when the Bearer token mismatches.
//   - If unset and NODE_ENV !== "production": log a one-time warning
//     and accept (preserves local-dev ergonomics; backstopped by
//     checkTelemetryAuthBootConfig refuse-to-start in production).
function requireAdminSecret(
  req: express.Request,
  res: express.Response,
): boolean {
  const adminSecret = process.env.MUSU_TELEMETRY_ADMIN_SECRET;
  if (!adminSecret) {
    if (!_warnedNoAdminSecret) {
      _warnedNoAdminSecret = true;
      console.warn(
        `[telemetry] WARNING: MUSU_TELEMETRY_ADMIN_SECRET not set; ` +
          `accepting all GET /v1/telemetry/summary requests ` +
          `unauthenticated. Set this env var before production deploy ` +
          `(B3 wiki/367).`,
      );
    }
    return true;
  }
  const header = req.header("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: "missing admin auth" });
    return false;
  }
  const supplied = m[1];
  // Constant-time compare via SHA-256 on both sides — same defense
  // as requireTelemetrySecret: digests are always 32 bytes, so the
  // length-equality precondition on timingSafeEqual cannot leak the
  // secret's length. NEVER log `supplied` (B1 precedent).
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const secretHash = createHash("sha256").update(adminSecret).digest();
  if (!timingSafeEqual(suppliedHash, secretHash)) {
    res.status(401).json({ error: "bad admin secret" });
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
// B3 (wiki/367): also resets the admin-secret warn-once flag.
export function _resetTelemetryAuthState(): void {
  _warnedNoSharedSecret = false;
  _warnedNoAdminSecret = false;
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
  // Write-endpoint auth (B1): require EITHER shared-secret OR HMAC-only.
  const hasSharedSecret = !!env.MUSU_TELEMETRY_SHARED_SECRET;
  const hmacOnly = env.MUSU_TELEMETRY_HMAC_ONLY === "1";
  if (!hasSharedSecret && !hmacOnly) {
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
  // Admin-endpoint auth (B3 wiki/367): require MUSU_TELEMETRY_ADMIN_SECRET
  // in production. Independent of write-endpoint auth — different audience,
  // different surface, different secret. Without it GET /v1/telemetry/summary
  // would be open to anyone on the internet.
  if (!env.MUSU_TELEMETRY_ADMIN_SECRET) {
    return (
      "Telemetry admin auth is unconfigured in production. Set " +
      "MUSU_TELEMETRY_ADMIN_SECRET (e.g. `fly secrets set " +
      "MUSU_TELEMETRY_ADMIN_SECRET=$(openssl rand -hex 32)`). Without it, " +
      "GET /v1/telemetry/summary exposes aggregate install / NAT-pierce / " +
      "agent-spawn counts to anyone on the internet. Refusing to start " +
      "(B3 wiki/367)."
    );
  }
  return null;
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

  // POST /v1/telemetry/install_attempt — UNAUTH (V23.3 B2 / wiki/390)
  //
  // Pre-bootstrap failure telemetry. Hosts that never reach a working
  // install have no account_key, so /install (HMAC-authed) is unreachable.
  // This endpoint accepts an unauth POST per failure step from
  // install-wsl2.ps1, rate-limited per (musu_install_id, source_ip).
  //
  // Auth: deliberately none. See wiki/390 §1.2 + §3.5 privacy posture.
  // Validation: char-class regex (Critic C-B2-M1) + elapsed_ms range
  //   (Critic C-B2-M2).
  // Rate-limit: 20 tokens/hr per (install_id, source_ip) tuple; 429 +
  //   Retry-After on exhaustion (Critic C-B2-M5 LRU eviction at map cap).
  // Schema: install_attempt table (v42), see wiki/390 §2.
  //
  // Source IP derivation depends on `app.set("trust proxy", 1)` in
  // server.ts so req.ip is the real client IP (right-most XFF entry), not
  // the Fly edge proxy socket peer (Critic C-B2-H1).
  router.post("/install_attempt", (req, res) => {
    // No requireInstallHmac() / requireTelemetrySecret() — UNAUTH by design.
    const b = req.body || {};

    // Required: musu_install_id (exact regex, generic message — defense-
    // in-depth: don't disclose regex shape in the 400 body).
    const installId = asStr(b.musu_install_id);
    if (!installId || !INSTALL_ID_RE.test(installId)) {
      res.status(400).json({ error: "missing or malformed musu_install_id" });
      return;
    }

    // Required: step (char-class regex per C-B2-M1).
    const step = asStr(b.step);
    if (!step || !STEP_RE.test(step)) {
      res.status(400).json({ error: "missing or malformed step" });
      return;
    }

    // Required: error_class (char-class regex per C-B2-M1).
    const errorClass = asStr(b.error_class);
    if (!errorClass || !ERROR_CLASS_RE.test(errorClass)) {
      res.status(400).json({ error: "missing or malformed error_class" });
      return;
    }

    // Required: elapsed_ms (range check 0..24h per C-B2-M2).
    const elapsedMs = asInt(b.elapsed_ms);
    if (
      elapsedMs === null ||
      elapsedMs < 0 ||
      elapsedMs > 24 * 60 * 60 * 1000
    ) {
      res.status(400).json({ error: "elapsed_ms out of range" });
      return;
    }

    // Optional context fields — accept-and-clamp-to-NULL.
    // Per C-B2-M1: optional fields that fail char-class regex → NULL
    // (clamp), not 400 (keeps installer non-blocking on data shape edge
    // cases — Save-MusuFailureDump still writes the durable record).
    // Per C-B2-L2: over-length values log a warn so operator misconfig
    // surfaces in Fly logs.
    const optClamp = (
      v: string | null,
      regex: RegExp,
      fieldName: string,
    ): string | null => {
      if (v === null) return null;
      if (regex.test(v)) return v;
      // Distinguish "too long" (operator misconfig — warn) from "wrong
      // shape" (silent NULL). The cap inside each regex is the upper
      // bound, so length-exceed is regex-fail.
      console.warn(
        `[telemetry] install_attempt: clamped over-length field ${fieldName} (len=${v.length})`,
      );
      return null;
    };
    const osVersion = optClamp(asStr(b.os_version), OS_VERSION_RE, "os_version");
    const biosVt = optClamp(asStr(b.bios_vt), BIOS_VT_RE, "bios_vt");
    const hostClass = optClamp(asStr(b.host_class), HOST_CLASS_RE, "host_class");
    const installerVersion = optClamp(
      asStr(b.installer_version),
      INSTALLER_VERSION_RE,
      "installer_version",
    );

    // Rate-limit per (install_id, source_ip). req.ip is now the real
    // client IP (right-most XFF entry) thanks to app.set("trust proxy",1)
    // in server.ts — see C-B2-H1.
    const sourceIp = req.ip || "0.0.0.0";
    const rl = _consumeInstallAttemptToken(installId, sourceIp);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfterSec));
      res.status(429).json({ error: "rate limit exceeded" });
      return;
    }

    // Privacy posture (§3.5): only the 8-char hash lands in the DB; raw
    // IP stays in Fly proxy logs only.
    const sourceIpHash = createHash("sha256")
      .update(sourceIp)
      .digest("hex")
      .substring(0, 8);

    _db
      .prepare(
        `INSERT INTO install_attempt
           (received_at, musu_install_id, step, error_class, elapsed_ms,
            os_version, bios_vt, host_class, installer_version,
            source_ip_hash, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        installId,
        step,
        errorClass,
        elapsedMs,
        osVersion,
        biosVt,
        hostClass,
        installerVersion,
        sourceIpHash,
        1, // schema_version (payload-level)
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

  // GET /v1/telemetry/summary — admin-authenticated (B3 wiki/367).
  // Requires Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET> in
  // production; dev-mode tolerance when env unset + NODE_ENV != production.
  router.get("/summary", (req, res) => {
    if (!requireAdminSecret(req, res)) return;
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
     DELETE FROM telemetry_account_keys;
     DELETE FROM install_attempt;`,
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
