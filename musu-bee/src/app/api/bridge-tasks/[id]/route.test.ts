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

// /api/bridge-tasks/[id] DELETE migrated onto proxyToBridge. Verifies UUID
// validation, the raw (un-encoded) /api/tasks/<uuid> path, json parse mode,
// status passthrough, and 503 fallback.

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

function delRequest(): Request {
  return new Request(`http://app.test/api/bridge-tasks/${VALID_UUID}`, {
    method: "DELETE",
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function loadDelete(cacheBust: string): Promise<Handler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { DELETE: Handler };
  return mod.DELETE;
}

test("bridge-tasks/[id] DELETE hits raw /api/tasks/<uuid> and passes status", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const DELETE = await loadDelete(`ok-${Date.now()}`);
    const res = await DELETE(delRequest(), ctx(VALID_UUID));

    assert.equal(res.status, 200);
    assert.equal(calledUrls.length, 1);
    // Raw id (UUID has no chars needing encoding, but path must match exactly).
    assert.equal(new URL(calledUrls[0]).pathname, `/api/tasks/${VALID_UUID}`);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
    process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("bridge-tasks/[id] DELETE returns 400 on invalid id (no fetch)", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  try {
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const DELETE = await loadDelete(`badid-${Date.now()}`);
    const res = await DELETE(
      new Request("http://app.test/api/bridge-tasks/not-a-uuid", {
        method: "DELETE",
      }),
      ctx("not-a-uuid"),
    );

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid task ID" });
    assert.equal(fetched, false, "no upstream call on invalid id");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bridge-tasks/[id] DELETE returns 503 on malformed upstream (json mode)", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    globalThis.fetch = (async () =>
      new Response("<html>not json</html>", { status: 200 })) as typeof fetch;

    const DELETE = await loadDelete(`malformed-${Date.now()}`);
    const res = await DELETE(delRequest(), ctx(VALID_UUID));

    assert.equal(res.status, 503, "json parse mode → malformed upstream → 503");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});

test("bridge-tasks/[id] DELETE returns 503 when bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const DELETE = await loadDelete(`down-${Date.now()}`);
    const res = await DELETE(delRequest(), ctx(VALID_UUID));

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "musu-bridge unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});
