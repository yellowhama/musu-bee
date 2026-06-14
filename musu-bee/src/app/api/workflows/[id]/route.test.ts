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

// /api/workflows/[id] route migrated onto proxyToBridge. Verifies the route
// hits the canonical bridge path, validates id, passes upstream status through,
// 503s on bridge failure, and preserves the 204 → empty-body contract.

type Handler = (req: Request, ctx: Ctx) => Promise<Response>;
type Ctx = { params: Promise<{ id: string }> };

function wfRequest(method = "GET"): Request {
  return new Request("http://app.test/api/workflows/wf-123", { method });
}

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}

async function loadHandlers(
  cacheBust: string,
): Promise<{ GET: Handler; PATCH: Handler; DELETE: Handler }> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as {
    GET: Handler;
    PATCH: Handler;
    DELETE: Handler;
  };
}

function setEnv() {
  process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
  process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";
}

test("workflows/[id] GET hits canonical /api/workflows/<id> and passes status", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  try {
    setEnv();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ id: "wf-123", status: "running" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { GET } = await loadHandlers(`get-${Date.now()}`);
    const res = await GET(wfRequest("GET"), ctx("wf-123"));

    assert.equal(res.status, 200);
    assert.equal(calledUrls.length, 1);
    assert.equal(new URL(calledUrls[0]).pathname, "/api/workflows/wf-123");
    assert.deepEqual(await res.json(), { id: "wf-123", status: "running" });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
    process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("workflows/[id] DELETE 204 upstream → empty body status 204", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  try {
    setEnv();
    globalThis.fetch = (async () =>
      new Response(null, { status: 204 })) as typeof fetch;

    const { DELETE } = await loadHandlers(`del204-${Date.now()}`);
    const res = await DELETE(wfRequest("DELETE"), ctx("wf-123"));

    assert.equal(res.status, 204, "204 passthrough");
    const body = await res.text();
    assert.equal(body, "", "204 body is empty (not JSON-wrapped)");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
    process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("workflows/[id] PATCH passes upstream non-2xx status through", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  try {
    setEnv();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })) as typeof fetch;

    const { PATCH } = await loadHandlers(`patch-${Date.now()}`);
    const res = await PATCH(
      new Request("http://app.test/api/workflows/wf-123", {
        method: "PATCH",
        body: JSON.stringify({ status: "stopped" }),
      }),
      ctx("wf-123"),
    );

    assert.equal(res.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
    process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("workflows/[id] returns 400 on invalid id (no fetch)", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  try {
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { GET } = await loadHandlers(`badid-${Date.now()}`);
    const res = await GET(wfRequest("GET"), ctx("bad/../id"));

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid id" });
    assert.equal(fetched, false, "no upstream call on invalid id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workflows/[id] returns 503 when bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const { GET } = await loadHandlers(`down-${Date.now()}`);
    const res = await GET(wfRequest("GET"), ctx("wf-123"));

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "musu-bridge unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});
