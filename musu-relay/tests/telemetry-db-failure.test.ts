/**
 * V23.4 F-B2-3 (wiki/408) — uniform DB-write try/catch on 4 telemetry routes.
 *
 * Closes V23.3 Auditor B wiki/391 NEW-MED-3: the 4 INSERT-bearing telemetry
 * route handlers (/install, /install_attempt, /nat_pierce, /agent_spawn)
 * previously let _db.prepare(...).run(...) exceptions bubble to Express's
 * default error handler, returning an HTML stack trace in dev (PII leak
 * risk) and a generic 500 with no client contract in prod.
 *
 * Each route is now wrapped in try { ... } catch (err) {
 *   console.error(`[telemetry] /<route>: db write failed: ${msg}`);
 *   res.status(500).json({ error: "database write failed" });
 *   return;  // C11: load-bearing — otherwise res.status(204).end() fires
 *            // and Express throws "Cannot set headers after they are sent"
 * }
 *
 * Test strategy (wiki/408 §4 strategy (d)): jest.spyOn the singleton DB's
 * prepare() with a selective implementation that throws ONLY when the SQL
 * contains "INSERT". This avoids interfering with earlier prepare() calls
 * (account-key SELECT, rate-limiter, etc.) and works uniformly across all
 * 4 routes regardless of their internal prepare-call order.
 *
 * Each test (TDF-1..TDF-4):
 *   1. Arm the spy via makeInsertThrow().
 *   2. POST a valid signed body.
 *   3. Assert res.status === 500 + res.body.error === "database write failed".
 *   4. Assert console.error logged the structured "[telemetry] /<route>: db
 *      write failed:" prefix (Critic C11 visibility).
 *   5. Assert NO "Cannot set headers after they are sent" appeared in
 *      console.error (Critic C11 — return statement is load-bearing).
 *   6. Restore the spy.
 *
 * Setup mirrors tests/telemetry-auth.test.ts (shared-secret auth via env
 * + x-musu-telemetry-secret header) + tests/install-attempt.test.ts (the
 * validBody pattern for the unauth /install_attempt route).
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
process.env.MUSU_TELEMETRY_SHARED_SECRET = "test-shared-secret-tdf";

import supertest from "supertest";
import express from "express";
import {
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
  _resetInstallAttemptLimiter,
  _getDbForTests,
} from "../src/signaling/telemetry";

// Stub validator — these tests don't exercise /issue_install_key, but
// makeTelemetryRouter requires the parameter to satisfy its signature.
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});

const app = express();
// trust proxy mirrors production wiring (see install-attempt.test.ts:71);
// /install_attempt's source_ip_hash derivation depends on it.
app.set("trust proxy", 1);
app.use("/v1/telemetry", makeTelemetryRouter(stubValidate));

beforeEach(() => {
  _resetDb();
  _resetInstallAttemptLimiter();
});

afterAll(() => {
  _closeDb();
  delete process.env.MUSU_TELEMETRY_SHARED_SECRET;
});

// ── Mock helper ──────────────────────────────────────────────────────────
//
// jest.spyOn the singleton DB's prepare() so calls whose SQL contains
// "INSERT" throw a simulated DB failure; all other prepare() calls
// (account-key SELECTs, rate-limiter, etc.) pass through untouched. This
// keeps the spy resilient to changes in pre-INSERT prepare-call order.
//
// Returns the spy so the test can restore it in a finally block.
function makeInsertThrow(): jest.SpyInstance {
  const db = _getDbForTests();
  const originalPrepare = db.prepare.bind(db);
  return jest.spyOn(db, "prepare").mockImplementation((sql: string) => {
    if (sql.includes("INSERT")) {
      throw new Error("simulated DB failure");
    }
    return originalPrepare(sql);
  });
}

// Valid 32-char hex install_id (mirrors install-attempt.test.ts:94).
const VALID_INSTALL_ID = "00112233445566778899aabbccddeeff";

// Valid body for /install_attempt (unauth route).
function validInstallAttemptBody(): Record<string, unknown> {
  return {
    musu_install_id: VALID_INSTALL_ID,
    step: "bios_vt_off",
    error_class: "user_action_required",
    elapsed_ms: 1234,
  };
}

// Valid body for /install (HMAC/shared-secret route).
const validInstallBody = {
  musu_install_id: "install-tdf-1",
  os: "windows",
  os_version: "11.24H2",
  musu_version: "0.23.4",
  elapsed_ms: 5000,
};

describe("V23.4 F-B2-3 — uniform DB-write try/catch returns structured 500", () => {
  it("TDF-1: /install DB-write failure → 500 + structured log + no double-response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let prepareSpy: jest.SpyInstance | null = null;
    try {
      prepareSpy = makeInsertThrow();

      const res = await supertest(app)
        .post("/v1/telemetry/install")
        .set("x-musu-telemetry-secret", "test-shared-secret-tdf")
        .send(validInstallBody);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("database write failed");

      const errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      // Structured prefix per F-B2-3 spec (wiki/408 §2.2).
      expect(
        errorCalls.some((m) =>
          /\[telemetry\] \/install: db write failed:/.test(m),
        ),
      ).toBe(true);
      // C11: no "Cannot set headers after they are sent" — the `return`
      // after res.status(500).json(...) prevented res.status(204).end()
      // from firing.
      expect(
        errorCalls.some((m) => /Cannot set headers after they are sent/.test(m)),
      ).toBe(false);
    } finally {
      prepareSpy?.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("TDF-2: /install_attempt DB-write failure → 500 + structured log + no double-response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let prepareSpy: jest.SpyInstance | null = null;
    try {
      prepareSpy = makeInsertThrow();

      // /install_attempt is UNAUTH by design (wiki/390 §1.2). No header.
      const res = await supertest(app)
        .post("/v1/telemetry/install_attempt")
        .send(validInstallAttemptBody());

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("database write failed");

      const errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      expect(
        errorCalls.some((m) =>
          /\[telemetry\] \/install_attempt: db write failed:/.test(m),
        ),
      ).toBe(true);
      expect(
        errorCalls.some((m) => /Cannot set headers after they are sent/.test(m)),
      ).toBe(false);
    } finally {
      prepareSpy?.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("TDF-3: /nat_pierce DB-write failure → 500 + structured log + no double-response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let prepareSpy: jest.SpyInstance | null = null;
    try {
      prepareSpy = makeInsertThrow();

      const res = await supertest(app)
        .post("/v1/telemetry/nat_pierce")
        .set("x-musu-telemetry-secret", "test-shared-secret-tdf")
        .send({
          musu_install_id: "install-tdf-3",
          attempt_outcome: "success",
          elapsed_ms: 200,
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("database write failed");

      const errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      expect(
        errorCalls.some((m) =>
          /\[telemetry\] \/nat_pierce: db write failed:/.test(m),
        ),
      ).toBe(true);
      expect(
        errorCalls.some((m) => /Cannot set headers after they are sent/.test(m)),
      ).toBe(false);
    } finally {
      prepareSpy?.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("TDF-4: /agent_spawn DB-write failure → 500 + structured log + no double-response", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let prepareSpy: jest.SpyInstance | null = null;
    try {
      prepareSpy = makeInsertThrow();

      const res = await supertest(app)
        .post("/v1/telemetry/agent_spawn")
        .set("x-musu-telemetry-secret", "test-shared-secret-tdf")
        .send({
          musu_install_id: "install-tdf-4",
          spawn_outcome: "success",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("database write failed");

      const errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      expect(
        errorCalls.some((m) =>
          /\[telemetry\] \/agent_spawn: db write failed:/.test(m),
        ),
      ).toBe(true);
      expect(
        errorCalls.some((m) => /Cannot set headers after they are sent/.test(m)),
      ).toBe(false);
    } finally {
      prepareSpy?.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
