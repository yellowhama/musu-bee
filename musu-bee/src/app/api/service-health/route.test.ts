import assert from "node:assert/strict";
import { before, test } from "node:test";
import { NextRequest } from "next/server";

type Module = { GET: (req: NextRequest) => Promise<Response> };
let GET: Module["GET"];

before(async () => {
  process.env.MUSU_PORT_URL = "http://port.test";
  process.env.MUSU_BRIDGE_URL = "http://bridge.test";
  process.env.MUSU_WORKER_URL = "http://worker.test";
  ({ GET } = (await import("./route")) as Module);
});

function req(svc?: string) {
  const url = "http://localhost/api/service-health" + (svc ? `?svc=${svc}` : "");
  return new NextRequest(url);
}

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

test("missing svc param → 400 unknown service", async () => {
  const res = await GET(req());
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { error: string }).error, "unknown service");
});

test("unknown svc value → 400 unknown service", async () => {
  const res = await GET(req("database"));
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { error: string }).error, "unknown service");
});

test("port up (200) → 200 with ok:true and service data", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ status: "ok", version: "1.0" }), { status: 200 }),
    async () => {
      const res = await GET(req("port"));
      assert.equal(res.status, 200);
      const body = await res.json() as { ok: boolean; status: string };
      assert.equal(body.ok, true);
      assert.equal(body.status, "ok");
    }
  );
});

test("port service returns 503 → 502 with ok:false", async () => {
  await withFetchMock(
    async () => new Response("{}", { status: 503 }),
    async () => {
      const res = await GET(req("port"));
      assert.equal(res.status, 502);
      assert.equal((await res.json() as { ok: boolean }).ok, false);
    }
  );
});

test("port unreachable (fetch throws) → 502 with error:unreachable", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await GET(req("port"));
      assert.equal(res.status, 502);
      const body = await res.json() as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, "unreachable");
    }
  );
});

test("bridge up → 200", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    async () => {
      const res = await GET(req("bridge"));
      assert.equal(res.status, 200);
      assert.equal((await res.json() as { ok: boolean }).ok, true);
    }
  );
});

test("worker up → 200", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    async () => {
      const res = await GET(req("worker"));
      assert.equal(res.status, 200);
      assert.equal((await res.json() as { ok: boolean }).ok, true);
    }
  );
});
