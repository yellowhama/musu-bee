import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

// server-only throws under the node test runner; stub it via require.cache
// (matches mesh-join-key/route.test.ts — the working route-test pattern here).
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

type RouteModule = { POST: (req: NextRequest) => Promise<Response> };

const SITE = "https://musu.test";
const CONTROL_TOKEN = "test-control-token-node-action";
const EXPECTED_TAILNET =
  "acct-" + createHash("sha256").update(CONTROL_TOKEN).digest("hex");
const USER_ID = "5";

const ENV_KEYS = [
  "HEADSCALE_API_URL",
  "HEADSCALE_API_KEY",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE",
  "NEXT_PUBLIC_APP_URL",
] as const;

const previousEnv = new Map<(typeof ENV_KEYS)[number], string | undefined>();
type FetchCall = { url: string; method: string };
let fetchCalls: FetchCall[] = [];
let originalFetch: typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

// Mock the Headscale control plane: user lookup, owner-scoped node list (one node
// owned by USER_ID, carrying its own tailnet IP), and node DELETE.
function installHeadscaleFetch(opts?: { listName?: string }) {
  const listName = opts?.listName ?? "this-pc";
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchCalls.push({ url: u, method });
    if (u.includes("/api/v1/user?name=")) {
      return jsonResponse({ users: [{ id: USER_ID, name: EXPECTED_TAILNET }] });
    }
    if (u.includes("/api/v1/node?user=")) {
      return jsonResponse({
        nodes: [
          {
            id: "100",
            givenName: listName,
            user: { id: USER_ID, name: EXPECTED_TAILNET },
            ipAddresses: ["100.64.0.5"],
          },
        ],
      });
    }
    if (/\/api\/v1\/node\/100$/.test(u) && method === "DELETE") {
      return jsonResponse({}, 200);
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  }) as unknown as typeof fetch;
}

function req(body: unknown, token: string | null = CONTROL_TOKEN): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  const serialized = JSON.stringify(body);
  headers["content-type"] = "application/json";
  headers["content-length"] = String(serialized.length);
  return new NextRequest(`${SITE}/api/account/mesh-node-action`, {
    method: "POST",
    headers,
    body: serialized,
  } as ConstructorParameters<typeof NextRequest>[1]);
}

let caseN = 0;
async function loadRoute(): Promise<RouteModule> {
  const { resetMeshJoinRateLimitForTests } = (await import(
    new URL("../../../../lib/meshJoinRateLimit.ts", import.meta.url).href
  )) as typeof import("@/lib/meshJoinRateLimit");
  resetMeshJoinRateLimitForTests();
  const moduleUrl = new URL(`./route.ts?case=${caseN++}`, import.meta.url).href;
  return (await import(moduleUrl)) as RouteModule;
}

function setupEnv() {
  for (const key of ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_APP_URL = SITE;
  process.env.HEADSCALE_API_URL = "https://mesh.musu.pro";
  process.env.HEADSCALE_API_KEY = "admin-key";
  process.env.MUSU_P2P_CONTROL_TOKEN = CONTROL_TOKEN;
  fetchCalls = [];
}

function teardownEnv() {
  for (const key of ENV_KEYS) {
    const prev = previousEnv.get(key);
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
  globalThis.fetch = originalFetch;
}

test("remove-self: removes this machine's node WITHOUT a caller_ip (self-eviction is the intent)", async () => {
  setupEnv();
  installHeadscaleFetch();
  try {
    const { POST } = await loadRoute();
    const res = await POST(
      req({ action: "remove-self", node_id: "100", expected_name: "this-pc" })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.removed, true);
    assert.equal(body.already_gone, false);
    // The DELETE was issued even though the node carries this machine's tailnet
    // IP — the normal `remove` path would have refused (no self-guard here).
    assert.ok(
      fetchCalls.some((c) => /\/api\/v1\/node\/100$/.test(c.url) && c.method === "DELETE"),
      `expected a DELETE on node 100, got: ${JSON.stringify(fetchCalls)}`
    );
  } finally {
    teardownEnv();
  }
});

test("remove-self: rejects an empty expected_name at the schema (keeps optimistic-concurrency armed)", async () => {
  setupEnv();
  installHeadscaleFetch();
  try {
    const { POST } = await loadRoute();
    const res = await POST(
      req({ action: "remove-self", node_id: "100", expected_name: "" })
    );
    assert.equal(res.status, 400);
    // Schema rejection happens before any control-plane call.
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("remove-self: rejects a stray caller_ip (strict schema — the self-path takes no caller_ip)", async () => {
  setupEnv();
  installHeadscaleFetch();
  try {
    const { POST } = await loadRoute();
    const res = await POST(
      req({
        action: "remove-self",
        node_id: "100",
        expected_name: "this-pc",
        caller_ip: "100.64.0.5",
      })
    );
    // .strict() on the discriminated-union member rejects unknown keys.
    assert.equal(res.status, 400);
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("remove-self: 409 when the node was renamed since the id was resolved", async () => {
  setupEnv();
  installHeadscaleFetch({ listName: "renamed-elsewhere" });
  try {
    const { POST } = await loadRoute();
    const res = await POST(
      req({ action: "remove-self", node_id: "100", expected_name: "this-pc" })
    );
    assert.equal(res.status, 409);
    // No DELETE on a name mismatch.
    assert.ok(!fetchCalls.some((c) => c.method === "DELETE"));
  } finally {
    teardownEnv();
  }
});

test("remove-self: 401 with no bearer token (auth before any work)", async () => {
  setupEnv();
  installHeadscaleFetch();
  try {
    const { POST } = await loadRoute();
    const res = await POST(
      req({ action: "remove-self", node_id: "100", expected_name: "this-pc" }, null)
    );
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});
