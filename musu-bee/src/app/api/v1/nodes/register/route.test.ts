import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

type RegisterModule = { POST: (req: NextRequest) => Promise<Response> };
type ListModule = { GET: (req: NextRequest) => Promise<Response> };

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_NODE_REGISTRY_STORE_PATH",
  "MUSU_NODE_REGISTRY_TTL_SEC",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

const TOKEN_A = "control-token-a";
const TOKEN_B = "control-token-b";

function ownerKeyFor(token: string): string {
  return `token-sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function postReq(body: unknown, token: string | null = TOKEN_A): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/nodes/register", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getReq(token: string | null = TOKEN_A): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/nodes", {
    method: "GET",
    headers,
  });
}

async function withRegistryEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-node-registry-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  // Two valid control tokens via the sha256 allowlist (A) + static token (B):
  // both authenticate, deriving distinct owner_keys.
  process.env.MUSU_P2P_CONTROL_TOKEN = TOKEN_B;
  process.env.MUSU_P2P_CONTROL_TOKEN_SHA256 = createHash("sha256")
    .update(TOKEN_A)
    .digest("hex");
  process.env.MUSU_NODE_REGISTRY_STORE_PATH = join(tempDir, "nodes.json");
  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function loadRegister(caseName: string): Promise<RegisterModule> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as RegisterModule;
}

async function loadList(caseName: string): Promise<ListModule> {
  return (await import(`../route?case=${caseName}-${Date.now()}`)) as ListModule;
}

test("POST without bearer token is rejected (401)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("no-token");
    const res = await POST(postReq({ node_name: "alpha", public_url: "https://a" }, null));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "unauthorized");
  });
});

test("POST with invalid bearer token is rejected (401)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("bad-token");
    const res = await POST(
      postReq({ node_name: "alpha", public_url: "https://a" }, "not-a-valid-token")
    );
    assert.equal(res.status, 401);
  });
});

test("POST with valid bearer returns 200 RegistryNode shape", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("valid");
    const res = await POST(
      postReq({
        node_name: "alpha",
        public_url: "https://alpha.example.com",
        cert_fingerprint: "ab:cd",
        machine_group: "lan-1",
        meta: { os: "linux" },
      })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), [
      "cert_fingerprint",
      "id",
      "last_seen",
      "meta",
      "node_name",
      "public_url",
      "user_id",
    ]);
    assert.equal(body.node_name, "alpha");
    assert.equal(body.public_url, "https://alpha.example.com");
    assert.equal(body.cert_fingerprint, "ab:cd");
    assert.equal(body.user_id, ownerKeyFor(TOKEN_A));
    assert.equal(typeof body.id, "string");
    assert.equal(typeof body.last_seen, "string");
    // machine_group is internal-only; never leaked on the wire.
    assert.ok(!("machine_group" in body));
    assert.ok(!("owner_key" in body));
  });
});

test("POST rejects missing required fields (400)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("missing");
    const res = await POST(postReq({ public_url: "https://a" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "invalid_register_node_request");
  });
});

test("POST ignores client-supplied user_id/owner_key (strict schema 400)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("spoof");
    // Attempting to inject owner scope must be rejected by the strict schema,
    // never silently trusted.
    const res = await POST(
      postReq({
        node_name: "alpha",
        public_url: "https://a",
        user_id: "attacker",
        owner_key: "attacker",
      })
    );
    assert.equal(res.status, 400);
  });
});

test("POST rejects oversized node_name with 400 (no silent truncation)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("oversized-name");
    // 129 chars > MAX_NODE_NAME_CHARS (128): must be REJECTED at the Zod layer,
    // not silently sliced to 128 (which could miss an existing-node match).
    const res = await POST(
      postReq({ node_name: "n".repeat(129), public_url: "https://a" })
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.error, "invalid_register_node_request");
    assert.ok(
      body.issues.some((issue) => issue.path === "node_name"),
      "the rejected field is node_name"
    );
  });
});

test("POST accepts a node_name at the 128-char limit (boundary, valid)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("max-name");
    const name = "n".repeat(128);
    const res = await POST(postReq({ node_name: name, public_url: "https://a" }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { node_name: string };
    assert.equal(body.node_name, name, "exactly-128 name is preserved unchanged");
  });
});

test("POST rejects oversized public_url with 400", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("oversized-url");
    // 513 chars > MAX_URL_CHARS (512): rejected, not truncated.
    const res = await POST(
      postReq({ node_name: "alpha", public_url: "https://" + "a".repeat(513) })
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.error, "invalid_register_node_request");
    assert.ok(body.issues.some((issue) => issue.path === "public_url"));
  });
});

test("GET without bearer is rejected (401)", async () => {
  await withRegistryEnv(async () => {
    const { GET } = await loadList("list-no-token");
    const res = await GET(getReq(null));
    assert.equal(res.status, 401);
  });
});

test("GET returns only the caller's nodes (owner isolation)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("iso-register");
    // Owner A registers two nodes.
    await POST(postReq({ node_name: "a1", public_url: "https://a1" }, TOKEN_A));
    await POST(postReq({ node_name: "a2", public_url: "https://a2" }, TOKEN_A));
    // Owner B registers one node.
    await POST(postReq({ node_name: "b1", public_url: "https://b1" }, TOKEN_B));

    const { GET } = await loadList("iso-list");
    const resA = await GET(getReq(TOKEN_A));
    assert.equal(resA.status, 200);
    const nodesA = (await resA.json()) as Array<{ node_name: string; user_id: string }>;
    assert.equal(nodesA.length, 2);
    assert.deepEqual(
      nodesA.map((n) => n.node_name).sort(),
      ["a1", "a2"]
    );
    for (const node of nodesA) {
      assert.equal(node.user_id, ownerKeyFor(TOKEN_A));
    }

    const resB = await GET(getReq(TOKEN_B));
    const nodesB = (await resB.json()) as Array<{ node_name: string }>;
    assert.equal(nodesB.length, 1);
    assert.equal(nodesB[0]!.node_name, "b1");
    // Owner B never sees owner A's nodes.
    assert.ok(!nodesB.some((n) => n.node_name === "a1" || n.node_name === "a2"));
  });
});

test("re-register via route upserts (GET shows one row, updated url)", async () => {
  await withRegistryEnv(async () => {
    const { POST } = await loadRegister("re-register");
    await POST(postReq({ node_name: "alpha", public_url: "https://v1" }, TOKEN_A));
    await POST(postReq({ node_name: "alpha", public_url: "https://v2" }, TOKEN_A));

    const { GET } = await loadList("re-register-list");
    const res = await GET(getReq(TOKEN_A));
    const nodes = (await res.json()) as Array<{ node_name: string; public_url: string }>;
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]!.public_url, "https://v2");
  });
});
