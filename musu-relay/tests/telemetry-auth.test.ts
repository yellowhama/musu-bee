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
} from "../src/signaling/telemetry";

const app = express();
app.use("/v1/telemetry", makeTelemetryRouter());

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
