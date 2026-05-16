/**
 * Admin-auth tests for GET /v1/telemetry/summary (V23.2 Workstream B3, wiki/367).
 *
 * Verifies B3 closes the last unauthenticated administrative surface:
 * `/summary` now requires Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>
 * in production, with dev-mode tolerance when the env var is unset and
 * NODE_ENV != "production".
 *
 * Mirrors tests/telemetry-auth.test.ts shape (supertest + makeTelemetryRouter
 * + stub validator). Boot-config prod-posture cases live alongside the
 * write-endpoint cases in tests/telemetry-auth.test.ts.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
process.env.MUSU_TELEMETRY_ADMIN_SECRET = "test-admin-abc";

import supertest from "supertest";
import express from "express";
import {
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
  _resetTelemetryAuthState,
} from "../src/signaling/telemetry";

// Stub token validator — none of these tests hit /issue_install_key.
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});

const app = express();
app.use("/v1/telemetry", makeTelemetryRouter(stubValidate));

beforeEach(() => {
  _resetDb();
  _resetTelemetryAuthState();
});
afterAll(() => {
  _closeDb();
  delete process.env.MUSU_TELEMETRY_ADMIN_SECRET;
});

describe("B3 (wiki/367) — GET /summary requires admin auth when env set", () => {
  it("rejects /summary with no Authorization header (401)", async () => {
    const res = await supertest(app).get("/v1/telemetry/summary");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing|admin/i);
  });

  it("rejects /summary with empty Bearer token (401)", async () => {
    // Critic L1: `Authorization: Bearer ` (trailing space, zero-length
    // token). Regex /^Bearer\s+(.+)$/i requires ≥1 char after the scheme.
    const res = await supertest(app)
      .get("/v1/telemetry/summary")
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing|admin/i);
  });

  it("rejects /summary with wrong scheme (401)", async () => {
    // Basic <base64> — non-Bearer scheme. Parser refuses; same outcome
    // as a missing header.
    const res = await supertest(app)
      .get("/v1/telemetry/summary")
      .set("Authorization", "Basic dGVzdC1hZG1pbi1hYmM=");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing|admin/i);
  });

  it("accepts /summary with lowercase 'bearer' scheme (200)", async () => {
    // Critic M3: RFC 7235 §2.1 auth-scheme tokens are case-insensitive.
    // Regex /^Bearer\s+(.+)$/i honors this — lowercase "bearer" must
    // be accepted identically to "Bearer".
    const res = await supertest(app)
      .get("/v1/telemetry/summary")
      .set("Authorization", "bearer test-admin-abc");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("install");
    expect(res.body).toHaveProperty("nat_pierce");
  });

  it("rejects /summary with Bearer token mismatch (401)", async () => {
    const res = await supertest(app)
      .get("/v1/telemetry/summary")
      .set("Authorization", "Bearer wrong-secret");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/bad admin secret/i);
  });

  it("accepts /summary with matching Bearer token (200)", async () => {
    const res = await supertest(app)
      .get("/v1/telemetry/summary")
      .set("Authorization", "Bearer test-admin-abc");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("install");
    expect(res.body).toHaveProperty("nat_pierce");
  });
});

describe("B3 (wiki/367) — dev-mode tolerance when env unset", () => {
  // This block clears MUSU_TELEMETRY_ADMIN_SECRET before its tests run,
  // and restores it after, so the outer describe block remains unaffected.
  let savedSecret: string | undefined;

  beforeAll(() => {
    savedSecret = process.env.MUSU_TELEMETRY_ADMIN_SECRET;
    delete process.env.MUSU_TELEMETRY_ADMIN_SECRET;
  });
  afterAll(() => {
    if (savedSecret !== undefined) {
      process.env.MUSU_TELEMETRY_ADMIN_SECRET = savedSecret;
    }
  });

  it("env unset + NODE_ENV=test → returns 200 without header (dev-mode tolerance)", async () => {
    // jest sets NODE_ENV=test by default. With the admin secret unset,
    // requireAdminSecret returns true after logging a one-time warning.
    // Production posture is gated by checkTelemetryAuthBootConfig (tested
    // separately in tests/telemetry-auth.test.ts).
    expect(process.env.NODE_ENV).not.toBe("production");
    const res = await supertest(app).get("/v1/telemetry/summary");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("install");
    expect(res.body).toHaveProperty("nat_pierce");
  });
});
