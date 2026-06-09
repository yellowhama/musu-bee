import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

// bridge-token.ts (pulled in via @/lib/bridge-proxy) imports "server-only",
// which throws under the node test runner. Stub it before the handler loads.
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

// /api/workflows/[id]/status route migrated onto proxyToBridge. Verifies the
// canonical /status path, id validation, status passthrough, 503 fallback.

type Handler = (req: Request, ctx: Ctx) => Promise<Response>;
type Ctx = { params: Promise<{ id: string }> };

function statusRequest(): Request {
  return new Request("http://app.test/api/workflows/wf-123/status");
}

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}

async function loadGet(cacheBust: string): Promise<Handler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { GET: Handler };
  return mod.GET;
}

test("workflows/[id]/status GET hits canonical /api/workflows/<id>/status", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ status: "running", progress: 0.5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const GET = await loadGet(`ok-${Date.now()}`);
    const res = await GET(statusRequest(), ctx("wf-123"));

    assert.equal(res.status, 200);
    assert.equal(calledUrls.length, 1);
    assert.equal(
      new URL(calledUrls[0]).pathname,
      "/api/workflows/wf-123/status",
    );
    assert.deepEqual(await res.json(), { status: "running", progress: 0.5 });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
    process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("workflows/[id]/status returns 400 on invalid id (no fetch)", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  try {
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const GET = await loadGet(`badid-${Date.now()}`);
    const res = await GET(statusRequest(), ctx("a/b"));

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid id" });
    assert.equal(fetched, false, "no upstream call on invalid id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workflows/[id]/status returns 503 when bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const GET = await loadGet(`down-${Date.now()}`);
    const res = await GET(statusRequest(), ctx("wf-123"));

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "musu-bridge unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});
