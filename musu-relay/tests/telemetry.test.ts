/**
 * musu.pro telemetry endpoint tests (V23.1 T1.5 + T1.6).
 *
 * Schema-validity, round-trip persistence, validation rejection paths.
 * Uses an in-memory SQLite DB by setting MUSU_TELEMETRY_DB=":memory:"
 * before importing the module.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";

import supertest from "supertest";
import express from "express";
import { makeTelemetryRouter, _resetDb, _closeDb } from "../src/signaling/telemetry";

// Stub token validator — these tests don't exercise /issue_install_key.
// V23.2 B1 commit 4 dependency injection.
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});

const app = express();
app.use("/v1/telemetry", makeTelemetryRouter(stubValidate));

beforeEach(() => _resetDb());
afterAll(() => _closeDb());

describe("POST /v1/telemetry/install", () => {
  it("accepts a minimal valid install event (success path)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send({
        musu_install_id: "install-uuid-1",
        os: "windows",
        os_version: "11.24H2",
        musu_version: "0.23.1",
        wsl2_present_at_start: false,
        wsl2_feature_enabled: false,
        bios_virtualization_detected: "yes",
        step_failed: null,
        step_error_class: null,
        elapsed_ms: 4523,
      });
    expect(res.status).toBe(204);
  });

  it("accepts install event with a failure", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send({
        musu_install_id: "install-uuid-2",
        os: "windows",
        os_version: "10.21H2",
        musu_version: "0.23.1",
        wsl2_present_at_start: false,
        wsl2_feature_enabled: false,
        bios_virtualization_detected: "no",
        step_failed: "wsl_import",
        step_error_class: "hard_blocker_bios",
        elapsed_ms: 2107,
      });
    expect(res.status).toBe(204);
  });

  it("rejects missing musu_install_id", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send({
        os: "linux",
        os_version: "Ubuntu 24.04",
        musu_version: "0.23.1",
        elapsed_ms: 1000,
      });
    expect(res.status).toBe(400);
  });

  it("rejects invalid os value", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send({
        musu_install_id: "x",
        os: "freebsd",
        os_version: "13.0",
        musu_version: "0.23.1",
        elapsed_ms: 1000,
      });
    expect(res.status).toBe(400);
  });

  it("rejects non-integer elapsed_ms", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send({
        musu_install_id: "x",
        os: "macos",
        os_version: "14.0",
        musu_version: "0.23.1",
        elapsed_ms: "4523",
      });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/telemetry/nat_pierce", () => {
  it("accepts success outcome", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/nat_pierce")
      .send({
        musu_install_id: "x",
        attempt_outcome: "success",
        fail_cause: null,
        ice_candidate_count: 4,
        elapsed_ms: 287,
      });
    expect(res.status).toBe(204);
  });

  it("accepts fail outcome with cause", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/nat_pierce")
      .send({
        musu_install_id: "x",
        attempt_outcome: "fail",
        fail_cause: "symmetric_nat",
        ice_candidate_count: 0,
        elapsed_ms: 12000,
      });
    expect(res.status).toBe(204);
  });

  it("rejects invalid outcome", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/nat_pierce")
      .send({
        musu_install_id: "x",
        attempt_outcome: "maybe",
        elapsed_ms: 100,
      });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/telemetry/agent_spawn", () => {
  it("accepts a success spawn", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/agent_spawn")
      .send({
        musu_install_id: "x",
        spawn_outcome: "success",
        cold_start_ms: 521,
        node_count_in_cluster: 2,
      });
    expect(res.status).toBe(204);
  });

  it("rejects without musu_install_id", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/agent_spawn")
      .send({ spawn_outcome: "success" });
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/telemetry/summary", () => {
  it("returns zero counts when no events recorded", async () => {
    const res = await supertest(app).get("/v1/telemetry/summary");
    expect(res.status).toBe(200);
    expect(res.body.install.total).toBe(0);
    expect(res.body.install.failures).toBe(0);
    expect(res.body.install.failure_rate).toBe(0);
    expect(res.body.nat_pierce.total).toBe(0);
    expect(res.body.nat_pierce.success_rate).toBe(0);
  });

  it("aggregates install + nat_pierce counts correctly", async () => {
    // 3 installs: 2 success, 1 fail
    for (let i = 0; i < 3; i++) {
      await supertest(app)
        .post("/v1/telemetry/install")
        .send({
          musu_install_id: `install-${i}`,
          os: "windows",
          os_version: "11.24H2",
          musu_version: "0.23.1",
          step_failed: i === 2 ? "wsl_import" : null,
          step_error_class: i === 2 ? "timeout" : null,
          elapsed_ms: 1000 + i,
        });
    }

    // 5 nat_pierces: 4 success, 1 fail
    for (let i = 0; i < 5; i++) {
      await supertest(app)
        .post("/v1/telemetry/nat_pierce")
        .send({
          musu_install_id: `install-x`,
          attempt_outcome: i === 4 ? "fail" : "success",
          fail_cause: i === 4 ? "symmetric_nat" : null,
          ice_candidate_count: 4,
          elapsed_ms: 200 + i,
        });
    }

    const res = await supertest(app).get("/v1/telemetry/summary");
    expect(res.status).toBe(200);
    expect(res.body.install.total).toBe(3);
    expect(res.body.install.failures).toBe(1);
    expect(res.body.install.failure_rate).toBeCloseTo(1 / 3, 5);
    expect(res.body.nat_pierce.total).toBe(5);
    expect(res.body.nat_pierce.success).toBe(4);
    expect(res.body.nat_pierce.success_rate).toBeCloseTo(4 / 5, 5);
  });
});

describe("schema invariants", () => {
  it("install table accepts NULL for optional fields", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send({
        musu_install_id: "x",
        os: "linux",
        os_version: "Fedora 40",
        musu_version: "0.23.1",
        // all WSL/BIOS/step fields omitted — should be NULL
        elapsed_ms: 1500,
      });
    expect(res.status).toBe(204);
  });
});
