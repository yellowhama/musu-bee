/**
 * POST /v1/telemetry/issue_install_key tests (V23.2 B1 commit 4 of 6).
 *
 * Covers wiki/363 §2.4 (request/response shape) and §3.3 FINAL (the
 * try/catch race fix that closes Critic HIGH #3).
 *
 * What the route does:
 *   1. Validates a musu.pro tunnel token via the injected validateToken
 *      stub (production wires this to signaling/server.ts:99 validateToken).
 *   2. Derives canonical user_id from the validator response.
 *   3. Generates a fresh 32-byte hex account_key.
 *   4. INSERTs (user_id, account_key, first_install_id, issued_at) into
 *      telemetry_account_keys. user_id is PRIMARY KEY.
 *   5. On INSERT race (PRIMARY KEY / UNIQUE constraint violation), the
 *      loser re-SELECTs the winner's issued_at and returns 409 WITHOUT
 *      echoing the existing account_key (paranoid non-leak).
 *
 * Design A: when validator returns {valid:true, userId:null}, the route
 * returns 503 — refuses to issue against the v21-era musu.pro fallback
 * (wiki/363 §1 ordering flip). musu.pro B2 must deploy before B1 cutover.
 *
 * Test pattern mirrors tests/telemetry-hmac.test.ts: in-memory DB, fresh
 * router per describe via injected stub, _resetDb between tests.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
// No shared secret — /issue_install_key is OUTSIDE requireInstallHmac and
// auth is by the tunnel_token in the body, not headers.
delete process.env.MUSU_TELEMETRY_SHARED_SECRET;

import supertest from "supertest";
import express from "express";
import {
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
  _getDbForTests,
  TelemetryTokenValidator,
} from "../src/signaling/telemetry";

// ── Test plumbing ────────────────────────────────────────────────────────
//
// The validator is mutable per-test: each test overrides `currentValidator`
// before issuing the supertest call. We mount ONE router (and thus one
// router-scoped DB instance) for the whole file via a thin closure that
// dispatches to whatever `currentValidator` points at right now. This
// avoids re-mounting routers (which would not re-share the :memory: DB).
let currentValidator: TelemetryTokenValidator = async () => ({
  valid: false,
  userId: null,
});
const dispatchValidator: TelemetryTokenValidator = (token) =>
  currentValidator(token);

const app = express();
app.use("/v1/telemetry", makeTelemetryRouter(dispatchValidator));

const TEST_USER = "usr_test_iik";
const OTHER_USER = "usr_test_other";

beforeEach(() => {
  _resetDb();
  currentValidator = async () => ({ valid: false, userId: null });
});

afterAll(() => {
  _closeDb();
});

describe("POST /v1/telemetry/issue_install_key — body validation", () => {
  it("400 on missing tunnel_token", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing tunnel_token");
  });

  it("400 on empty-string tunnel_token", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing tunnel_token");
  });

  it("400 on non-string tunnel_token (defensive)", async () => {
    // asStr() rejects numbers etc; treated as missing.
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing tunnel_token");
  });
});

describe("POST /v1/telemetry/issue_install_key — validator outcomes", () => {
  it("401 when validateToken returns {valid:false}", async () => {
    currentValidator = async () => ({ valid: false, userId: null });
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "bad-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid tunnel_token");
  });

  it("503 when validateToken returns {valid:true, userId:null} (Design A)", async () => {
    // This is the v21-era musu.pro upstream behavior. Until B2 deploys
    // and /validate returns the canonical user_id, the route refuses to
    // issue rather than fall back to a hash-of-token surrogate (wiki/363
    // §1 ordering flip).
    currentValidator = async () => ({ valid: true, userId: null });
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-but-no-canonical" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/canonical user_id not available/);
    expect(res.body.error).toMatch(/B2/);
  });

  it("502 when validateToken throws (upstream / circuit error)", async () => {
    currentValidator = async () => {
      throw new Error("network down");
    };
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "anything" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("validation upstream error");
    // Must not leak the underlying error message — recovery is the same
    // either way (retry with backoff).
    expect(JSON.stringify(res.body)).not.toMatch(/network down/);
  });
});

describe("POST /v1/telemetry/issue_install_key — happy path (fresh issuance)", () => {
  beforeEach(() => {
    currentValidator = async () => ({ valid: true, userId: TEST_USER });
  });

  it("200 with 64-hex account_key + user_id + issued_at (seconds)", async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "inst-iik-1" });
    const after = Math.floor(Date.now() / 1000);
    expect(res.status).toBe(200);
    expect(typeof res.body.account_key).toBe("string");
    expect(res.body.account_key).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.user_id).toBe(TEST_USER);
    expect(typeof res.body.issued_at).toBe("number");
    // issued_at is unix SECONDS (Stripe-aligned), not ms.
    expect(res.body.issued_at).toBeGreaterThanOrEqual(before);
    expect(res.body.issued_at).toBeLessThanOrEqual(after);
    // Sanity: 2026-05-16 ≈ 1.78e9 seconds, far short of ms-magnitude ~1.78e12.
    expect(res.body.issued_at).toBeLessThan(1e11);
  });

  it("DB row exists after issuance with matching user_id + account_key", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "inst-iik-2" });
    expect(res.status).toBe(200);
    const row = _getDbForTests()
      .prepare(
        "SELECT user_id, account_key, first_install_id, issued_at, last_seen_at, rotated_at FROM telemetry_account_keys WHERE user_id = ?",
      )
      .get(TEST_USER) as
      | {
          user_id: string;
          account_key: string;
          first_install_id: string;
          issued_at: number;
          last_seen_at: number | null;
          rotated_at: number | null;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.user_id).toBe(TEST_USER);
    expect(row!.account_key).toBe(res.body.account_key);
    expect(row!.first_install_id).toBe("inst-iik-2");
    // DB column stores milliseconds; response field is seconds. Both
    // must point at the same instant.
    expect(Math.floor(row!.issued_at / 1000)).toBe(res.body.issued_at);
    expect(row!.last_seen_at).toBeNull();
    expect(row!.rotated_at).toBeNull();
  });

  it("two consecutive issuances for different user_ids both succeed", async () => {
    // Sanity: PK is user_id, so different users don't collide.
    currentValidator = async () => ({ valid: true, userId: TEST_USER });
    const r1 = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "t1", musu_install_id: "i1" });
    expect(r1.status).toBe(200);

    currentValidator = async () => ({ valid: true, userId: OTHER_USER });
    const r2 = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "t2", musu_install_id: "i2" });
    expect(r2.status).toBe(200);

    expect(r1.body.account_key).not.toBe(r2.body.account_key);
    expect(r1.body.user_id).toBe(TEST_USER);
    expect(r2.body.user_id).toBe(OTHER_USER);
  });

  it("issuance with no musu_install_id in body still succeeds (hint only)", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token" });
    expect(res.status).toBe(200);
    expect(res.body.account_key).toMatch(/^[0-9a-f]{64}$/);
    // first_install_id defaults to empty string when hint absent.
    const row = _getDbForTests()
      .prepare(
        "SELECT first_install_id FROM telemetry_account_keys WHERE user_id = ?",
      )
      .get(TEST_USER) as { first_install_id: string };
    expect(row.first_install_id).toBe("");
  });
});

describe("POST /v1/telemetry/issue_install_key — race / collision (Critic HIGH #3)", () => {
  beforeEach(() => {
    currentValidator = async () => ({ valid: true, userId: TEST_USER });
  });

  it("409 on second call for same user_id (rotation OOS — wiki/363 §2.4)", async () => {
    const r1 = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "i1" });
    expect(r1.status).toBe(200);
    const firstKey = r1.body.account_key;
    const firstIssuedAt = r1.body.issued_at;

    const r2 = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "i2" });
    expect(r2.status).toBe(409);
    expect(r2.body.error).toMatch(/already issued/);
    // 409 must carry the issued_at of the WINNER (stored in DB as ms).
    expect(typeof r2.body.issued_at).toBe("number");
    // The first response converted ms→s; the 409 carries the raw ms
    // column. Confirm it's the same instant:
    expect(Math.floor(r2.body.issued_at / 1000)).toBe(firstIssuedAt);

    // Paranoid non-leak: response must NOT echo the previously-issued
    // account_key in body OR headers (mirrors the telemetry-auth.test.ts
    // "no echo" pattern).
    expect(r2.body.account_key).toBeUndefined();
    const headersStr = JSON.stringify(r2.headers);
    expect(headersStr).not.toContain(firstKey);
    const bodyStr = JSON.stringify(r2.body);
    expect(bodyStr).not.toContain(firstKey);
  });

  it("409 also delivers a hint pointing at B1.x for rotation", async () => {
    // Keep the operator-facing copy aligned with the plan §2.4: rotation
    // is OUT OF SCOPE for B1 and will land in B1.x.
    await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "i1" });
    const r2 = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "i2" });
    expect(r2.status).toBe(409);
    expect(r2.body.hint).toMatch(/B1\.x/);
  });

  it("concurrent POSTs for same user_id: exactly one 200 + at least one 409 (race path coverage)", async () => {
    // better-sqlite3 is synchronous and Express request handlers are
    // serialized in tests, so true concurrency isn't achievable in JS.
    // What we CAN do is fire two awaits via Promise.all and confirm the
    // try/catch race path is reachable — the second handler hits the
    // PRIMARY KEY constraint and returns 409 instead of 500. Without
    // the try/catch the loser would 500 with an unhelpful body.
    const [a, b] = await Promise.all([
      supertest(app)
        .post("/v1/telemetry/issue_install_key")
        .send({ tunnel_token: "t-a", musu_install_id: "ia" }),
      supertest(app)
        .post("/v1/telemetry/issue_install_key")
        .send({ tunnel_token: "t-b", musu_install_id: "ib" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    // The winner's account_key must be the one in the DB.
    const winner = a.status === 200 ? a : b;
    const stored = _getDbForTests()
      .prepare("SELECT account_key FROM telemetry_account_keys WHERE user_id = ?")
      .get(TEST_USER) as { account_key: string };
    expect(stored.account_key).toBe(winner.body.account_key);
  });

  it("seeded-row scenario: pre-existing row → 409 with that row's issued_at", async () => {
    // Mimic the multi-machine case where Machine A registered earlier
    // (perhaps via a different process) and Machine B is now retrying.
    const preExistingIssuedAt = Date.now() - 5000; // 5s ago
    _getDbForTests()
      .prepare(
        `INSERT INTO telemetry_account_keys
           (user_id, account_key, first_install_id, issued_at, last_seen_at, rotated_at)
         VALUES (?, ?, ?, ?, NULL, NULL)`,
      )
      .run(TEST_USER, "c".repeat(64), "inst-pre", preExistingIssuedAt);

    const res = await supertest(app)
      .post("/v1/telemetry/issue_install_key")
      .send({ tunnel_token: "valid-token", musu_install_id: "inst-late" });
    expect(res.status).toBe(409);
    expect(res.body.issued_at).toBe(preExistingIssuedAt);
    // Non-leak invariant — must not echo the seeded key.
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain("c".repeat(64));
  });
});
