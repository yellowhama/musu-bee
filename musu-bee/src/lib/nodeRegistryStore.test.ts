import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  __setNodeRegistryKvClientForTest,
  isStoredNode,
  listNodes,
  nodeRegistryId,
  publicRegistryNode,
  registerNode,
  type StoredNode,
} from "@/lib/nodeRegistryStore";

/**
 * Faithful in-memory simulation of the Vercel KV / Redis backend for the node
 * registry store. The store keeps one JSON-encoded array of node records per
 * owner key and mutates it via an atomic Lua EVAL upsert. Redis runs each EVAL
 * single-threaded and atomically, so this fake executes each `eval` start-to-
 * finish against shared state.
 */
function fakeNodeRegistryKv() {
  const store = new Map<string, string>();

  function readArray(key: string): Array<Record<string, unknown>> {
    const raw = store.get(key);
    if (!raw) {
      return [];
    }
    try {
      const decoded = JSON.parse(raw) as unknown;
      return Array.isArray(decoded) ? (decoded as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }

  return {
    store,
    client: {
      async get<T = unknown>(key: string): Promise<T | null> {
        const raw = store.get(key);
        if (raw === undefined) {
          return null;
        }
        try {
          return JSON.parse(raw) as T;
        } catch {
          return raw as unknown as T;
        }
      },
      async eval<T = unknown>(script: string, keys: string[], args: string[]): Promise<T> {
        const key = keys[0]!;

        if (script.includes("musu_node_registry_upsert_v1")) {
          const now = args[0]!;
          const maxRecords = Number.parseInt(args[1]!, 10);
          const node = JSON.parse(args[3]!) as Record<string, unknown>;
          const current = readArray(key);
          const next: Array<Record<string, unknown>> = [node];
          for (const item of current) {
            if (
              item &&
              typeof item === "object" &&
              typeof item.expires_at === "string" &&
              now <= item.expires_at &&
              item.node_name !== node.node_name
            ) {
              if (next.length < maxRecords) {
                next.push(item);
              }
            }
          }
          store.set(key, JSON.stringify(next));
          return JSON.stringify({ ok: true }) as T;
        }

        throw new Error(`unexpected script: ${script.slice(0, 64)}`);
      },
    },
  };
}

const OWNER_A = "token-sha256:aaaa";
const OWNER_B = "token-sha256:bbbb";

beforeEach(() => {
  process.env.KV_REST_API_URL = "https://kv.test";
  process.env.KV_REST_API_TOKEN = "kv-token";
  __setNodeRegistryKvClientForTest(fakeNodeRegistryKv().client);
});

afterEach(() => {
  __setNodeRegistryKvClientForTest(null);
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

test("register then list shows the node with RegistryNode shape", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  const stored = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
    cert_fingerprint: "ab:cd",
    meta: { os: "linux" },
  });

  assert.equal(stored.owner_key, OWNER_A);
  assert.equal(stored.node_name, "alpha");
  assert.equal(stored.id, nodeRegistryId(OWNER_A, "alpha"));

  const nodes = await listNodes(OWNER_A);
  assert.equal(nodes.length, 1);

  const wire = publicRegistryNode(nodes[0]!);
  // Exact RegistryNode contract fields (cloud/mod.rs:118-129).
  assert.deepEqual(Object.keys(wire).sort(), [
    "cert_fingerprint",
    "id",
    "last_seen",
    "meta",
    "node_name",
    "public_url",
    "user_id",
  ]);
  assert.equal(wire.user_id, OWNER_A); // user_id == owner_key
  assert.equal(wire.node_name, "alpha");
  assert.equal(wire.public_url, "https://alpha.example.com");
  assert.equal(wire.cert_fingerprint, "ab:cd");
  assert.equal(typeof wire.last_seen, "string");
  assert.deepEqual(wire.meta, { os: "linux" });
});

test("re-register same node_name upserts: one row, same id, last_seen refreshed", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  const first = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha-1.example.com",
  });

  // Ensure clock advances so last_seen differs.
  await new Promise((resolve) => setTimeout(resolve, 5));

  const second = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha-2.example.com",
  });

  const nodes = await listNodes(OWNER_A);
  assert.equal(nodes.length, 1, "re-register must upsert, not duplicate");
  assert.equal(nodes[0]!.id, first.id, "same deterministic id");
  assert.equal(second.id, first.id);
  assert.equal(nodes[0]!.public_url, "https://alpha-2.example.com", "public_url updated");
  assert.notEqual(second.last_seen, first.last_seen, "last_seen refreshed");
  assert.equal(second.created_at, first.created_at, "created_at preserved across re-register");
});

test("two different owner_keys are isolated", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
  });
  await registerNode({
    owner_key: OWNER_B,
    node_name: "beta",
    public_url: "https://beta.example.com",
  });

  const aNodes = await listNodes(OWNER_A);
  const bNodes = await listNodes(OWNER_B);

  assert.equal(aNodes.length, 1);
  assert.equal(bNodes.length, 1);
  assert.equal(aNodes[0]!.node_name, "alpha");
  assert.equal(bNodes[0]!.node_name, "beta");
  // Owner A cannot see owner B's node.
  assert.ok(!aNodes.some((node) => node.node_name === "beta"));
  assert.ok(!bNodes.some((node) => node.node_name === "alpha"));
});

test("two owners can register the same node_name without collision (distinct ids)", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  const a = await registerNode({
    owner_key: OWNER_A,
    node_name: "shared",
    public_url: "https://a.example.com",
  });
  const b = await registerNode({
    owner_key: OWNER_B,
    node_name: "shared",
    public_url: "https://b.example.com",
  });

  assert.notEqual(a.id, b.id, "id is derived from owner+name, so distinct owners differ");
  const aNodes = await listNodes(OWNER_A);
  assert.equal(aNodes.length, 1);
  assert.equal(aNodes[0]!.public_url, "https://a.example.com");
});

test("isStoredNode rejects malformed records", () => {
  const good: StoredNode = {
    schema: "musu.registry_node.v1",
    id: nodeRegistryId(OWNER_A, "alpha"),
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
    cert_fingerprint: null,
    machine_group: null,
    mac_address: null,
    broadcast_ip: null,
    meta: null,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1000).toISOString(),
  };
  assert.equal(isStoredNode(good), true);

  assert.equal(isStoredNode(null), false);
  assert.equal(isStoredNode({}), false);
  assert.equal(isStoredNode({ ...good, schema: "wrong" }), false);
  assert.equal(isStoredNode({ ...good, node_name: "" }), false);
  assert.equal(isStoredNode({ ...good, public_url: "" }), false);
  assert.equal(isStoredNode({ ...good, owner_key: 123 }), false);
  const missingLastSeen: Record<string, unknown> = { ...good };
  delete missingLastSeen.last_seen;
  assert.equal(isStoredNode(missingLastSeen), false);
});

test("missing node_name or public_url throws", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  await assert.rejects(
    registerNode({ owner_key: OWNER_A, node_name: "  ", public_url: "https://x" }),
    /node_name_required/
  );
  await assert.rejects(
    registerNode({ owner_key: OWNER_A, node_name: "alpha", public_url: "" }),
    /public_url_required/
  );
});
