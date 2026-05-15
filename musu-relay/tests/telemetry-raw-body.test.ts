/**
 * Raw-body capture regression test (V23.2 B1 commit 1 of 6).
 *
 * Wire `express.json({ verify })` so `req.rawBody` carries the literal
 * payload bytes the client POSTed. This is the foundation under HMAC
 * signature verification (commit 3): the signature is computed over raw
 * bytes, NOT over `JSON.stringify(req.body)`, because re-stringifying
 * reorders keys and normalizes whitespace.
 *
 * The critical assertion below uses a body where round-tripping through
 * JSON.parse + JSON.stringify produces different bytes than the input
 * (extra spaces, non-alphabetical key order). If `verify` is wired
 * correctly, `req.rawBody` matches the input exactly; if someone removes
 * the `verify` callback in a future refactor, this test fails and HMAC
 * verification in production would silently break.
 *
 * Mirrors the test pattern in tests/telemetry-auth.test.ts:1-30.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
// No shared secret set in this file — keeps the probe route auth-free and
// isolates the test to raw-body capture. Other test files cover auth.
delete process.env.MUSU_TELEMETRY_SHARED_SECRET;

import supertest from "supertest";
import express from "express";
import {
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
} from "../src/signaling/telemetry";

// Build the production router, then bolt on a probe route that echoes
// req.rawBody (and the parsed body) back to the test. The probe rides on
// the SAME router instance, so it sees exactly the express.json({ verify })
// wiring under test — no shadow-router that could drift from production.
// Stub token validator — this raw-body test doesn't exercise
// /issue_install_key. V23.2 B1 commit 4 dependency injection.
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});
const router = makeTelemetryRouter(stubValidate);
router.post("/_raw_probe", (req, res) => {
  const raw = req.rawBody;
  res.json({
    has_raw: raw !== undefined,
    raw_b64: raw ? raw.toString("base64") : null,
    raw_utf8: raw ? raw.toString("utf8") : null,
    raw_len: raw ? raw.length : null,
    parsed_body: req.body,
  });
});
router.get("/_raw_probe_get", (req, res) => {
  const raw = req.rawBody;
  res.json({
    has_raw: raw !== undefined,
    raw_len: raw ? raw.length : null,
  });
});

const app = express();
app.use("/v1/telemetry", router);

beforeEach(() => _resetDb());
afterAll(() => _closeDb());

describe("V23.2 B1 commit 1 — raw-body capture via express.json({ verify })", () => {
  it("captures the literal POST bytes onto req.rawBody (bytes-not-equal-to-restringify)", async () => {
    // Hand-crafted payload designed to round-trip differently after
    // JSON.parse + JSON.stringify:
    //   - keys are b, a (non-alphabetical, but JSON.stringify preserves
    //     insertion order — however whitespace inside the input would
    //     still be normalized away)
    //   - extra whitespace inside object literal and around the colon
    //     for "a"
    const inputBytes = '{"b":1, "a":  2  }';
    const res = await supertest(app)
      .post("/v1/telemetry/_raw_probe")
      .set("Content-Type", "application/json")
      .send(inputBytes); // supertest forwards the string verbatim when
                          // Content-Type is already set to application/json
    expect(res.status).toBe(200);
    expect(res.body.has_raw).toBe(true);
    // Core invariant: rawBody bytes match the wire bytes exactly.
    expect(res.body.raw_utf8).toBe(inputBytes);
    expect(res.body.raw_len).toBe(Buffer.byteLength(inputBytes, "utf8"));
    // Parsed body recovered correctly (JSON.parse handles the whitespace).
    expect(res.body.parsed_body).toEqual({ a: 2, b: 1 });
    // Anti-invariant: the re-stringified parsed body does NOT match the
    // raw bytes. If this ever became equal (e.g. because someone "fixed"
    // the JSON by removing whitespace upstream), the HMAC scheme would
    // appear to work in tests while silently breaking on real client
    // payloads.
    expect(JSON.stringify(res.body.parsed_body)).not.toBe(inputBytes);
  });

  it("captures rawBody for a normal POST with a well-formed JSON body", async () => {
    const payload = { musu_install_id: "inst-raw-1", attempt_outcome: "success", elapsed_ms: 42 };
    const res = await supertest(app)
      .post("/v1/telemetry/_raw_probe")
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.has_raw).toBe(true);
    // supertest serializes via JSON.stringify when given an object; the
    // raw bytes should equal what supertest put on the wire.
    expect(res.body.raw_utf8).toBe(JSON.stringify(payload));
    expect(res.body.parsed_body).toEqual(payload);
  });

  it("leaves req.rawBody undefined for a GET request (no body parser path)", async () => {
    const res = await supertest(app).get("/v1/telemetry/_raw_probe_get");
    expect(res.status).toBe(200);
    expect(res.body.has_raw).toBe(false);
    expect(res.body.raw_len).toBeNull();
  });
});
