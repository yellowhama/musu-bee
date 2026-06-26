import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  __setNodeRegistryKvClientForTest,
  deleteNodeByName,
  isStoredNode,
  listNodes,
  nodeRegistryHeartbeatTtlSeconds,
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
          // Mirror the Lua script: atomically preserve an existing same-named
          // row's created_at onto the incoming node before insert.
          for (const item of current) {
            if (
              item &&
              typeof item === "object" &&
              item.node_name === node.node_name &&
              typeof item.created_at === "string" &&
              item.created_at.length > 0
            ) {
              node.created_at = item.created_at;
              break;
            }
          }
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
          // Mirror the Lua script: return the canonical stored node.
          return JSON.stringify({ ok: true, node }) as T;
        }

        if (script.includes("musu_node_registry_delete_v1")) {
          const nodeName = args[0]!;
          const current = readArray(key);
          const next = current.filter((item) => item.node_name !== nodeName);
          store.set(key, JSON.stringify(next));
          return JSON.stringify({ ok: true, deleted: next.length !== current.length }) as T;
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
  delete process.env.MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC;
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

test("concurrent-ish re-register preserves the original created_at (Lua-atomic)", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  const first = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha-1.example.com",
  });

  // Ensure wall-clock advances so a naive (non-atomic) implementation would
  // build a NEWER created_at on the second call.
  await new Promise((resolve) => setTimeout(resolve, 5));

  // Fire two re-registers without awaiting between them. The fake KV `eval`
  // runs each script start-to-finish against shared state (mirroring Redis
  // single-threaded EVAL), so created_at preservation must come from the Lua
  // script reading the existing row — not from an out-of-lock pre-read.
  const [second, third] = await Promise.all([
    registerNode({
      owner_key: OWNER_A,
      node_name: "alpha",
      public_url: "https://alpha-2.example.com",
    }),
    registerNode({
      owner_key: OWNER_A,
      node_name: "alpha",
      public_url: "https://alpha-3.example.com",
    }),
  ]);

  assert.equal(second.created_at, first.created_at, "created_at preserved (call 2)");
  assert.equal(third.created_at, first.created_at, "created_at preserved (call 3)");

  const nodes = await listNodes(OWNER_A);
  assert.equal(nodes.length, 1, "still a single row after concurrent re-register");
  assert.equal(nodes[0]!.id, first.id, "same deterministic id");
  assert.equal(
    nodes[0]!.created_at,
    first.created_at,
    "persisted created_at is the original, never clobbered by a stale read"
  );
});

test("getOwnerNodes/listNodes scope by owner_key (KV mispartition can't leak)", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  // Owner A registers normally.
  const a = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
  });

  // Simulate a KV mispartition: a row whose owner_key is OWNER_B is somehow
  // stored under OWNER_A's key. owner_key-scoping must drop it so it never
  // leaks to OWNER_A, even though it passes isStoredNode.
  const ownerAKey = "musu:node-registry:v1:" + encodeURIComponent(OWNER_A);
  const leaked: StoredNode = {
    schema: "musu.registry_node.v1",
    id: nodeRegistryId(OWNER_B, "beta"),
    owner_key: OWNER_B,
    node_name: "beta",
    public_url: "https://beta.example.com",
    cert_fingerprint: null,
    machine_group: null,
    mac_address: null,
    broadcast_ip: null,
    meta: null,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  fake.store.set(ownerAKey, JSON.stringify([a, leaked]));

  const nodes = await listNodes(OWNER_A);
  assert.equal(nodes.length, 1, "mispartitioned cross-owner row is filtered out");
  assert.equal(nodes[0]!.node_name, "alpha");
  assert.ok(
    !nodes.some((node) => node.owner_key === OWNER_B),
    "no OWNER_B row ever surfaces under OWNER_A"
  );
});

test("listNodes hides legacy rows with unusable public_url", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  const valid = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
  });
  const legacyLoopback: StoredNode = {
    ...valid,
    id: nodeRegistryId(OWNER_A, "legacy-loopback"),
    node_name: "legacy-loopback",
    public_url: "http://127.0.0.1:8070",
    last_seen: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  fake.store.set(
    "musu:node-registry:v1:" + encodeURIComponent(OWNER_A),
    JSON.stringify([legacyLoopback, valid])
  );

  const nodes = await listNodes(OWNER_A);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]!.node_name, "alpha");
  assert.ok(!nodes.some((node) => node.node_name === "legacy-loopback"));
});

test("listNodes hides rows whose last_seen exceeds the heartbeat presence TTL", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);
  process.env.MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC = "60";

  await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
  });

  const ownerAKey = "musu:node-registry:v1:" + encodeURIComponent(OWNER_A);
  const raw = JSON.parse(fake.store.get(ownerAKey) ?? "[]") as StoredNode[];
  const stored = raw[0]!;
  fake.store.set(
    ownerAKey,
    JSON.stringify([
      {
        ...stored,
        last_seen: new Date(Date.now() - 120_000).toISOString(),
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    ])
  );

  const nodes = await listNodes(OWNER_A);
  assert.equal(nodes.length, 0, "stale heartbeat row is hidden from current presence");
  assert.equal(
    await deleteNodeByName(OWNER_A, "alpha"),
    true,
    "hidden stale rows remain operator-cleanupable by node_name"
  );
});

test("nodeRegistryHeartbeatTtlSeconds defaults and clamps the presence window", () => {
  delete process.env.MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC;
  assert.equal(nodeRegistryHeartbeatTtlSeconds(), 15 * 60);

  process.env.MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC = "1";
  assert.equal(nodeRegistryHeartbeatTtlSeconds(), 60);

  process.env.MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC = String(48 * 60 * 60);
  assert.equal(nodeRegistryHeartbeatTtlSeconds(), 24 * 60 * 60);
});

test("deleteNodeByName removes a legacy unusable row inside owner scope", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  const valid = await registerNode({
    owner_key: OWNER_A,
    node_name: "alpha",
    public_url: "https://alpha.example.com",
  });
  const legacyLoopback: StoredNode = {
    ...valid,
    id: nodeRegistryId(OWNER_A, "legacy-loopback"),
    node_name: "legacy-loopback",
    public_url: "http://127.0.0.1:8070",
    last_seen: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  fake.store.set(
    "musu:node-registry:v1:" + encodeURIComponent(OWNER_A),
    JSON.stringify([legacyLoopback, valid])
  );

  assert.equal(await deleteNodeByName(OWNER_A, "legacy-loopback"), true);
  assert.equal(await deleteNodeByName(OWNER_A, "legacy-loopback"), false);

  const raw = JSON.parse(
    fake.store.get("musu:node-registry:v1:" + encodeURIComponent(OWNER_A)) ?? "[]"
  ) as StoredNode[];
  assert.deepEqual(
    raw.map((node) => node.node_name),
    ["alpha"],
    "delete can remove legacy rows that listNodes would hide"
  );
});

test("deleteNodeByName cannot delete another owner's same-named row", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  await registerNode({
    owner_key: OWNER_A,
    node_name: "shared",
    public_url: "https://a.example.com",
  });
  await registerNode({
    owner_key: OWNER_B,
    node_name: "shared",
    public_url: "https://b.example.com",
  });

  assert.equal(await deleteNodeByName(OWNER_A, "shared"), true);

  const aNodes = await listNodes(OWNER_A);
  const bNodes = await listNodes(OWNER_B);
  assert.equal(aNodes.length, 0);
  assert.equal(bNodes.length, 1);
  assert.equal(bNodes[0]!.node_name, "shared");
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

test("registerNode rejects public_url that cannot identify a remote peer", async () => {
  const fake = fakeNodeRegistryKv();
  __setNodeRegistryKvClientForTest(fake.client);

  for (const public_url of [
    "ws://192.168.1.10:8070",
    "http://127.0.0.1:8070",
    "http://127.1:8070",
    "http://localhost:8070",
    "http://0.0.0.0:8070",
    "http://[::1]:8070",
    "http://[::]:8070",
    "http://192.168.1.10:0",
  ]) {
    await assert.rejects(
      registerNode({ owner_key: OWNER_A, node_name: "alpha", public_url }),
      /public_url_invalid/,
      `${public_url} must not be stored`
    );
  }
});
