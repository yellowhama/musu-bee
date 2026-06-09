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

// Smoke test for the proxyToBridge migration of /api/nodes/[name] (DELETE).
// Contract preserved: targetPath /api/nodes/{encodeURIComponent(name)},
// json parse (malformed → 503), error message "bridge_unavailable",
// no params forwarded, path-param extraction kept in the route.

type DeleteHandler = (
  req: Request,
  ctx: { params: Promise<{ name: string }> }
) => Promise<Response>;

async function loadDeleteHandler(cacheBust: string): Promise<DeleteHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { DELETE: DeleteHandler };
  return mod.DELETE;
}

test("nodes/[name]: DELETE proxies to /api/nodes/{name}", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; method: string }> = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: String(init?.method) });
      return new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const DELETE = await loadDeleteHandler(`node-del-${Date.now()}`);
    const res = await DELETE(
      new Request("http://app.test/api/nodes/land-os", { method: "DELETE" }),
      { params: Promise.resolve({ name: "land-os" }) }
    );

    assert.equal(res.status, 200, "upstream status passthrough");
    assert.equal(calls.length, 1, "exactly one upstream call");
    assert.equal(new URL(calls[0].url).pathname, "/api/nodes/land-os");
    assert.equal(calls[0].method, "DELETE");
    const body = (await res.json()) as { deleted: boolean };
    assert.equal(body.deleted, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("nodes/[name]: DELETE encodeURIComponent-encodes the path param", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const DELETE = await loadDeleteHandler(`node-enc-${Date.now()}`);
    // A name with a slash + space must be percent-encoded into one segment.
    await DELETE(
      new Request("http://app.test/api/nodes/foo", { method: "DELETE" }),
      { params: Promise.resolve({ name: "weird name/x" }) }
    );

    assert.equal(calledUrls.length, 1);
    // Raw URL must contain the encoded form, not a literal extra path segment.
    assert.ok(
      calledUrls[0].includes("/api/nodes/weird%20name%2Fx"),
      `encoded segment expected, got: ${calledUrls[0]}`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("nodes/[name]: json mode → malformed upstream yields 503 bridge_unavailable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () =>
      new Response("<html>nope</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;

    const DELETE = await loadDeleteHandler(`node-malformed-${Date.now()}`);
    const res = await DELETE(
      new Request("http://app.test/api/nodes/x", { method: "DELETE" }),
      { params: Promise.resolve({ name: "x" }) }
    );
    assert.equal(res.status, 503, "json parse throws → 503");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "bridge_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});

test("nodes/[name]: 503 bridge_unavailable when bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const DELETE = await loadDeleteHandler(`node-down-${Date.now()}`);
    const res = await DELETE(
      new Request("http://app.test/api/nodes/x", { method: "DELETE" }),
      { params: Promise.resolve({ name: "x" }) }
    );
    assert.equal(res.status, 503, "503 on bridge unreachable");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "bridge_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});
