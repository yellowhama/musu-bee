import assert from "node:assert/strict";
import { before, test } from "node:test";

type Module = { GET: () => Promise<Response> };
let GET: Module["GET"];

before(async () => {
  process.env.MUSU_PORT_URL = "http://port.test";
  ({ GET } = (await import("./route")) as Module);
});

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

test("/status 200 → metrics + recommended_for 배열", async () => {
  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ cpu: 30, gpu: 50, ram: 30, status: "ok", device_id: "dev-1" }),
        { status: 200 }
      ),
    async () => {
      const res = await GET();
      assert.equal(res.status, 200);
      const body = await res.json() as { cpu: number; gpu: number; recommended_for: string[] };
      assert.equal(body.cpu, 30);
      assert.ok(Array.isArray(body.recommended_for));
    }
  );
});

test("GPU < 60 → 'llm','compute' tags 포함", async () => {
  await withFetchMock(
    async () =>
      new Response(JSON.stringify({ cpu: 80, gpu: 40, ram: 80 }), { status: 200 }),
    async () => {
      const res = await GET();
      const body = await res.json() as { recommended_for: string[] };
      assert.ok(body.recommended_for.includes("llm"), "should include llm");
      assert.ok(body.recommended_for.includes("compute"), "should include compute");
    }
  );
});

test("/status fails, /health 200 → source:'health-fallback'", async () => {
  let callCount = 0;
  await withFetchMock(
    async () => {
      callCount++;
      if (callCount === 1) {
        // /status call
        return new Response("{}", { status: 503 });
      }
      // /health call
      return new Response(
        JSON.stringify({ cpu: 20, gpu: null, ram: 50, status: "ok", device_id: "dev-1" }),
        { status: 200 }
      );
    },
    async () => {
      const res = await GET();
      assert.equal(res.status, 200);
      const body = await res.json() as { source: string };
      assert.equal(body.source, "health-fallback");
    }
  );
});

test("both fail → source:'offline-fallback'", async () => {
  await withFetchMock(
    async () => new Response("{}", { status: 503 }),
    async () => {
      const res = await GET();
      assert.equal(res.status, 200);
      const body = await res.json() as { source: string; recommended_for: string[] };
      assert.equal(body.source, "offline-fallback");
      assert.deepEqual(body.recommended_for, []);
    }
  );
});

test("fetch throws → source:'offline-fallback' reason:'fetch_error'", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await GET();
      assert.equal(res.status, 200);
      const body = await res.json() as { source: string; reason: string };
      assert.equal(body.source, "offline-fallback");
      assert.equal(body.reason, "fetch_error");
    }
  );
});

test("gpu field 없음 → recommended_for에 llm/compute 없음", async () => {
  await withFetchMock(
    async () =>
      new Response(JSON.stringify({ cpu: 30, ram: 30, status: "ok" }), { status: 200 }),
    async () => {
      const res = await GET();
      const body = await res.json() as { recommended_for: string[] };
      assert.ok(!body.recommended_for.includes("llm"), "llm should not appear without gpu");
      assert.ok(!body.recommended_for.includes("compute"), "compute should not appear without gpu");
    }
  );
});
