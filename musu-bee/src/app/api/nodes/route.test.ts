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

// V24-R7 smoke test: confirm musu-bee /api/nodes route handler now calls
// the Rust bridge (R1) canonical path /api/nodes, NOT the deprecated
// Python-era /api/admin/nodes. Proves Option A path reconciliation without
// needing a live Rust bridge running.

// Handler now takes a NextRequest (migrated onto proxyToBridge).
type NodesGetHandler = (req: Request) => Promise<Response>;

function nodesRequest(): Request {
  return new Request("http://app.test/api/nodes");
}

async function loadGetHandler(cacheBust: string): Promise<NodesGetHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { GET: NodesGetHandler };
  return mod.GET;
}

test("R7: nodes route calls Rust bridge /api/nodes canonical path", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calledUrls.push(url);
      // Mirror R1 NodesListResponse shape (handlers/nodes.rs:91-95).
      return new Response(
        JSON.stringify({
          total: 1,
          nodes: [
            {
              name: "land-os",
              url: "http://127.0.0.1:8070",
              roles: ["bridge"],
              agents: [],
              is_self: true,
              healthy: true,
              last_health_at: null,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const GET = await loadGetHandler(`r7-${Date.now()}`);
    const res = await GET(nodesRequest());

    assert.equal(res.status, 200, "handler returns 200 from upstream");

    // The critical assertion: canonical R1 path, NOT Python-era admin path.
    // Assert on the path only — the bridge host/port comes from getBridgeUrl()
    // (env / ~/.musu/services/bridge.json) and is machine-dependent.
    assert.equal(calledUrls.length, 1, "exactly one upstream call");
    assert.equal(
      new URL(calledUrls[0]).pathname,
      "/api/nodes",
      "must hit Rust canonical /api/nodes path"
    );
    assert.ok(
      !calledUrls[0].includes("/api/admin/"),
      "must NOT hit deprecated /api/admin/* namespace"
    );

    // Response shape preserved (handler is a thin proxy).
    const body = (await res.json()) as {
      total: number;
      nodes: Array<{ name: string; is_self: boolean }>;
    };
    assert.equal(body.total, 1);
    assert.equal(body.nodes[0].name, "land-os");
    assert.equal(body.nodes[0].is_self, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) {
      delete process.env.MUSU_BRIDGE_URL;
    } else {
      process.env.MUSU_BRIDGE_URL = prevUrl;
    }
    if (prevToken === undefined) {
      delete process.env.MUSU_BRIDGE_TOKEN;
    } else {
      process.env.MUSU_BRIDGE_TOKEN = prevToken;
    }
  }
});

test("R7: nodes route returns 503 when Rust bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const GET = await loadGetHandler(`r7-down-${Date.now()}`);
    const res = await GET(nodesRequest());

    assert.equal(res.status, 503, "503 on bridge unreachable");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "bridge_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) {
      delete process.env.MUSU_BRIDGE_URL;
    } else {
      process.env.MUSU_BRIDGE_URL = prevUrl;
    }
  }
});
