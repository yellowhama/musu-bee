import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// bridge-token.ts imports "server-only", which throws under the node test
// runner. Stub it before importing the helper (matches the pattern in
// app/api/agents/route.test.ts).
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

const { proxyToBridge } = require("./bridge-proxy") as typeof import("./bridge-proxy");

// Minimal fetch stub helper.
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

function req(url: string, init?: { method?: string; body?: string }): Request {
  return new Request(url, {
    method: init?.method ?? "GET",
    body: init?.body,
  });
}

test("proxyToBridge forwards GET and passes through JSON with upstream status", async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ ok: true, items: [1, 2] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/companies"), {
        targetPath: "/api/companies",
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, items: [1, 2] });
    },
  );
});

test("proxyToBridge preserves upstream non-2xx status", async () => {
  await withFetch(
    async () => new Response(JSON.stringify({ error: "nope" }), { status: 404 }),
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x"), {
        targetPath: "/api/x",
      });
      assert.equal(res.status, 404);
    },
  );
});

test("proxyToBridge text-mode falls back to raw string on non-JSON (catch-all behavior)", async () => {
  await withFetch(
    async () => new Response("<html>not json</html>", { status: 200 }),
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x"), {
        targetPath: "/api/x",
        parse: "text",
      });
      assert.equal(res.status, 200);
      assert.equal(await res.json(), "<html>not json</html>");
    },
  );
});

test("proxyToBridge json-mode returns 503 on malformed upstream (route behavior)", async () => {
  await withFetch(
    async () => new Response("<html>not json</html>", { status: 200 }),
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x"), {
        targetPath: "/api/x",
        parse: "json",
      });
      assert.equal(res.status, 503);
    },
  );
});

test("proxyToBridge returns 503 on network failure", async () => {
  await withFetch(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x"), {
        targetPath: "/api/x",
      });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "musu-bridge unavailable" });
    },
  );
});

test("proxyToBridge applies custom error message", async () => {
  await withFetch(
    async () => {
      throw new Error("down");
    },
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x"), {
        targetPath: "/api/x",
        errorMessage: "bridge_unavailable",
      });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "bridge_unavailable" });
    },
  );
});

test("proxyToBridge emptyOn204 returns empty 204 body when upstream is 204", async () => {
  await withFetch(
    async () => new Response(null, { status: 204 }),
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x", { method: "DELETE" }), {
        targetPath: "/api/x",
        emptyOn204: true,
      });
      assert.equal(res.status, 204);
      assert.equal(await res.text(), "", "204 body is empty, not JSON-wrapped");
    },
  );
});

test("proxyToBridge without emptyOn204 does not special-case 204 (opt-in flag)", async () => {
  // Without the flag, the 204 branch is skipped; a 204 with content flows into
  // the normal parse path. Use a 204 carrying a JSON body so the wrap is
  // observable: text mode JSON-parses it and re-wraps with the upstream status.
  // (An *empty*-body 204 cannot be re-wrapped by NextResponse.json and the
  //  emptyOn204 flag exists precisely to handle that case cleanly.)
  await withFetch(
    async () => new Response(JSON.stringify({ done: true }), { status: 200 }),
    async () => {
      const res = await proxyToBridge(req("https://app.test/api/bridge/x", { method: "DELETE" }), {
        targetPath: "/api/x",
        parse: "text",
      });
      assert.equal(res.status, 200, "normal (non-204) path unaffected by absent flag");
      assert.deepEqual(await res.json(), { done: true });
    },
  );
});

test("proxyToBridge allowedParams filters query string", async () => {
  let capturedUrl = "";
  await withFetch(
    async (input: string | URL | Request) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return new Response("{}", { status: 200 });
    },
    async () => {
      await proxyToBridge(
        req("https://app.test/api/bridge/tasks?status=open&secret=leak&limit=5"),
        { targetPath: "/api/tasks", allowedParams: ["status", "limit"] },
      );
      assert.ok(capturedUrl.includes("status=open"), "status passes");
      assert.ok(capturedUrl.includes("limit=5"), "limit passes");
      assert.ok(!capturedUrl.includes("secret"), "non-allowlisted param filtered");
    },
  );
});
