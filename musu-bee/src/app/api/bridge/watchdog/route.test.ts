import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

let GET: Module["GET"];
let POST: Module["POST"];

before(async () => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "musu-watchdog-test-"));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.MUSU_BRIDGE_URL = "http://bridge.test";
  process.env.MUSU_BRIDGE_TOKEN = "test-token";
  ({ GET, POST } = (await import("./route")) as Module);
});

function req(path: string, method = "GET", authenticated = false) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: authenticated ? { cookie: "sb-test-auth-token=a.b.c" } : undefined,
  });
}

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = orig;
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
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("GET without auth returns 401 before node validation", async () => {
  const res = await GET(req("/api/bridge/watchdog"));
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: string }).error, "Not authenticated");
});

test("GET with auth but without node returns 400", async () => {
  await withFetchMock(
    async () => authUserResponse(),
    async () => {
      const res = await GET(req("/api/bridge/watchdog", "GET", true));
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "node is required");
    }
  );
});

test("GET proxies dashboard query shape to bridge watchdog status path", async () => {
  let target = "";
  await withFetchMock(
    async (input) => {
      if (input.toString().startsWith("http://supabase.test")) {
        return authUserResponse();
      }
      target = input.toString();
      return new Response(JSON.stringify({ bridge_running: true, connectsd_ok: true }), { status: 200 });
    },
    async () => {
      const res = await GET(req("/api/bridge/watchdog?node=node-a", "GET", true));
      assert.equal(res.status, 200);
      assert.equal(target, "http://bridge.test/api/watchdog/node-a/status");
    }
  );
});

test("POST without auth returns 401 before command validation", async () => {
  const res = await POST(req("/api/bridge/watchdog?node=node-a&cmd=shell:exec", "POST"));
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: string }).error, "Not authenticated");
});

test("POST with auth rejects commands outside the watchdog allowlist", async () => {
  await withFetchMock(
    async () => authUserResponse(),
    async () => {
      const res = await POST(req("/api/bridge/watchdog?node=node-a&cmd=shell:exec", "POST", true));
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "invalid watchdog command");
    }
  );
});

test("POST with auth proxies allowed command and writes audit event", async () => {
  let target = "";
  await withFetchMock(
    async (input) => {
      if (input.toString().startsWith("http://supabase.test")) {
        return authUserResponse();
      }
      target = input.toString();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    async () => {
      const res = await POST(req("/api/bridge/watchdog?node=node-a&cmd=bridge:restart", "POST", true));
      assert.equal(res.status, 200);
      assert.equal(target, "http://bridge.test/api/watchdog/node-a/bridge%3Arestart");

      const audit = await readFile(join(process.env.HOME!, ".musu", "audit", "command-center.jsonl"), "utf-8");
      const last = JSON.parse(audit.trim().split("\n").at(-1)!) as {
        actor_email: string;
        node: string;
        command: string;
        result: string;
      };
      assert.equal(last.actor_email, "operator@example.com");
      assert.equal(last.node, "node-a");
      assert.equal(last.command, "bridge:restart");
      assert.equal(last.result, "accepted");
    }
  );
});
