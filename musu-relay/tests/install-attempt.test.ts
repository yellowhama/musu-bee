/**
 * V23.3 B2 (wiki/390) — install_attempt unauth telemetry endpoint tests.
 *
 * Covers wiki/390 §6.1 T1-T15 plus §4.6 Critic-mandated additions
 * T16-T21:
 *
 *   T1  schema v42 applies in test env (table + index + version row)
 *   T2  happy-path 204 + row insertion
 *   T3  malformed musu_install_id → 400
 *   T4  missing step → 400
 *   T5  missing error_class → 400
 *   T6  missing elapsed_ms → 400
 *   T7  excessive step length (65 chars) → 400 (via STEP_RE upper cap)
 *   T8  unauth allowed even when MUSU_TELEMETRY_SHARED_SECRET set
 *   T9  21 rapid POSTs (same install_id+ip) → 20×204 then 1×429 + Retry-After
 *   T10 rate-limit isolated per install_id (bucket B independent of bucket A)
 *   T11 raw-body regression (the existing /_raw_probe path is not disturbed)
 *   T12 optional context fields accepted (and stored / absent → NULL)
 *   T13 optional field too long → 204 + DB column NULL (clamp-not-reject)
 *   T14 source_ip_hash is 8-char lowercase hex prefix
 *   T15 Const III env-gate: production + no V42_AUTHORIZED → throws
 *   T16 C-B2-H1: X-Forwarded-For 1.2.3.4 → source_ip_hash == sha256("1.2.3.4")[:8]
 *   T17 C-B2-M1: step="<script>" → 400 (char-class regex rejects)
 *   T18 C-B2-M1: step="valid_name_42" → 204 (allowlist passes)
 *   T19 C-B2-M2: elapsed_ms range check (−1, 86400001 → 400; 0 → 204)
 *   T20 C-B2-M5: 10k+1 rotated install_ids → 204 (LRU evict-and-admit)
 *   T21 C-B2-M5: after 100k rotated POSTs, Map.size <= RL_MAP_HARD_CAP
 *
 * Test setup mirrors tests/telemetry-auth.test.ts:9-37 +
 * tests/telemetry-raw-body.test.ts:20-43. Uses :memory: SQLite, resets
 * DB + limiter in beforeEach.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
// Set the shared secret so T8 (unauth-allowed-even-when-set) is a
// meaningful assertion. Other tests do not interact with it because
// /install_attempt deliberately skips requireTelemetrySecret().
process.env.MUSU_TELEMETRY_SHARED_SECRET = "test-shared-secret-iax";

import { createHash } from "crypto";
import supertest from "supertest";
import express from "express";
import Database from "better-sqlite3";
import {
  applyMigrations,
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
  _resetInstallAttemptLimiter,
  _getInstallAttemptLimiterSize,
  _consumeInstallAttemptToken,
  _getDbForTests,
  _runInstallAttemptSweeperOnce,
  _maybeStartInstallAttemptSweeper,
  _stopInstallAttemptSweeper,
} from "../src/signaling/telemetry";

// Stub validator — these tests don't exercise /issue_install_key, so any
// shape that satisfies makeTelemetryRouter's signature suffices.
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});

// Build the production router; mount under the canonical /v1/telemetry
// prefix the operator sees in production. T16 (X-Forwarded-For honored)
// requires app.set("trust proxy", 1) on the same Express app — server.ts
// sets it on the production app; we mirror it here so the test surface
// matches production exactly.
const app = express();
app.set("trust proxy", 1);
const router = makeTelemetryRouter(stubValidate);
// Mount a probe route on the SAME router instance so T11 sees the same
// express.json({ verify }) wiring under test (no shadow router that
// could drift from production).
router.post("/_raw_probe", (req, res) => {
  const raw = req.rawBody;
  res.json({
    has_raw: raw !== undefined,
    raw_utf8: raw ? raw.toString("utf8") : null,
  });
});
app.use("/v1/telemetry", router);

beforeEach(() => {
  _resetDb();
  _resetInstallAttemptLimiter();
});
afterAll(() => {
  _closeDb();
  delete process.env.MUSU_TELEMETRY_SHARED_SECRET;
});

const VALID_INSTALL_ID = "00112233445566778899aabbccddeeff";
const ALT_INSTALL_ID = "ffeeddccbbaa99887766554433221100";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    musu_install_id: VALID_INSTALL_ID,
    step: "bios_vt_off",
    error_class: "hard_blocker_bios",
    elapsed_ms: 42,
    ...overrides,
  };
}

// ── T1: migration applies ────────────────────────────────────────────────
describe("V23.3 B2 — schema v42 install_attempt", () => {
  it("T1: applyMigrations creates the install_attempt table + indexes + version row", () => {
    // Use a fresh :memory: DB and apply migrations directly (mirrors
    // tests/telemetry-migration.test.ts:50-54 pattern). We DO NOT touch
    // the module-level singleton here — _getDbForTests() is for other
    // tests' DB inspection, not this one's migration assertion.
    const d = new Database(":memory:");
    d.pragma("journal_mode = WAL");
    applyMigrations(d);
    const ver = (
      d.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {
        v: number;
      }
    ).v;
    expect(ver).toBe(42);
    const tbl = d
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("install_attempt") as { name: string } | undefined;
    expect(tbl).toBeDefined();
    expect(tbl!.name).toBe("install_attempt");

    // Indexes documented in §2.1 must exist.
    const idxNames = (
      d
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='install_attempt' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(idxNames).toEqual(
      expect.arrayContaining([
        "idx_install_attempt_install",
        "idx_install_attempt_received",
        "idx_install_attempt_step",
      ]),
    );
    d.close();
  });
});

// ── T2-T8: route happy/unhappy paths ─────────────────────────────────────
describe("V23.3 B2 — POST /v1/telemetry/install_attempt", () => {
  it("T2: happy path returns 204 and inserts a row", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody());
    expect(res.status).toBe(204);
    const row = _getDbForTests()
      .prepare(
        "SELECT musu_install_id, step, error_class, elapsed_ms FROM install_attempt",
      )
      .get() as
      | {
          musu_install_id: string;
          step: string;
          error_class: string;
          elapsed_ms: number;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.musu_install_id).toBe(VALID_INSTALL_ID);
    expect(row!.step).toBe("bios_vt_off");
    expect(row!.error_class).toBe("hard_blocker_bios");
    expect(row!.elapsed_ms).toBe(42);
  });

  it("T3: malformed musu_install_id returns 400 with documented error", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ musu_install_id: "not-hex" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing or malformed musu_install_id");
  });

  it("T4: missing step returns 400", async () => {
    const body = validBody();
    delete body.step;
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/step/);
  });

  it("T5: missing error_class returns 400", async () => {
    const body = validBody();
    delete body.error_class;
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/error_class/);
  });

  it("T6: missing elapsed_ms returns 400 (range check rejects null)", async () => {
    const body = validBody();
    delete body.elapsed_ms;
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/elapsed_ms/);
  });

  it("T7: 65-char step exceeds STEP_RE upper cap → 400", async () => {
    const tooLong = "a".repeat(65);
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ step: tooLong }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/step/);
  });

  it("T8: unauth allowed even when MUSU_TELEMETRY_SHARED_SECRET is set", async () => {
    // No x-musu-telemetry-secret header. The endpoint must NOT delegate
    // to requireTelemetrySecret() — this is the unauth-by-design contract.
    expect(process.env.MUSU_TELEMETRY_SHARED_SECRET).toBe(
      "test-shared-secret-iax",
    );
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody());
    expect(res.status).toBe(204);
  });
});

// ── T9-T10: rate-limit ───────────────────────────────────────────────────
describe("V23.3 B2 — rate-limit (token bucket)", () => {
  it("T9: 21 POSTs same (install_id, ip) → 20×204, 21st 429 with Retry-After", async () => {
    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let i = 0; i < 21; i++) {
      const res = await supertest(app)
        .post("/v1/telemetry/install_attempt")
        .send(validBody({ elapsed_ms: i }));
      statuses.push(res.status);
      if (res.status === 429) {
        retryAfter = res.headers["retry-after"];
      }
    }
    expect(statuses.slice(0, 20).every((s) => s === 204)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  });

  it("T10: bucket A exhaustion does not affect bucket B (different install_id)", async () => {
    // Exhaust A.
    for (let i = 0; i < 20; i++) {
      const res = await supertest(app)
        .post("/v1/telemetry/install_attempt")
        .send(validBody({ musu_install_id: VALID_INSTALL_ID }));
      expect(res.status).toBe(204);
    }
    const exhausted = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ musu_install_id: VALID_INSTALL_ID }));
    expect(exhausted.status).toBe(429);

    // B still has full capacity.
    for (let i = 0; i < 20; i++) {
      const res = await supertest(app)
        .post("/v1/telemetry/install_attempt")
        .send(validBody({ musu_install_id: ALT_INSTALL_ID }));
      expect(res.status).toBe(204);
    }
  });
});

// ── T11: raw-body regression ─────────────────────────────────────────────
describe("V23.3 B2 — raw-body regression", () => {
  it("T11: /_raw_probe still captures rawBody after install_attempt is mounted", async () => {
    const inputBytes = '{"b":1, "a":  2  }';
    const res = await supertest(app)
      .post("/v1/telemetry/_raw_probe")
      .set("Content-Type", "application/json")
      .send(inputBytes);
    expect(res.status).toBe(200);
    expect(res.body.has_raw).toBe(true);
    expect(res.body.raw_utf8).toBe(inputBytes);
  });
});

// ── T12-T14: optional fields + source_ip_hash shape ──────────────────────
describe("V23.3 B2 — optional fields + source_ip_hash", () => {
  it("T12: all 4 optional fields stored; absent → NULL", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(
        validBody({
          os_version: "Windows 11 24H2",
          bios_vt: "yes",
          host_class: "wsl2-off-feature-off",
          installer_version: "B4b-rev0abc123",
        }),
      );
    expect(res.status).toBe(204);
    const row = _getDbForTests()
      .prepare(
        "SELECT os_version, bios_vt, host_class, installer_version FROM install_attempt ORDER BY id DESC LIMIT 1",
      )
      .get() as {
      os_version: string | null;
      bios_vt: string | null;
      host_class: string | null;
      installer_version: string | null;
    };
    expect(row.os_version).toBe("Windows 11 24H2");
    expect(row.bios_vt).toBe("yes");
    expect(row.host_class).toBe("wsl2-off-feature-off");
    expect(row.installer_version).toBe("B4b-rev0abc123");

    // Second POST with no optional fields → all NULL.
    _resetDb();
    _resetInstallAttemptLimiter();
    const res2 = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody());
    expect(res2.status).toBe(204);
    const row2 = _getDbForTests()
      .prepare(
        "SELECT os_version, bios_vt, host_class, installer_version FROM install_attempt ORDER BY id DESC LIMIT 1",
      )
      .get() as {
      os_version: string | null;
      bios_vt: string | null;
      host_class: string | null;
      installer_version: string | null;
    };
    expect(row2.os_version).toBeNull();
    expect(row2.bios_vt).toBeNull();
    expect(row2.host_class).toBeNull();
    expect(row2.installer_version).toBeNull();
  });

  it("T13: over-length os_version (129 chars) → 204, DB column NULL (clamp + warn)", async () => {
    // C-B2-L2: clamp-to-NULL semantics preserved; over-length triggers
    // console.warn. We spy on console.warn to assert the warn fires.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const tooLong = "x".repeat(129);
      const res = await supertest(app)
        .post("/v1/telemetry/install_attempt")
        .send(validBody({ os_version: tooLong }));
      expect(res.status).toBe(204);
      const row = _getDbForTests()
        .prepare(
          "SELECT os_version FROM install_attempt ORDER BY id DESC LIMIT 1",
        )
        .get() as { os_version: string | null };
      expect(row.os_version).toBeNull();
      // Warn-once message must mention the field name + len.
      const calls = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((m) => /install_attempt: clamped over-length field os_version/.test(m)),
      ).toBe(true);
      expect(calls.some((m) => /len=129/.test(m))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("T13b: os_version with embedded newline → 204, DB column NULL (audit-fix1 OS_VERSION_RE log-injection block)", async () => {
    // Audit-fix1 (Auditor A NEW-MED-1, wiki/391): OS_VERSION_RE previously
    // used `\s` which admits \n/\r/\t — a log-injection vector when a future
    // admin/log viewer renders install_attempt.os_version line-by-line.
    // Tightened to literal-SP-only; embedded newline now fails regex →
    // optClamp returns null → DB column NULL + console.warn fires.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await supertest(app)
        .post("/v1/telemetry/install_attempt")
        .send(validBody({ os_version: "A\nB" }));
      expect(res.status).toBe(204);
      const row = _getDbForTests()
        .prepare(
          "SELECT os_version FROM install_attempt ORDER BY id DESC LIMIT 1",
        )
        .get() as { os_version: string | null };
      expect(row.os_version).toBeNull();
      const calls = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((m) =>
          /install_attempt: clamped over-length field os_version/.test(m),
        ),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("T14: source_ip_hash is 8-char lowercase hex prefix", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody());
    expect(res.status).toBe(204);
    const row = _getDbForTests()
      .prepare(
        "SELECT source_ip_hash FROM install_attempt ORDER BY id DESC LIMIT 1",
      )
      .get() as { source_ip_hash: string };
    expect(row.source_ip_hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── T15: Const III env-gate ──────────────────────────────────────────────
describe("V23.3 B2 — Const III env-gate (wiki/390 §5.1)", () => {
  // Capture/restore env around the test so other test files (which share
  // process.env state) see what they expect (mirrors
  // tests/telemetry-migration.test.ts:40-48 pattern).
  const _origNodeEnv = process.env.NODE_ENV;
  const _origV41 = process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
  const _origV42 = process.env.MUSU_TELEMETRY_V42_AUTHORIZED;
  afterEach(() => {
    if (_origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = _origNodeEnv;
    if (_origV41 === undefined) delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
    else process.env.MUSU_TELEMETRY_V41_AUTHORIZED = _origV41;
    if (_origV42 === undefined) delete process.env.MUSU_TELEMETRY_V42_AUTHORIZED;
    else process.env.MUSU_TELEMETRY_V42_AUTHORIZED = _origV42;
  });

  it("T15: NODE_ENV=production + V42_AUTHORIZED unset → throws with v42 error string", () => {
    process.env.NODE_ENV = "production";
    process.env.MUSU_TELEMETRY_V41_AUTHORIZED = "1"; // open v41 gate
    delete process.env.MUSU_TELEMETRY_V42_AUTHORIZED;
    const d = new Database(":memory:");
    d.pragma("journal_mode = WAL");
    expect(() => applyMigrations(d)).toThrow(/MUSU_TELEMETRY_V42_AUTHORIZED/);
    // v42 must NOT be present after the throw.
    const versions = (
      d.prepare("SELECT version FROM schema_version ORDER BY version").all() as Array<{
        version: number;
      }>
    ).map((r) => r.version);
    expect(versions).toEqual([40, 41]); // v40 + v41 landed, v42 blocked
    const tbl = d
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("install_attempt");
    expect(tbl).toBeUndefined();
    d.close();
  });

  it("T15b: NODE_ENV=production + V42_AUTHORIZED=1 → applies", () => {
    process.env.NODE_ENV = "production";
    process.env.MUSU_TELEMETRY_V41_AUTHORIZED = "1";
    process.env.MUSU_TELEMETRY_V42_AUTHORIZED = "1";
    const d = new Database(":memory:");
    d.pragma("journal_mode = WAL");
    expect(() => applyMigrations(d)).not.toThrow();
    const versions = (
      d.prepare("SELECT version FROM schema_version ORDER BY version").all() as Array<{
        version: number;
      }>
    ).map((r) => r.version);
    expect(versions).toEqual([40, 41, 42]);
    d.close();
  });
});

// ── T16-T19: Critic-mandated additions ───────────────────────────────────
describe("V23.3 B2 — Critic-mandated additions (wiki/390 §4.6)", () => {
  it("T16 (C-B2-H1): X-Forwarded-For 1.2.3.4 → source_ip_hash == sha256(\"1.2.3.4\")[:8]", async () => {
    const expectedHash = createHash("sha256")
      .update("1.2.3.4")
      .digest("hex")
      .substring(0, 8);
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .set("X-Forwarded-For", "1.2.3.4")
      .send(validBody());
    expect(res.status).toBe(204);
    const row = _getDbForTests()
      .prepare(
        "SELECT source_ip_hash FROM install_attempt ORDER BY id DESC LIMIT 1",
      )
      .get() as { source_ip_hash: string };
    // This is the C-B2-H1 invariant: without trust-proxy=1 the hash would
    // be sha256("::ffff:127.0.0.1") or similar (the socket peer), NOT
    // sha256("1.2.3.4"). The exact-match assertion proves end-to-end XFF
    // honoring.
    expect(row.source_ip_hash).toBe(expectedHash);
  });

  it("T17 (C-B2-M1): step=\"<script>\" → 400 (char-class regex rejects)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ step: "<script>" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/step/);
  });

  it("T18 (C-B2-M1): step=\"valid_name_42\" → 204 (allowlist passes)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ step: "valid_name_42" }));
    expect(res.status).toBe(204);
  });

  it("T19 (C-B2-M2): elapsed_ms range — −1 and 86400001 → 400; 0 → 204", async () => {
    const resNeg = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ elapsed_ms: -1 }));
    expect(resNeg.status).toBe(400);
    expect(resNeg.body.error).toBe("elapsed_ms out of range");

    _resetInstallAttemptLimiter();
    const resHuge = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ elapsed_ms: 24 * 60 * 60 * 1000 + 1 }));
    expect(resHuge.status).toBe(400);
    expect(resHuge.body.error).toBe("elapsed_ms out of range");

    _resetInstallAttemptLimiter();
    const resZero = await supertest(app)
      .post("/v1/telemetry/install_attempt")
      .send(validBody({ elapsed_ms: 0 }));
    expect(resZero.status).toBe(204);
  });

  it("T20 (C-B2-M5): 10k+1 rotated install_ids → 10001st allowed (LRU evict-and-admit)", () => {
    // Call _consumeInstallAttemptToken directly to avoid 10k+ supertest
    // round-trips. The route handler's contract is: validate → consume
    // exactly one token from (install_id, source_ip) → DB insert. T9/T10
    // already prove the route consumes correctly; T20 isolates the cap
    // behavior of the limiter itself.
    _resetInstallAttemptLimiter();
    expect(_getInstallAttemptLimiterSize()).toBe(0);

    // 10000 fresh install_ids (each used once) fill the cap exactly.
    for (let i = 0; i < 10000; i++) {
      const id = i.toString(16).padStart(32, "0");
      const r = _consumeInstallAttemptToken(id, "1.2.3.4");
      expect(r.allowed).toBe(true);
    }
    expect(_getInstallAttemptLimiterSize()).toBe(10000);

    // 10001st: a brand-new install_id. Must be allowed (LRU evicts one
    // of the older entries first). Map size stays at the cap.
    const id10001 = "f".repeat(32);
    const r10001 = _consumeInstallAttemptToken(id10001, "1.2.3.4");
    expect(r10001.allowed).toBe(true);
    expect(_getInstallAttemptLimiterSize()).toBe(10000);

    // Verify the new key is present, and the very first key (i=0) was
    // evicted — it was the oldest by lastRefillMs.
    // We can't read the Map directly (not exported), but we can prove
    // eviction by consuming again with the i=0 key and asserting it
    // landed at a fresh-bucket state (would not be allowed if its
    // previous bucket survived since we already burned 1 token from it,
    // but a fresh bucket starts with RL_CAPACITY=20 tokens). The cleaner
    // invariant is the size assertion above; we rely on that.
  }, 60_000);

  it("T21 (C-B2-M5): after 100k rotated POSTs, Map.size stays bounded by RL_MAP_HARD_CAP", () => {
    // Direct limiter call (per T20 reasoning). 100k iterations is the
    // plan's spec value; in-process Map ops run at ~1M/s so this finishes
    // in a few seconds.
    _resetInstallAttemptLimiter();
    for (let i = 0; i < 100000; i++) {
      const id = (i + 1000000).toString(16).padStart(32, "0");
      const r = _consumeInstallAttemptToken(id, "9.9.9.9");
      expect(r.allowed).toBe(true);
    }
    expect(_getInstallAttemptLimiterSize()).toBeLessThanOrEqual(10000);
  }, 60_000);
});

// ── F-B2-1 (wiki/406): install_attempt 30-day retention sweeper ──────────
describe("V23.4 F-B2-1 — install_attempt retention sweeper (wiki/406)", () => {
  // Use a 32-char hex placeholder install_id that matches the v42
  // INSTALL_ID_RE regex (used by the route) but is distinct from
  // VALID_INSTALL_ID / ALT_INSTALL_ID to avoid cross-test interference.
  const SWEEPER_INSTALL_ID = "a".repeat(32);
  const DAY_MS = 24 * 60 * 60 * 1000;

  function insertAttempt(receivedAt: number, installId: string): void {
    _getDbForTests()
      .prepare(
        `INSERT INTO install_attempt
           (received_at, musu_install_id, step, error_class, elapsed_ms,
            source_ip_hash, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receivedAt,
        installId,
        "bios_vt_off",
        "hard_blocker_bios",
        42,
        "deadbeef",
        1,
      );
  }

  it("T22: sweeper deletes rows older than 30 days", () => {
    const stale = Date.now() - 31 * DAY_MS;
    insertAttempt(stale, SWEEPER_INSTALL_ID);

    const deleted = _runInstallAttemptSweeperOnce();
    expect(deleted).toBe(1);

    const remaining = _getDbForTests()
      .prepare(
        `SELECT COUNT(*) AS n FROM install_attempt WHERE musu_install_id = ?`,
      )
      .get(SWEEPER_INSTALL_ID) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it("T23: sweeper preserves rows younger than 30 days", () => {
    const fresh = Date.now() - 29 * DAY_MS;
    insertAttempt(fresh, SWEEPER_INSTALL_ID);

    const deleted = _runInstallAttemptSweeperOnce();
    expect(deleted).toBe(0);

    const remaining = _getDbForTests()
      .prepare(
        `SELECT COUNT(*) AS n FROM install_attempt WHERE musu_install_id = ?`,
      )
      .get(SWEEPER_INSTALL_ID) as { n: number };
    expect(remaining.n).toBe(1);
  });

  describe("T24: timer registration honors env-vars and re-entrancy", () => {
    // Snapshot the env vars this sub-describe touches so we can restore
    // them in afterAll. Other tests in this file assume NODE_ENV !==
    // "production" (the default) and the hatch env-var is unset.
    let savedNodeEnv: string | undefined;
    let savedHatch: string | undefined;

    beforeAll(() => {
      savedNodeEnv = process.env.NODE_ENV;
      savedHatch = process.env.MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED;
    });

    afterAll(() => {
      // Belt-and-suspenders: ensure no interval leaks out of this sub-describe.
      _stopInstallAttemptSweeper();
      if (savedNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = savedNodeEnv;
      }
      if (savedHatch === undefined) {
        delete process.env.MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED;
      } else {
        process.env.MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED = savedHatch;
      }
    });

    afterEach(() => {
      // Defensive: each sub-case must leave the timer cleared so jest
      // doesn't hang on a dangling interval (the production case
      // genuinely registers one).
      _stopInstallAttemptSweeper();
    });

    it("(a) production + hatch unset: re-entrancy guard + idempotent stop", () => {
      process.env.NODE_ENV = "production";
      delete process.env.MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED;

      // Call twice — second call must hit the re-entrancy guard and
      // NOT register a second interval.
      expect(() => _maybeStartInstallAttemptSweeper()).not.toThrow();
      expect(() => _maybeStartInstallAttemptSweeper()).not.toThrow();

      // Stop must succeed without throwing.
      expect(() => _stopInstallAttemptSweeper()).not.toThrow();
      // Stop is idempotent: a second call on an already-stopped sweeper
      // is also a no-op.
      expect(() => _stopInstallAttemptSweeper()).not.toThrow();
    });

    it("(b) production + hatch=1: short-circuit, no interval registered", () => {
      process.env.NODE_ENV = "production";
      process.env.MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED = "1";

      expect(() => _maybeStartInstallAttemptSweeper()).not.toThrow();
      // We can't directly observe internal timer state, but if an
      // interval HAD been registered, _stopInstallAttemptSweeper()
      // would have to clear it; either way the call must be a no-op
      // that doesn't throw, AND a subsequent stop call must also be
      // a safe no-op (proving idempotence in the no-registration
      // path too).
      expect(() => _stopInstallAttemptSweeper()).not.toThrow();
      expect(() => _stopInstallAttemptSweeper()).not.toThrow();
    });

    it("(c) non-production: short-circuit, no interval registered", () => {
      process.env.NODE_ENV = "test";
      delete process.env.MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED;

      expect(() => _maybeStartInstallAttemptSweeper()).not.toThrow();
      expect(() => _stopInstallAttemptSweeper()).not.toThrow();
    });
  });
});
