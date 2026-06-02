import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  POST: (req: NextRequest) => Promise<Response>;
};

let POST: Module["POST"];
let testHome = "";

before(async () => {
  testHome = await mkdtemp(join(tmpdir(), "musu-process-start-test-"));
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.MUSU_WORKER_URL = "http://worker.test";
  process.env.MUSU_WORKER_TOKEN = "worker-token";
  ({ POST } = (await import("./route")) as Module);
});

function req(body: unknown, authenticated = false) {
  return new NextRequest("http://localhost/api/processes/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { cookie: "sb-test-auth-token=a.b.c" } : {}),
    },
    body: JSON.stringify(body),
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

test("POST without auth returns 401 before worker fetch", async () => {
  const res = await POST(req({ command: "python", args: ["bot.py"] }));
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: string }).error, "Not authenticated");
});

test("POST with auth rejects process start when command allowlist is empty", async () => {
  delete process.env.MUSU_PROCESS_START_ALLOWLIST;
  let workerFetches = 0;
  await withFetchMock(
    async (input) => {
      if (input.toString().startsWith("http://supabase.test")) {
        return authUserResponse();
      }
      workerFetches += 1;
      return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
    },
    async () => {
      const res = await POST(req({ command: "python", args: ["bot.py"] }, true));
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as { error: string }).error, "process start command is not allowlisted");
      assert.equal(workerFetches, 0);
    },
  );
});

test("POST with auth proxies allowlisted process start and writes audit event", async () => {
  process.env.MUSU_PROCESS_START_ALLOWLIST = "python";
  let target = "";
  let authorization = "";
  let forwardedBody = "";
  await withFetchMock(
    async (input, init) => {
      if (input.toString().startsWith("http://supabase.test")) {
        return authUserResponse();
      }
      target = input.toString();
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      forwardedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ pid: 42, name: "python" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      const res = await POST(
        req({ command: "python", args: ["bot.py"], cwd: "C:/work", env: { SHOULD_NOT_FORWARD: "1" } }, true),
      );
      assert.equal(res.status, 200);
      assert.equal(target, "http://worker.test/processes/start");
      assert.equal(authorization, "Bearer worker-token");
      assert.deepEqual(JSON.parse(forwardedBody), {
        command: "python",
        args: ["bot.py"],
        cwd: "C:/work",
        env: {},
      });

      const audit = await readFile(join(testHome, ".musu", "audit", "command-center.jsonl"), "utf-8");
      const last = JSON.parse(audit.trim().split("\n").at(-1)!) as {
        event: string;
        command: string;
        result: string;
      };
      assert.equal(last.event, "processes.start");
      assert.equal(last.command, "python");
      assert.equal(last.result, "accepted");
    },
  );
});
