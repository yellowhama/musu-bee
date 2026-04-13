import assert from "node:assert/strict";
import { before, test } from "node:test";
import { NextRequest } from "next/server";

type Module = { POST: (req: NextRequest) => Promise<Response> };
let POST: Module["POST"];

before(async () => {
  process.env.MUSU_PORT_URL = "http://port.test";
  ({ POST } = (await import("./route")) as Module);
});

function req(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/route", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

test("musu-port 정상 → selected_host 반환", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ selected_host: "device-1", reason_code: "ok" }), { status: 200 }),
    async () => {
      const res = await POST(req());
      assert.equal(res.status, 200);
      const body = await res.json() as { selected_host: string };
      assert.equal(body.selected_host, "device-1");
    }
  );
});

test("musu-port 503 → fallback reason_code='musu_port_unavailable'", async () => {
  await withFetchMock(
    async () => new Response("{}", { status: 503 }),
    async () => {
      const res = await POST(req());
      assert.equal(res.status, 200);
      const body = await res.json() as { selected_host: string; reason_code: string };
      assert.equal(body.selected_host, "local");
      assert.equal(body.reason_code, "musu_port_unavailable");
    }
  );
});

test("musu-port fetch throws → fallback reason_code='musu_port_unreachable'", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await POST(req());
      assert.equal(res.status, 200);
      const body = await res.json() as { selected_host: string; reason_code: string };
      assert.equal(body.selected_host, "local");
      assert.equal(body.reason_code, "musu_port_unreachable");
    }
  );
});

test("resource_requirement 기본값 'general' 전달", async () => {
  let capturedBody: Record<string, unknown> | null = null;
  await withFetchMock(
    async (_input, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>;
      return new Response(JSON.stringify({ selected_host: "local" }), { status: 200 });
    },
    async () => {
      await POST(req());
      assert.equal(capturedBody?.resource_requirement, "general");
    }
  );
});
