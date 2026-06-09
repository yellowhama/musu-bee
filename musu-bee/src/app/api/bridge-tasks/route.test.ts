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

// Smoke test for the proxyToBridge migration of /api/bridge-tasks.
// Contract preserved: targetPath /api/tasks, json parse (malformed → 503),
// allowedParams allowlist [status,limit,before_id,channel,company_id],
// no-store cache, default 503 message "musu-bridge unavailable".

type GetHandler = (req: Request) => Promise<Response>;

function tasksRequest(query = ""): Request {
  return new Request(`http://app.test/api/bridge-tasks${query}`);
}

async function loadGetHandler(cacheBust: string): Promise<GetHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { GET: GetHandler };
  return mod.GET;
}

test("bridge-tasks: proxies to /api/tasks and passes status through", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ tasks: [], total: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const GET = await loadGetHandler(`tasks-${Date.now()}`);
    const res = await GET(tasksRequest());

    assert.equal(res.status, 200, "handler returns 200 from upstream");
    assert.equal(calledUrls.length, 1, "exactly one upstream call");
    assert.equal(
      new URL(calledUrls[0]).pathname,
      "/api/tasks",
      "must hit /api/tasks path"
    );
    const body = (await res.json()) as { total: number };
    assert.equal(body.total, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("bridge-tasks: forwards only allowlisted query params", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const prevToken = process.env.MUSU_BRIDGE_TOKEN;
  const originalFetch = globalThis.fetch;

  const calledUrls: string[] = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const GET = await loadGetHandler(`tasks-filter-${Date.now()}`);
    // status,limit,before_id,channel,company_id allowed; "evil" dropped.
    await GET(
      tasksRequest(
        "?status=open&limit=5&before_id=9&channel=sms&company_id=7&evil=1&page=2"
      )
    );

    assert.equal(calledUrls.length, 1, "exactly one upstream call");
    const target = new URL(calledUrls[0]);
    assert.equal(target.searchParams.get("status"), "open");
    assert.equal(target.searchParams.get("limit"), "5");
    assert.equal(target.searchParams.get("before_id"), "9");
    assert.equal(target.searchParams.get("channel"), "sms");
    assert.equal(target.searchParams.get("company_id"), "7");
    assert.equal(target.searchParams.has("evil"), false, "non-allowlisted dropped");
    assert.equal(target.searchParams.has("page"), false, "non-allowlisted dropped");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevToken;
  }
});

test("bridge-tasks: passes upstream status through (e.g. 404)", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const GET = await loadGetHandler(`tasks-404-${Date.now()}`);
    const res = await GET(tasksRequest());
    assert.equal(res.status, 404, "upstream status passthrough");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});

test("bridge-tasks: json mode → malformed upstream body yields 503", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () =>
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;

    const GET = await loadGetHandler(`tasks-malformed-${Date.now()}`);
    const res = await GET(tasksRequest());
    assert.equal(res.status, 503, "json parse throws → 503");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "musu-bridge unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});

test("bridge-tasks: 503 with default message when bridge unreachable", async () => {
  const prevUrl = process.env.MUSU_BRIDGE_URL;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const GET = await loadGetHandler(`tasks-down-${Date.now()}`);
    const res = await GET(tasksRequest());
    assert.equal(res.status, 503, "503 on bridge unreachable");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "musu-bridge unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevUrl;
  }
});
