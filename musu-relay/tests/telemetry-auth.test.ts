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

  it("GET /summary remains accessible (admin-internal in V23.2)", async () => {
    const res = await supertest(app).get("/v1/telemetry/summary");
    expect(res.status).toBe(200);
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
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_SHARED_SECRET: "set-correctly",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  // B1 commit 6 (wiki/363 §7.4, §8 step 4): HMAC-only cutover means
  // SHARED_SECRET is no longer mandatory in production.
  it("returns null in production when MUSU_TELEMETRY_HMAC_ONLY=1 even without MUSU_TELEMETRY_SHARED_SECRET", () => {
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_HMAC_ONLY: "1",
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
    expect(
      checkTelemetryAuthBootConfig({
        NODE_ENV: "production",
        MUSU_TELEMETRY_SHARED_SECRET: "set-correctly",
        MUSU_TELEMETRY_HMAC_ONLY: "1",
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
