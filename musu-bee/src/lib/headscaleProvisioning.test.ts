import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

// headscaleProvisioning.ts imports "server-only", which throws under the node
// test runner. Stub it before importing the helper (matches bridge-proxy.test.ts).
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

// require (not static import) so the server-only stub above is installed before
// the module loads — matches bridge-proxy.test.ts.
const {
  ACCOUNT_SELF_ISOLATION_POLICY,
  HeadscaleProvisioningError,
  createOneTimePreauthKey,
  ensureHeadscaleUser,
  ensureSelfIsolationPolicy,
  headscaleUserNameForAccount,
  provisionMeshJoinKey,
} = require("./headscaleProvisioning") as typeof import("./headscaleProvisioning");

const VALID_UUID = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
const CFG = { apiUrl: "https://mesh.musu.pro/", apiKey: "test-key" };

type Call = { url: string; init: RequestInit };

/**
 * Builds a fake fetch from an ordered list of responders. Records every call so
 * tests can assert exact URLs/bodies/headers. Each responder returns a partial
 * Response-like object; missing fields default sensibly.
 */
function fakeFetch(
  responders: Array<
    (call: Call) => { status?: number; json?: unknown; ok?: boolean }
  >
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const responder = responders[i++];
    assert.ok(responder, `unexpected extra fetch call to ${call.url}`);
    const r = responder(call);
    const status = r.status ?? 200;
    const ok = r.ok ?? (status >= 200 && status < 300);
    return {
      ok,
      status,
      json: async () => r.json,
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("headscaleUserNameForAccount: valid UUID → acct-<id> lowercased", () => {
  assert.equal(
    headscaleUserNameForAccount(VALID_UUID),
    `acct-${VALID_UUID}`
  );
  assert.equal(
    headscaleUserNameForAccount(VALID_UUID.toUpperCase()),
    `acct-${VALID_UUID}`
  );
  assert.equal(
    headscaleUserNameForAccount(`  ${VALID_UUID}  `),
    `acct-${VALID_UUID}`
  );
});

test("headscaleUserNameForAccount: non-UUID rejected with 400", () => {
  for (const bad of ["", "not-a-uuid", "acct-foo", "../etc", "12345"]) {
    assert.throws(
      () => headscaleUserNameForAccount(bad),
      (err: unknown) =>
        err instanceof HeadscaleProvisioningError && err.status === 400,
      `expected ${JSON.stringify(bad)} to be rejected`
    );
  }
});

test("ACCOUNT_SELF_ISOLATION_POLICY is autogroup:self isolation", () => {
  const parsed = JSON.parse(ACCOUNT_SELF_ISOLATION_POLICY);
  assert.deepEqual(parsed, {
    grants: [
      { src: ["autogroup:member"], dst: ["autogroup:self"], ip: ["*"] },
    ],
  });
});

test("ensureHeadscaleUser: existing user returned via GET, no create", async () => {
  const { fetchImpl, calls } = fakeFetch([
    () => ({ json: { users: [{ id: "7", name: `acct-${VALID_UUID}` }] } }),
  ]);
  const user = await ensureHeadscaleUser(
    { ...CFG, fetchImpl },
    `acct-${VALID_UUID}`
  );
  assert.deepEqual(user, { id: "7", name: `acct-${VALID_UUID}` });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/user\?name=acct-/);
  assert.equal(calls[0].init.method, "GET");
});

test("ensureHeadscaleUser: missing → POST create returns id", async () => {
  const name = `acct-${VALID_UUID}`;
  const { fetchImpl, calls } = fakeFetch([
    () => ({ json: { users: [] } }), // GET miss
    (c) => {
      assert.equal(c.init.method, "POST");
      assert.deepEqual(JSON.parse(String(c.init.body)), { name });
      return { json: { user: { id: "42", name } } };
    },
  ]);
  const user = await ensureHeadscaleUser({ ...CFG, fetchImpl }, name);
  assert.deepEqual(user, { id: "42", name });
  assert.equal(calls.length, 2);
});

test("ensureHeadscaleUser: create 409 race → re-GET resolves", async () => {
  const name = `acct-${VALID_UUID}`;
  const { fetchImpl, calls } = fakeFetch([
    () => ({ json: { users: [] } }), // GET miss
    () => ({ status: 409, json: { message: "user exists" } }), // raced create
    () => ({ json: { users: [{ id: "9", name }] } }), // confirming GET
  ]);
  const user = await ensureHeadscaleUser({ ...CFG, fetchImpl }, name);
  assert.deepEqual(user, { id: "9", name });
  assert.equal(calls.length, 3);
});

test("ensureHeadscaleUser: hard failure → 502", async () => {
  const { fetchImpl } = fakeFetch([
    () => ({ json: { users: [] } }),
    () => ({ status: 500, json: { message: "boom" } }),
  ]);
  await assert.rejects(
    ensureHeadscaleUser({ ...CFG, fetchImpl }, `acct-${VALID_UUID}`),
    (err: unknown) =>
      err instanceof HeadscaleProvisioningError && err.status === 502
  );
});

test("createOneTimePreauthKey: body keys on user id, reusable=false, TTL", async () => {
  const nowMs = 1_700_000_000_000;
  const { fetchImpl, calls } = fakeFetch([
    (c) => {
      const body = JSON.parse(String(c.init.body));
      assert.equal(body.user, "42"); // id, not name
      assert.equal(body.reusable, false);
      assert.equal(body.ephemeral, false);
      assert.equal(body.expiration, new Date(nowMs + 600_000).toISOString());
      return { json: { preAuthKey: { key: "mint-abc" } } };
    },
  ]);
  const key = await createOneTimePreauthKey(
    { ...CFG, fetchImpl },
    "42",
    600,
    nowMs
  );
  assert.equal(key, "mint-abc");
  assert.match(calls[0].url, /\/api\/v1\/preauthkey$/);
});

test("createOneTimePreauthKey: missing key in response → 502", async () => {
  const { fetchImpl } = fakeFetch([() => ({ json: { preAuthKey: {} } })]);
  await assert.rejects(
    createOneTimePreauthKey({ ...CFG, fetchImpl }, "42", 600, 0),
    (err: unknown) =>
      err instanceof HeadscaleProvisioningError && err.status === 502
  );
});

test("ensureSelfIsolationPolicy: PUTs the isolation policy", async () => {
  const { fetchImpl, calls } = fakeFetch([
    (c) => {
      assert.equal(c.init.method, "PUT");
      const body = JSON.parse(String(c.init.body));
      assert.equal(body.policy, ACCOUNT_SELF_ISOLATION_POLICY);
      return { json: { policy: body.policy } };
    },
  ]);
  await ensureSelfIsolationPolicy({ ...CFG, fetchImpl });
  assert.match(calls[0].url, /\/api\/v1\/policy$/);
});

test("provisionMeshJoinKey: policy → ensure user → mint, returns join key", async () => {
  const name = `acct-${VALID_UUID}`;
  const nowMs = 1_700_000_000_000;
  const { fetchImpl, calls } = fakeFetch([
    () => ({ json: { policy: "ok" } }), // PUT policy
    () => ({ json: { users: [{ id: "5", name }] } }), // GET user (exists)
    (c) => {
      assert.equal(JSON.parse(String(c.init.body)).user, "5");
      return { json: { preAuthKey: { key: "join-xyz" } } };
    },
  ]);
  const result = await provisionMeshJoinKey({
    apiUrl: "https://mesh.musu.pro",
    apiKey: "k",
    loginServer: "https://mesh.musu.pro/",
    accountUserId: VALID_UUID,
    ttlSeconds: 600,
    nowMs,
    fetchImpl,
  });
  assert.deepEqual(result, {
    loginServer: "https://mesh.musu.pro",
    authkey: "join-xyz",
    tailnet: name,
  });
  // isolation policy is set BEFORE the key is minted
  assert.match(calls[0].url, /\/api\/v1\/policy$/);
  assert.match(calls[2].url, /\/api\/v1\/preauthkey$/);
});

test("provisionMeshJoinKey: invalid account id rejected before any fetch", async () => {
  const { fetchImpl, calls } = fakeFetch([]);
  await assert.rejects(
    provisionMeshJoinKey({
      apiUrl: "https://mesh.musu.pro",
      apiKey: "k",
      loginServer: "https://mesh.musu.pro",
      accountUserId: "not-a-uuid",
      ttlSeconds: 600,
      nowMs: 0,
      fetchImpl,
    }),
    (err: unknown) =>
      err instanceof HeadscaleProvisioningError && err.status === 400
  );
  assert.equal(calls.length, 0, "no Headscale call on invalid input");
});
