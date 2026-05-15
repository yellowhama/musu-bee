/**
 * Per-account HMAC telemetry auth tests (V23.2 T2.AUTH.2-final / B1).
 *
 * Closes wiki/363 §7.1 + §7.3: requireInstallHmac() verifies
 *   X-Musu-Telemetry-Signature: t=<unix>,v1=<hex>
 * over `${t}.${rawBody}` against telemetry_account_keys.account_key for
 * the user_id supplied in X-Musu-User-Id.
 *
 * Dual-accept rollout: when MUSU_TELEMETRY_HMAC_ONLY is unset, a request
 * with NEITHER HMAC header falls through to requireTelemetrySecret(); a
 * request that DOES carry HMAC headers is judged exclusively on HMAC.
 * MUSU_TELEMETRY_HMAC_ONLY=1 severs the fallthrough.
 *
 * The raw-body invariant test (§7.1 #l) is the load-bearing one: it
 * proves req.rawBody from commit 1 reaches the HMAC verifier as the
 * literal bytes the client posted, not a re-stringification of req.body.
 */

process.env.MUSU_TELEMETRY_DB = ":memory:";
// Shared secret is set so the dual-accept fallthrough has a concrete
// secret to compare against. Individual tests that need
// MUSU_TELEMETRY_HMAC_ONLY=1 set it themselves and restore in afterEach.
process.env.MUSU_TELEMETRY_SHARED_SECRET = "test-secret-hmac";

import supertest from "supertest";
import express from "express";
import { createHmac } from "crypto";
import {
  makeTelemetryRouter,
  _resetDb,
  _closeDb,
  _getDbForTests,
} from "../src/signaling/telemetry";

// Stub token validator — these HMAC tests don't exercise /issue_install_key.
// The stub satisfies makeTelemetryRouter's signature (V23.2 B1 commit 4
// dependency injection).
const stubValidate = async (_token: string) => ({
  valid: false,
  userId: null,
});

const app = express();
app.use("/v1/telemetry", makeTelemetryRouter(stubValidate));

const TEST_USER = "usr_test_01";
const TEST_KEY = "a".repeat(64); // 64-hex deterministic test key
const WRONG_KEY = "b".repeat(64);
const TEST_INSTALL = "inst-test-1";

function seedKey(userId: string, accountKey: string): void {
  _getDbForTests()
    .prepare(
      `INSERT OR REPLACE INTO telemetry_account_keys
         (user_id, account_key, first_install_id, issued_at, last_seen_at, rotated_at)
       VALUES (?, ?, ?, ?, NULL, NULL)`,
    )
    .run(userId, accountKey, TEST_INSTALL, Date.now());
}

function signBody(
  key: string,
  rawBody: string,
  t: number,
): string {
  return createHmac("sha256", key)
    .update(`${t}.${rawBody}`)
    .digest("hex");
}

const validInstallObj = {
  musu_install_id: "inst-h-1",
  os: "windows" as const,
  os_version: "11.24H2",
  musu_version: "0.23.2",
  elapsed_ms: 1500,
};

beforeEach(() => {
  _resetDb();
  // Ensure HMAC_ONLY is unset by default; tests that need it opt in.
  delete process.env.MUSU_TELEMETRY_HMAC_ONLY;
});

afterAll(() => {
  _closeDb();
  delete process.env.MUSU_TELEMETRY_SHARED_SECRET;
  delete process.env.MUSU_TELEMETRY_HMAC_ONLY;
});

describe("requireInstallHmac — header & format validation (HMAC_ONLY)", () => {
  beforeEach(() => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
  });

  it("rejects /install with no headers (HMAC_ONLY=1) → 401 missing signature", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing signature");
  });

  it("rejects /install with X-Musu-User-Id only → 401 missing signature", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing signature");
  });

  it("rejects /install with signature header but no user-id → 401 missing signature", async () => {
    const t = Math.floor(Date.now() / 1000);
    const v1 = signBody(TEST_KEY, JSON.stringify(validInstallObj), t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing signature");
  });

  it("rejects /install with malformed signature 'v1=abc' (no t=) → 401 malformed signature", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", "v1=abc")
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("malformed signature");
  });

  it("rejects /install with non-hex v1 → 401 malformed signature", async () => {
    const t = Math.floor(Date.now() / 1000);
    // 'g' and 'z' are out of [0-9a-f]
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=gghhzzqq`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("malformed signature");
  });

  it("rejects /install with non-digit t → 401 malformed signature", async () => {
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", "t=notanumber,v1=abcd")
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("malformed signature");
  });

  it("rejects /install with uppercase hex v1 → 401 malformed signature", async () => {
    // Lowercase-hex constraint is part of the wire spec (wiki/363 §2.1).
    const t = Math.floor(Date.now() / 1000);
    const v1 = signBody(TEST_KEY, JSON.stringify(validInstallObj), t).toUpperCase();
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("malformed signature");
  });
});

describe("requireInstallHmac — replay window (HMAC_ONLY)", () => {
  beforeEach(() => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
  });

  it("rejects /install with t in the past beyond 300s → 401 expired", async () => {
    const t = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
    const v1 = signBody(TEST_KEY, JSON.stringify(validInstallObj), t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("expired or future-dated signature");
  });

  it("rejects /install with t in the future beyond 300s → 401 future-dated", async () => {
    const t = Math.floor(Date.now() / 1000) + 600;
    const v1 = signBody(TEST_KEY, JSON.stringify(validInstallObj), t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("expired or future-dated signature");
  });
});

describe("requireInstallHmac — account lookup & signature compare", () => {
  it("rejects /install with unknown user_id when HMAC_ONLY=1 → 401 unknown account", async () => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    // Do NOT seed a row for TEST_USER.
    const t = Math.floor(Date.now() / 1000);
    const v1 = signBody(TEST_KEY, JSON.stringify(validInstallObj), t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unknown account");
  });

  it("rejects /install with valid headers + known user but wrong key → 401 invalid signature", async () => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
    const t = Math.floor(Date.now() / 1000);
    const v1 = signBody(WRONG_KEY, JSON.stringify(validInstallObj), t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid signature");
  });

  it("rejects /install when supplied v1 has wrong byte length → 401 invalid signature", async () => {
    // 60 hex chars = 30 bytes ≠ HMAC-SHA256's 32 bytes. Caught by the
    // length precheck before timingSafeEqual.
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
    const t = Math.floor(Date.now() / 1000);
    const shortV1 = "a".repeat(60);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${shortV1}`)
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid signature");
  });

  it("accepts /install with valid signature → 204 + updates last_seen_at", async () => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
    const before = _getDbForTests()
      .prepare("SELECT last_seen_at FROM telemetry_account_keys WHERE user_id=?")
      .get(TEST_USER) as { last_seen_at: number | null };
    expect(before.last_seen_at).toBeNull();

    const t = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(validInstallObj);
    const v1 = signBody(TEST_KEY, rawBody, t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(rawBody);
    expect(res.status).toBe(204);

    const after = _getDbForTests()
      .prepare("SELECT last_seen_at FROM telemetry_account_keys WHERE user_id=?")
      .get(TEST_USER) as { last_seen_at: number | null };
    expect(after.last_seen_at).not.toBeNull();
    expect(after.last_seen_at!).toBeGreaterThan(0);
  });

  it("accepts /install with v1=t order reversed in header → 204", async () => {
    // Parser tolerates either ordering per §5 "Tolerate any order".
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
    const t = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(validInstallObj);
    const v1 = signBody(TEST_KEY, rawBody, t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `v1=${v1},t=${t}`)
      .send(rawBody);
    expect(res.status).toBe(204);
  });
});

describe("requireInstallHmac — raw-body invariant (commit 1 thread-through)", () => {
  it("verifies HMAC over EXACT raw bytes (non-canonical whitespace) → 204; same data via re-stringification → 401", async () => {
    // This is the load-bearing test. It proves that
    //   1) `req.rawBody` from commit 1 reaches the verifier as the
    //      literal bytes the client posted, AND
    //   2) the verifier does NOT re-stringify req.body (which would
    //      normalize whitespace + reorder keys).
    //
    // We construct a body with non-canonical whitespace, compute HMAC
    // over those exact bytes, and POST raw → 204.
    //
    // Then we POST the same logical object via supertest.send(obj),
    // which superagent JSON.stringify()'s into canonical form, with the
    // SAME signature → 401, because the canonical bytes hash to a
    // different HMAC than what we signed.

    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);

    const nonCanonicalBody =
      '{"musu_install_id":"inst-h-2",  "os":"linux"  ,"os_version":"5.15","musu_version":"0.23.2","elapsed_ms":1234}';
    const t = Math.floor(Date.now() / 1000);
    const v1 = signBody(TEST_KEY, nonCanonicalBody, t);

    // Step 1: post the exact bytes → must succeed.
    const okRes = await supertest(app)
      .post("/v1/telemetry/install")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(nonCanonicalBody);
    expect(okRes.status).toBe(204);

    // Step 2: supertest.send(obj) re-stringifies canonically. Same
    // signature → should fail because the bytes the server sees no
    // longer match what we signed.
    const canonicalObj = {
      musu_install_id: "inst-h-2",
      os: "linux",
      os_version: "5.15",
      musu_version: "0.23.2",
      elapsed_ms: 1234,
    };
    const badRes = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(canonicalObj);
    expect(badRes.status).toBe(401);
    expect(badRes.body.error).toBe("invalid signature");
  });
});

describe("requireInstallHmac — sanity on /nat_pierce and /agent_spawn", () => {
  beforeEach(() => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
  });

  it("accepts /nat_pierce with valid signature → 204", async () => {
    const body = {
      musu_install_id: "inst-h-1",
      attempt_outcome: "success" as const,
      elapsed_ms: 200,
    };
    const t = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify(body);
    const v1 = signBody(TEST_KEY, raw, t);
    const res = await supertest(app)
      .post("/v1/telemetry/nat_pierce")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(raw);
    expect(res.status).toBe(204);
  });

  it("accepts /agent_spawn with valid signature → 204", async () => {
    const body = {
      musu_install_id: "inst-h-1",
      spawn_outcome: "success" as const,
    };
    const t = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify(body);
    const v1 = signBody(TEST_KEY, raw, t);
    const res = await supertest(app)
      .post("/v1/telemetry/agent_spawn")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(raw);
    expect(res.status).toBe(204);
  });
});

describe("requireInstallHmac — dual-accept fallthrough (HMAC_ONLY unset)", () => {
  it("with HMAC_ONLY unset AND no HMAC headers: shared-secret POST succeeds (legacy gateway path)", async () => {
    // Default state: MUSU_TELEMETRY_HMAC_ONLY is unset (beforeEach deletes it).
    // MUSU_TELEMETRY_SHARED_SECRET=test-secret-hmac was set at top of file.
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-secret", "test-secret-hmac")
      .send(validInstallObj);
    expect(res.status).toBe(204);
  });

  it("with HMAC_ONLY unset AND no HMAC headers AND shared secret wrong: 401 from shared-secret middleware", async () => {
    // Verifies fallthrough actually delegates to requireTelemetrySecret —
    // not silently allow-all.
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-secret", "wrong")
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/secret/);
  });

  it("with HMAC_ONLY unset AND user has issued key AND request carries valid HMAC: 204 (HMAC honored)", async () => {
    seedKey(TEST_USER, TEST_KEY);
    const t = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify(validInstallObj);
    const v1 = signBody(TEST_KEY, raw, t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .send(raw);
    expect(res.status).toBe(204);
  });

  it("with HMAC_ONLY=1 AND no HMAC headers AND user has row: 401 (no shared-secret fallthrough)", async () => {
    process.env.MUSU_TELEMETRY_HMAC_ONLY = "1";
    seedKey(TEST_USER, TEST_KEY);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("x-musu-telemetry-secret", "test-secret-hmac")
      .send(validInstallObj);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing signature");
  });

  // B1 commit 6 fallthrough-guard (wiki/363 §5, plan §5 dual-accept
  // rollout). Once a request emits HMAC headers it has opted into the
  // HMAC path; unknown-account / signature-mismatch errors must NOT
  // fall back to shared-secret, even when HMAC_ONLY is unset and even
  // when a valid shared-secret header is also present.
  it("HMAC headers present + unknown user_id + valid shared-secret header (HMAC_ONLY unset): 401 unknown account (no fallthrough)", async () => {
    // Do NOT seed a row for TEST_USER. HMAC_ONLY left unset by the
    // top-level beforeEach. Shared secret matches the env var set at
    // the top of file (test-secret-hmac) — under the OLD fallthrough
    // behavior this would have succeeded as a "legacy gateway"; under
    // the tightened invariant it must 401.
    const t = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(validInstallObj);
    const v1 = signBody(TEST_KEY, rawBody, t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .set("x-musu-telemetry-secret", "test-secret-hmac")
      .send(rawBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unknown account");
  });

  it("HMAC headers present + known user + wrong signature + valid shared-secret header (HMAC_ONLY unset): 401 invalid signature (no fallthrough)", async () => {
    // Even when the user row exists and the request also carries a
    // valid shared-secret header, a bad HMAC must 401. The HMAC path
    // is exclusive once opted into.
    seedKey(TEST_USER, TEST_KEY);
    const t = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(validInstallObj);
    const v1 = signBody(WRONG_KEY, rawBody, t);
    const res = await supertest(app)
      .post("/v1/telemetry/install")
      .set("content-type", "application/json")
      .set("x-musu-user-id", TEST_USER)
      .set("x-musu-telemetry-signature", `t=${t},v1=${v1}`)
      .set("x-musu-telemetry-secret", "test-secret-hmac")
      .send(rawBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid signature");
  });
});
