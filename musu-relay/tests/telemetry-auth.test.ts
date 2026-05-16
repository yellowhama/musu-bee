/**
 * Shared-secret telemetry auth tests (V23.2 T2.AUTH.2 interim).
 *
 * Verifies V23.1 audit HIGH #2 is closed for the interim: a 3rd party
 * without the shared secret cannot POST telemetry. Per-install HMAC
 * tightening lands in T2.AUTH.2-final (Workstream B).
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
process.env.MUSU_TELEMETRY_SHARED_SECRET = "test-secret-abc";

import supertest from "supertest";
import express from "express";
import {
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
  _resetTelemetryAuthState,
  checkTelemetryAuthBootConfig,
} from "../src/signaling/telemetry";

// Stub token validator — these tests don't exercise /issue_install_key,
// so the stub just needs to exist to satisfy makeTelemetryRouter's signature
// (V23.2 B1 commit 4 dependency injection).
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});

const app = express();
app.use("/v1/telemetry", makeTelemetryRouter(stubValidate));

beforeEach(() => _resetDb());
afterAll(() => {
  _closeDb();
  delete process.env.MUSU_TELEMETRY_SHARED_SECRET;
});

const validInstall = {
  musu_install_id: "install-auth-1",
  os: "windows",
  os_version: "11.24H2",
  musu_version: "0.23.1",
  elapsed_ms: 1000,
};

describe("T2.AUTH.2 interim — shared-secret required when env set", () => {
  it("rejects /install with no header (401)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send(validInstall);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/secret/);
  });

  it("rejects /install with wrong header value (401)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-secret", "wrong-secret")
      .send(validInstall);
    expect(res.status).toBe(401);
  });

  it("accepts /install with correct header (204)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-secret", "test-secret-abc")
      .send(validInstall);
    expect(res.status).toBe(204);
  });

  it("rejects /nat_pierce without header", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/nat_pierce")
      .send({
        musu_install_id: "x",
        attempt_outcome: "success",
        elapsed_ms: 200,
      });
    expect(res.status).toBe(401);
  });

  it("accepts /nat_pierce with header", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/nat_pierce")
      .set("x-musu-telemetry-secret", "test-secret-abc")
      .send({
        musu_install_id: "x",
        attempt_outcome: "success",
        elapsed_ms: 200,
      });
    expect(res.status).toBe(204);
  });

  it("rejects /agent_spawn without header", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/agent_spawn")
      .send({ musu_install_id: "x", spawn_outcome: "success" });
    expect(res.status).toBe(401);
  });

  it("accepts /agent_spawn with header", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/agent_spawn")
      .set("x-musu-telemetry-secret", "test-secret-abc")
      .send({ musu_install_id: "x", spawn_outcome: "success" });
    expect(res.status).toBe(204);
  });

  it("GET /summary requires admin auth (B3 wiki/367); dev-mode tolerates absent secret", async () => {
    // B3 (wiki/367) rewrote this test. Post-B3, GET /summary requires
    // `Authorization: Bearer <MUSU_TELEMETRY_ADMIN_SECRET>` when the env
    // var is set; when unset and NODE_ENV != "production", dev-mode
    // tolerance applies. Critic HIGH-1 mandates this test exercise BOTH
    // assertions in the same commit that adds the middleware.
    //
    // Assertion (a): env-set + bearer header → 200.
    process.env.MUSU_TELEMETRY_ADMIN_SECRET = "test-admin-xyz";
    _resetTelemetryAuthState();
    const resA = await supertest(app)
      .get("/v1/telemetry/summary")
      .set("Authorization", "Bearer test-admin-xyz");
    expect(resA.status).toBe(200);

    // Assertion (b): env-unset + NODE_ENV=test → 200 with warn-once
    // trigger. Reset state so the warn-once flag re-fires; remove the
    // env var; bare GET; expect 200. The console.warn is a side-effect
    // we capture-and-restore around the request.
    delete process.env.MUSU_TELEMETRY_ADMIN_SECRET;
    _resetTelemetryAuthState();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const resB = await supertest(app).get("/v1/telemetry/summary");
      expect(resB.status).toBe(200);
      // Warn-once must have fired with the wiki/367 reference.
      const calls = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((m) => /MUSU_TELEMETRY_ADMIN_SECRET/.test(m))).toBe(true);
      expect(calls.some((m) => /B3 wiki\/367/.test(m))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("T2.AUTH.2 boot config (audit HIGH #3)", () => {
  it("returns null in non-production even when secret is unset", () => {
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("returns error string in production when secret unset", () => {
    // NODE_ENV=production with NEITHER MUSU_TELEMETRY_SHARED_SECRET nor
    // MUSU_TELEMETRY_HMAC_ONLY → refuse to start. Error string must
    // mention both env vars so the operator knows their two options.
    const err = checkTelemetryAuthBootConfig({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(err).not.toBeNull();
    expect(err).toMatch(/MUSU_TELEMETRY_SHARED_SECRET/);
    expect(err).toMatch(/MUSU_TELEMETRY_HMAC_ONLY/);
    expect(err).toMatch(/Refusing to start/);
  });

  it("returns null in production when secret is set", () => {
    // Post-B3 (wiki/367): production now requires BOTH write-auth and
    // admin-auth (MUSU_TELEMETRY_ADMIN_SECRET). The original test
    // exercised the shared-secret-set path; we keep that intent but also
    // satisfy the admin-auth requirement so the assertion under test is
    // truly "write-auth via SHARED_SECRET is sufficient on its axis".
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_SHARED_SECRET: "set-correctly",
        MUSU_TELEMETRY_ADMIN_SECRET: "admin-set-correctly",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  // B1 commit 6 (wiki/363 §7.4, §8 step 4): HMAC-only cutover means
  // SHARED_SECRET is no longer mandatory in production.
  it("returns null in production when MUSU_TELEMETRY_HMAC_ONLY=1 even without MUSU_TELEMETRY_SHARED_SECRET", () => {
    // Post-B3 (wiki/367): admin-auth must also be configured.
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_HMAC_ONLY: "1",
        MUSU_TELEMETRY_ADMIN_SECRET: "admin-set-correctly",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("returns error string in production when both MUSU_TELEMETRY_SHARED_SECRET and MUSU_TELEMETRY_HMAC_ONLY unset", () => {
    // Explicit re-statement of the failure mode: empty env (modulo
    // NODE_ENV) is the dangerous state and must refuse to start. The
    // error must enumerate BOTH legitimate paths so the operator can
    // choose dual-accept or HMAC-only.
    const err = checkTelemetryAuthBootConfig({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(err).not.toBeNull();
    expect(err).toMatch(/MUSU_TELEMETRY_SHARED_SECRET/);
    expect(err).toMatch(/MUSU_TELEMETRY_HMAC_ONLY/);
  });

  it("returns null in production when BOTH MUSU_TELEMETRY_SHARED_SECRET and MUSU_TELEMETRY_HMAC_ONLY=1 are set", () => {
    // Defensive belt-and-suspenders: during cutover an operator may
    // set HMAC_ONLY=1 while still keeping the old shared-secret env
    // around for rollback. Boot must not block on that combination.
    // Post-B3 (wiki/367): admin-auth must also be configured.
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_SHARED_SECRET: "set-correctly",
        MUSU_TELEMETRY_HMAC_ONLY: "1",
        MUSU_TELEMETRY_ADMIN_SECRET: "admin-set-correctly",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("returns error string in production when MUSU_TELEMETRY_HMAC_ONLY is set but not '1'", () => {
    // Truthy-string parsing fork: the env-var contract is the literal
    // string "1" (matches the runtime check in requireInstallHmac).
    // "true", "yes", "0" all fail the gate. This guards against an
    // operator who set HMAC_ONLY=true and assumed it took effect.
    const err = checkTelemetryAuthBootConfig({
      NODE_ENV: "production",
      MUSU_TELEMETRY_HMAC_ONLY: "true",
    } as NodeJS.ProcessEnv);
    expect(err).not.toBeNull();
    expect(err).toMatch(/MUSU_TELEMETRY_HMAC_ONLY/);
  });

  // ── B3 (wiki/367) admin-auth boot-config additions ───────────────────
  // The new admin-auth axis is independent of the write-auth axis above.
  // Production must satisfy BOTH: write-auth (shared-secret OR HMAC-only)
  // AND admin-auth (MUSU_TELEMETRY_ADMIN_SECRET set).

  it("refuses to start when NODE_ENV=production + MUSU_TELEMETRY_ADMIN_SECRET unset (B3)", () => {
    // Even when write-auth is correctly configured, the function must
    // return a non-null error string mentioning ADMIN_SECRET when the
    // admin-auth env var is missing. Verifies the two axes are
    // independent and both gate production startup.
    const err = checkTelemetryAuthBootConfig({
      NODE_ENV: "production",
      MUSU_TELEMETRY_SHARED_SECRET: "set-correctly",
    } as NodeJS.ProcessEnv);
    expect(err).not.toBeNull();
    expect(err).toMatch(/MUSU_TELEMETRY_ADMIN_SECRET/);
  });

  it("accepts NODE_ENV=production when BOTH write-auth and admin-auth are configured (B3)", () => {
    // Happy path post-B3: both axes satisfied → null. This is the
    // expected production posture after operator runs
    // `fly secrets set MUSU_TELEMETRY_ADMIN_SECRET=...`.
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_SHARED_SECRET: "write-set",
        MUSU_TELEMETRY_ADMIN_SECRET: "admin-set",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("refuses to start when admin-secret set but write-auth unset (B3 / Critic M2)", () => {
    // Critic M2: admin-auth and write-auth axes are independent. Setting
    // ADMIN_SECRET alone does NOT satisfy the write-auth gate; boot must
    // still refuse. Error mentions the unmet write-auth condition (the
    // SHARED_SECRET / HMAC_ONLY error path).
    const err = checkTelemetryAuthBootConfig({
      NODE_ENV: "production",
      MUSU_TELEMETRY_ADMIN_SECRET: "admin-set",
    } as NodeJS.ProcessEnv);
    expect(err).not.toBeNull();
    expect(err).toMatch(/MUSU_TELEMETRY_SHARED_SECRET|MUSU_TELEMETRY_HMAC_ONLY/);
  });

  it("non-prod ignores admin-secret check (B3 / Critic M2)", () => {
    // Critic M2: dev / test environments must remain unaffected by the
    // admin-auth tightening. Mirrors the existing non-prod-ignores-
    // write-auth test at the top of this describe block.
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});

describe("T2.AUTH.2 interim — wrong-secret leaks no body", () => {
  it("401 response does not echo expected secret", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-secret", "attacker-guess")
      .send(validInstall);
    expect(res.status).toBe(401);
    // The whole serialized response must not contain our test secret.
    expect(JSON.stringify(res.body)).not.toContain("test-secret-abc");
    expect(JSON.stringify(res.headers)).not.toContain("test-secret-abc");
  });
});
