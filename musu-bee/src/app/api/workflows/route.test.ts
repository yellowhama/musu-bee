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

// Smoke test for the proxyToBridge migration of /api/workflows (GET + POST).
// Contract preserved: targetPath /api/workflows, text parse (JSON-or-raw
// fallback, never 503 on malformed body), forwards ALL query params,
// no-store cache, default 503 message "musu-bridge unavailable", POST body
// forwarded.

type Handler = (req: Request) => Promise<Response>;

async function loadHandlers(
  cacheBust: string
): Promise<{ GET: Handler; POST: Handler }> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as { GET: Handler; POST: Handler };
}

test("workflows: GET proxies to /api/workflows and forwards all params", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify([{ id: "wf1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { GET } = await loadHandlers(`wf-get-${Date.now()}`);
    const res = await GET(
      new Request("http://app.test/api/workflows?company_id=3&anything=ok")
    );

    assert.equal(res.status, 200);
    assert.equal(calledUrls.length, 1, "exactly one upstream call");
    const target = new URL(calledUrls[0]);
    assert.equal(target.pathname, "/api/workflows");
    // text mode forwards ALL params (no allowlist).
    assert.equal(target.searchParams.get("company_id"), "3");
    assert.equal(target.searchParams.get("anything"), "ok");
    const body = (await res.json()) as Array<{ id: string }>;
    assert.equal(body[0].id, "wf1");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("workflows: POST proxies to /api/workflows and forwards the body", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; method: string; body: string }> = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: String(init?.method),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(JSON.stringify({ id: "wf-new" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { POST } = await loadHandlers(`wf-post-${Date.now()}`);
    const res = await POST(
      new Request("http://app.test/api/workflows", {
        method: "POST",
        body: JSON.stringify({ name: "demo" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    assert.equal(res.status, 201, "upstream 201 passthrough");
    assert.equal(calls.length, 1, "exactly one upstream call");
    assert.equal(new URL(calls[0].url).pathname, "/api/workflows");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body, JSON.stringify({ name: "demo" }), "body forwarded");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("workflows: text mode → malformed upstream body passes through (NOT 503)", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () =>
      new Response("plain text not json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;

    const { GET } = await loadHandlers(`wf-raw-${Date.now()}`);
    const res = await GET(new Request("http://app.test/api/workflows"));

    // text mode: raw string passes through with upstream status, NOT 503.
    assert.equal(res.status, 200, "text mode never 503 on malformed body");
    const body = (await res.json()) as unknown;
    assert.equal(body, "plain text not json", "raw string fallback preserved");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});

test("workflows: 503 with default message when bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const { POST } = await loadHandlers(`wf-down-${Date.now()}`);
    const res = await POST(
      new Request("http://app.test/api/workflows", {
        method: "POST",
        body: "{}",
      })
    );
    assert.equal(res.status, 503, "503 on bridge unreachable");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "musu-bridge unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});
