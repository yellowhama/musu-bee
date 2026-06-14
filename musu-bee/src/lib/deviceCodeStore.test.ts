import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  __setDeviceCodeKvClientForTest,
  approveDeviceCode,
  consumeDeviceCode,
  createDeviceCodeRecord,
  getDeviceCodeByUserCode,
  isStoredDeviceCode,
  normalizeUserCode,
  saveDeviceCode,
  type StoredDeviceCode,
} from "@/lib/deviceCodeStore";

/**
 * Faithful in-memory simulation of the Vercel KV / Redis backend for the device
 * code store. Each record + its by-user_code pointer is a single string value;
 * the store mutates records via atomic Lua EVAL scripts. Redis runs each EVAL
 * single-threaded and atomically, so this fake executes each `eval` start-to-
 * finish against shared state.
 */
function fakeDeviceCodeKv() {
  const store = new Map<string, string>();
  const state = { evalCommands: [] as string[] };

  function readRecord(key: string): Record<string, unknown> | null {
    const raw = store.get(key);
    if (!raw) {
      return null;
    }
    try {
      const decoded = JSON.parse(raw) as unknown;
      return decoded && typeof decoded === "object"
        ? (decoded as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return {
    store,
    state,
    client: {
      async get<T = unknown>(key: string): Promise<T | null> {
        const raw = store.get(key);
        if (raw === undefined) {
          return null;
        }
        // Record keys hold JSON objects (Lua SET wrote cjson.encode(record));
        // pointer keys hold a bare device_code string (Lua SET wrote the raw
        // value). @vercel/kv get() JSON-parses object values but returns plain
        // strings verbatim, so mirror that: parse objects, return strings as-is.
        try {
          const parsed = JSON.parse(raw) as T;
          return parsed;
        } catch {
          return raw as unknown as T;
        }
      },
      async eval<T = unknown>(script: string, keys: string[], args: string[]): Promise<T> {
        const recordKey = keys[0]!;

        if (script.includes("musu_device_code_create_v1")) {
          state.evalCommands.push("create");
          const pointerKey = keys[1]!;
          const recordJson = args[1]!;
          const deviceCode = args[2]!;
          store.set(recordKey, recordJson);
          // Lua SET writes the bare device_code (no JSON quoting); match it.
          store.set(pointerKey, deviceCode);
          return JSON.stringify({ ok: true }) as T;
        }

        if (script.includes("musu_device_code_approve_v1")) {
          state.evalCommands.push("approve");
          const now = args[0]!;
          const maxAttempts = Number.parseInt(args[2]!, 10);
          const approvedOwner = args[3]!;
          const record = readRecord(recordKey);
          if (!record) {
            return JSON.stringify({ status: "not_found" }) as T;
          }
          if (typeof record.expires_at !== "string" || now > record.expires_at) {
            return JSON.stringify({ status: "expired" }) as T;
          }
          if (record.status === "pending") {
            record.status = "approved";
            record.approved_owner = approvedOwner;
            store.set(recordKey, JSON.stringify(record));
            return JSON.stringify({ status: "approved", record }) as T;
          }
          const attempts = (Number(record.attempt_count) || 0) + 1;
          record.attempt_count = attempts;
          if (attempts >= maxAttempts) {
            record.status = "consumed";
            record.approved_owner = null;
            store.set(recordKey, JSON.stringify(record));
            return JSON.stringify({ status: "locked", attempt_count: attempts }) as T;
          }
          store.set(recordKey, JSON.stringify(record));
          return JSON.stringify({ status: "not_pending", attempt_count: attempts }) as T;
        }

        if (script.includes("musu_device_code_consume_v1")) {
          state.evalCommands.push("consume");
          const now = args[0]!;
          const record = readRecord(recordKey);
          if (!record) {
            return JSON.stringify({ status: "not_found" }) as T;
          }
          if (typeof record.expires_at !== "string" || now > record.expires_at) {
            return JSON.stringify({ status: "expired" }) as T;
          }
          if (record.status === "pending") {
            return JSON.stringify({ status: "pending" }) as T;
          }
          if (record.status !== "approved") {
            return JSON.stringify({ status: "not_deliverable" }) as T;
          }
          record.status = "consumed";
          store.set(recordKey, JSON.stringify(record));
          return JSON.stringify({ status: "consumed", record }) as T;
        }

        throw new Error("unexpected_device_code_kv_eval_script");
      },
    },
  };
}

const SHARED_OWNER = "token-sha256:deadbeef";

beforeEach(() => {
  process.env.KV_REST_API_URL = "https://example-kv.invalid";
  process.env.KV_REST_API_TOKEN = "test-kv-token";
  delete process.env.MUSU_DEVICE_CODE_STORE_PATH;
});

afterEach(() => {
  __setDeviceCodeKvClientForTest(null);
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

test("happy path: create -> approve -> consume yields the record once", async () => {
  const fake = fakeDeviceCodeKv();
  __setDeviceCodeKvClientForTest(fake.client);

  const record = createDeviceCodeRecord({ node_name: "  My Laptop  " });
  assert.equal(record.status, "pending");
  assert.equal(record.attempt_count, 0);
  assert.equal(record.node_name, "My Laptop");
  await saveDeviceCode(record);

  const approve = await approveDeviceCode(record.user_code, SHARED_OWNER);
  assert.equal(approve.status, "approved");

  const consume = await consumeDeviceCode(record.device_code);
  assert.equal(consume.status, "consumed");
  assert.ok(consume.status === "consumed" && consume.record.approved_owner === SHARED_OWNER);

  assert.ok(fake.state.evalCommands.includes("create"));
  assert.ok(fake.state.evalCommands.includes("approve"));
  assert.ok(fake.state.evalCommands.includes("consume"));
});

test("double-consume is not deliverable a second time", async () => {
  __setDeviceCodeKvClientForTest(fakeDeviceCodeKv().client);
  const record = createDeviceCodeRecord({ node_name: "n" });
  await saveDeviceCode(record);
  await approveDeviceCode(record.user_code, SHARED_OWNER);

  const first = await consumeDeviceCode(record.device_code);
  assert.equal(first.status, "consumed");

  const second = await consumeDeviceCode(record.device_code);
  assert.equal(second.status, "not_deliverable");
});

test("expired record is rejected on approve and consume", async () => {
  __setDeviceCodeKvClientForTest(fakeDeviceCodeKv().client);
  const record = createDeviceCodeRecord({ node_name: "n" });
  // Force expiry into the past.
  const expired: StoredDeviceCode = {
    ...record,
    expires_at: new Date(Date.now() - 1000).toISOString(),
  };
  await saveDeviceCode(expired);

  const approve = await approveDeviceCode(expired.user_code, SHARED_OWNER);
  // by-user_code lookup re-validates freshness, so an expired record resolves
  // to not_found at the JS guard layer (it is filtered before the pointer hop).
  assert.ok(approve.status === "not_found" || approve.status === "expired");

  const consume = await consumeDeviceCode(expired.device_code);
  assert.ok(consume.status === "not_found" || consume.status === "expired");
});

test("approving a non-pending (already approved) code is rejected", async () => {
  __setDeviceCodeKvClientForTest(fakeDeviceCodeKv().client);
  const record = createDeviceCodeRecord({ node_name: "n" });
  await saveDeviceCode(record);

  const first = await approveDeviceCode(record.user_code, SHARED_OWNER);
  assert.equal(first.status, "approved");

  const second = await approveDeviceCode(record.user_code, SHARED_OWNER);
  assert.equal(second.status, "not_pending");
  assert.ok(second.status === "not_pending" && second.attempt_count === 1);
});

test("attempt cap: repeated failed approves lock the record on the 5th (H-1)", async () => {
  __setDeviceCodeKvClientForTest(fakeDeviceCodeKv().client);
  const record = createDeviceCodeRecord({ node_name: "n" });
  await saveDeviceCode(record);

  // First approve succeeds (consumes the pending state).
  assert.equal((await approveDeviceCode(record.user_code, SHARED_OWNER)).status, "approved");

  // attempts 1..4 are "not_pending" (counter climbing), the 5th locks.
  const statuses: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    statuses.push((await approveDeviceCode(record.user_code, SHARED_OWNER)).status);
  }
  assert.deepEqual(statuses, [
    "not_pending",
    "not_pending",
    "not_pending",
    "not_pending",
    "locked",
  ]);

  // Once locked the record is consumed -> a subsequent consume is dead.
  const consume = await consumeDeviceCode(record.device_code);
  assert.equal(consume.status, "not_deliverable");
});

test("isStoredDeviceCode rejects malformed records", () => {
  assert.equal(isStoredDeviceCode(null), false);
  assert.equal(isStoredDeviceCode({}), false);
  assert.equal(
    isStoredDeviceCode({
      schema: "musu.device_code.v1",
      device_code: "d",
      user_code: "ABCD-EFGH",
      node_name: "n",
      status: "bogus",
      approved_owner: null,
      attempt_count: 0,
      created_at: "x",
      expires_at: "y",
    }),
    false,
    "invalid status must be rejected"
  );
  assert.equal(
    isStoredDeviceCode({
      schema: "musu.device_code.v1",
      device_code: "d",
      user_code: "ABCD-EFGH",
      node_name: "n",
      status: "pending",
      approved_owner: null,
      attempt_count: "0",
      created_at: "x",
      expires_at: "y",
    }),
    false,
    "non-numeric attempt_count must be rejected"
  );
});

test("normalizeUserCode validates alphabet and format", () => {
  assert.equal(normalizeUserCode("abcd-efgh"), "ABCD-EFGH");
  assert.equal(normalizeUserCode("ABCDEFGH"), "ABCD-EFGH");
  assert.equal(normalizeUserCode("ABC-EFGH"), null, "wrong length rejected");
  assert.equal(normalizeUserCode("0OIL-1234"), null, "excluded-alphabet chars rejected");
  assert.equal(normalizeUserCode(42), null);
});

test("getDeviceCodeByUserCode resolves pointer to the live record", async () => {
  __setDeviceCodeKvClientForTest(fakeDeviceCodeKv().client);
  const record = createDeviceCodeRecord({ node_name: "n" });
  await saveDeviceCode(record);
  const found = await getDeviceCodeByUserCode(record.user_code.toLowerCase());
  assert.ok(found);
  assert.equal(found?.user_code, record.user_code);
});
