import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
};

let GET: Module["GET"];

before(async () => {
  const testHome = await mkdtemp(join(tmpdir(), "musu-processes-test-"));
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.MUSU_WORKER_URL = "http://worker.test";
  process.env.MUSU_WORKER_TOKEN = "worker-token";
  ({ GET } = (await import("./route")) as Module);
});

function req(path: string, authenticated = false) {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: authenticated ? { cookie: "sb-test-auth-token=a.b.c" } : undefined,
  });
}

function authUserResponse() {
  return new Response(
    JSON.stringify({
      id: "user-1",
      email: "operator@example.com",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-05-12T00:00:00.000Z",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

test("GET without auth returns 401 before worker fetch", async () => {
  const res = await GET(req("/api/processes"));
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: string }).error, "Not authenticated");
});

test("GET with auth proxies local process list with worker token", async () => {
  let target = "";
  let authorization = "";
  await withFetchMock(
    async (input, init) => {
      if (input.toString().startsWith("http://supabase.test")) {
        return authUserResponse();
      }
      target = input.toString();
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify([{ pid: 1, name: "musu" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      const res = await GET(req("/api/processes?device_id=local&name=musu", true));
      assert.equal(res.status, 200);
      assert.equal(target, "http://worker.test/processes?name=musu");
      assert.equal(authorization, "Bearer worker-token");
    },
  );
});

test("GET rejects remote worker proxy unless explicitly enabled", async () => {
  delete process.env.MUSU_ENABLE_REMOTE_WORKER_PROXY;
  await withFetchMock(
    async () => authUserResponse(),
    async () => {
      const res = await GET(req("/api/processes?device_id=remote-host", true));
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as { error: string }).error, "remote worker proxy is disabled");
    },
  );
});
