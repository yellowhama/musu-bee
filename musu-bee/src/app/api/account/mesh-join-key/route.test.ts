import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

// server-only throws under the node test runner; stub it via require.cache
// (matches agents/route.test.ts — the working route-test pattern here).
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

// Stub @/lib/auth-server so getUser() returns whatever currentUser is set to,
// without touching Supabase. Resolve the compiled path the same way the route's
// "@/lib/auth-server" alias resolves (src/lib/auth-server.ts).
let currentUser: { id: string } | null = null;
const authServerPath = require.resolve("../../../../lib/auth-server.ts");
require.cache[authServerPath] = {
  id: authServerPath,
  filename: authServerPath,
  loaded: true,
  exports: {
    getUser: async () => currentUser,
    getUserFromRequest: async () => currentUser,
  },
} as unknown as NodeJS.Module;

type RouteModule = { POST: (req: NextRequest) => Promise<Response> };

const SITE_ORIGIN = "https://musu.test";
const VALID_UUID = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";

const ENV_KEYS = [
  "HEADSCALE_API_URL",
  "HEADSCALE_API_KEY",
  "HEADSCALE_LOGIN_SERVER",
  "MUSU_MESH_ENROLL_USER_IDS",
  "MESH_JOIN_KEY_TTL_SECONDS",
  "MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE",
  "NEXT_PUBLIC_APP_URL",
] as const;

const previousEnv = new Map<(typeof ENV_KEYS)[number], string | undefined>();
let fetchCalls: Array<{ url: string }> = [];
let originalFetch: typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function installHeadscaleFetch() {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    fetchCalls.push({ url: u });
    if (u.includes("/api/v1/policy")) return jsonResponse({ policy: "ok" });
    if (u.includes("/api/v1/user?name=")) {
      return jsonResponse({ users: [{ id: "5", name: `acct-${VALID_UUID}` }] });
    }
    if (u.includes("/api/v1/preauthkey")) {
      return jsonResponse({ preAuthKey: { key: "mint-key-abc" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
}

function req(body?: unknown, origin = SITE_ORIGIN): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { origin },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["content-type"] = "application/json";
    init.headers["content-length"] = String(init.body.length);
  }
  return new NextRequest(`${SITE_ORIGIN}/api/account/mesh-join-key`, init as RequestInit);
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
  process.env.NEXT_PUBLIC_APP_URL = SITE_ORIGIN;
  process.env.HEADSCALE_API_URL = "https://mesh.musu.pro";
  process.env.HEADSCALE_API_KEY = "admin-key";
  process.env.MUSU_MESH_ENROLL_USER_IDS = VALID_UUID;
  currentUser = { id: VALID_UUID };
  fetchCalls = [];
  installHeadscaleFetch();
}

function teardownEnv() {
  for (const key of ENV_KEYS) {
    const prev = previousEnv.get(key);
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
  globalThis.fetch = originalFetch;
}

test("happy path: mints key, isolation policy set BEFORE preauthkey", async () => {
  setupEnv();
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.login_server, "https://mesh.musu.pro");
    assert.equal(body.authkey, "mint-key-abc");
    assert.equal(body.tailnet, `acct-${VALID_UUID}`);
    const policyIdx = fetchCalls.findIndex((c) => c.url.includes("/policy"));
    const keyIdx = fetchCalls.findIndex((c) => c.url.includes("/preauthkey"));
    assert.ok(policyIdx >= 0 && keyIdx >= 0);
    assert.ok(policyIdx < keyIdx, "isolation policy must precede key mint");
  } finally {
    teardownEnv();
  }
});

test("401 when not authenticated", async () => {
  setupEnv();
  currentUser = null;
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("503 when Headscale API not configured", async () => {
  setupEnv();
  delete process.env.HEADSCALE_API_KEY;
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "mesh_not_configured");
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("503 when enrollment allowlist unset (fail-closed)", async () => {
  setupEnv();
  delete process.env.MUSU_MESH_ENROLL_USER_IDS;
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "mesh_enroll_not_configured");
  } finally {
    teardownEnv();
  }
});

test("403 when account not on the allowlist", async () => {
  setupEnv();
  process.env.MUSU_MESH_ENROLL_USER_IDS = "some-other-account";
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "enroll_not_allowlisted");
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("403 cross-origin", async () => {
  setupEnv();
  try {
    const { POST } = await loadRoute();
    const res = await POST(req(undefined, "https://evil.example"));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "cross_origin_rejected");
  } finally {
    teardownEnv();
  }
});

test("429 after exceeding the per-account rate limit", async () => {
  setupEnv();
  process.env.MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE = "2";
  try {
    const { POST } = await loadRoute();
    assert.equal((await POST(req())).status, 200);
    assert.equal((await POST(req())).status, 200);
    const limited = await POST(req());
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("Retry-After"));
  } finally {
    teardownEnv();
  }
});

test("502 when Headscale provisioning fails", async () => {
  setupEnv();
  globalThis.fetch = (async () => jsonResponse({ message: "boom" }, 500)) as unknown as typeof fetch;
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, "mesh_provisioning_failed");
  } finally {
    teardownEnv();
  }
});

test("400 on extra body fields (strict schema)", async () => {
  setupEnv();
  try {
    const { POST } = await loadRoute();
    const res = await POST(req({ user_id: "spoof", evil: true }));
    assert.equal(res.status, 400);
  } finally {
    teardownEnv();
  }
});
