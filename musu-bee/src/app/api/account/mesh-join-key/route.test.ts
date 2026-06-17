import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
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

type RouteModule = { POST: (req: NextRequest) => Promise<Response> };

const SITE = "https://musu.test";
// The CLI authenticates with the single-owner control bearer token.
const CONTROL_TOKEN = "test-control-token-abc";
const OWNER_KEY =
  "token-sha256:" + createHash("sha256").update(CONTROL_TOKEN).digest("hex");
const EXPECTED_TAILNET =
  "acct-" + createHash("sha256").update(CONTROL_TOKEN).digest("hex");

const ENV_KEYS = [
  "HEADSCALE_API_URL",
  "HEADSCALE_API_KEY",
  "HEADSCALE_LOGIN_SERVER",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
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
      return jsonResponse({ users: [{ id: "5", name: EXPECTED_TAILNET }] });
    }
    if (u.includes("/api/v1/preauthkey")) {
      return jsonResponse({ preAuthKey: { key: "mint-key-abc" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
}

function req(opts?: { token?: string | null; body?: unknown }): NextRequest {
  const headers: Record<string, string> = {};
  const tok = opts?.token === undefined ? CONTROL_TOKEN : opts.token;
  if (tok) headers["authorization"] = `Bearer ${tok}`;
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers,
  };
  if (opts?.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers["content-type"] = "application/json";
    init.headers["content-length"] = String(init.body.length);
  }
  return new NextRequest(`${SITE}/api/account/mesh-join-key`, init as ConstructorParameters<typeof NextRequest>[1]);
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

test("happy path: bearer control token mints key; policy before preauthkey", async () => {
  setupEnv();
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.login_server, "https://mesh.musu.pro");
    assert.equal(body.authkey, "mint-key-abc");
    assert.equal(body.tailnet, EXPECTED_TAILNET);
    const policyIdx = fetchCalls.findIndex((c) => c.url.includes("/policy"));
    const keyIdx = fetchCalls.findIndex((c) => c.url.includes("/preauthkey"));
    assert.ok(policyIdx >= 0 && keyIdx >= 0 && policyIdx < keyIdx);
  } finally {
    teardownEnv();
  }
});

test("401 with no bearer token", async () => {
  setupEnv();
  try {
    const { POST } = await loadRoute();
    const res = await POST(req({ token: null }));
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("401 with wrong bearer token", async () => {
  setupEnv();
  try {
    const { POST } = await loadRoute();
    const res = await POST(req({ token: "not-the-token" }));
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  } finally {
    teardownEnv();
  }
});

test("sha256 allowlist accepts a matching token", async () => {
  setupEnv();
  // Drop the raw token; accept only via the sha256 allowlist.
  delete process.env.MUSU_P2P_CONTROL_TOKEN;
  process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = createHash("sha256")
    .update(CONTROL_TOKEN)
    .digest("hex");
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).tailnet, EXPECTED_TAILNET);
  } finally {
    teardownEnv();
  }
});

test("503 when control auth not configured", async () => {
  setupEnv();
  delete process.env.MUSU_P2P_CONTROL_TOKEN;
  try {
    const { POST } = await loadRoute();
    const res = await POST(req());
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "p2p_control_auth_not_configured");
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

test("429 after exceeding the per-owner rate limit", async () => {
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
    const res = await POST(req({ body: { user_id: "spoof", evil: true } }));
    assert.equal(res.status, 400);
  } finally {
    teardownEnv();
  }
});
