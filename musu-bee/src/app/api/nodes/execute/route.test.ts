import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  POST: (req: NextRequest) => Promise<Response>;
};

let POST: Module["POST"];
let testHome = "";

before(async () => {
  testHome = await mkdtemp(join(tmpdir(), "musu-nodes-execute-test-"));
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.MUSU_WORKER_TOKEN = "worker-token";

  const musuHome = join(testHome, ".musu");
  await mkdir(musuHome, { recursive: true });
  await writeFile(
    join(musuHome, "nodes.toml"),
    [
      "[mesh]",
      "worker_port = 9700",
      "",
      "[[mesh.nodes]]",
      'name = "node-a"',
      'tailscale_ip = "100.64.1.2"',
      "",
    ].join("\n"),
    "utf-8",
  );

  ({ POST } = (await import("./route")) as Module);
});

function req(body: unknown, authenticated = false) {
  return new NextRequest("http://localhost/api/nodes/execute", {
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
  const res = await POST(req({ node_name: "node-a", command: "echo", args: ["ok"] }));
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: string }).error, "Not authenticated");
});

test("POST with auth rejects commands outside the node execute allowlist", async () => {
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
      const res = await POST(req({ node_name: "node-a", command: "powershell", args: ["Get-Process"] }, true));
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "command is not allowlisted");
      assert.equal(workerFetches, 0);
    },
  );
});

test("POST with auth proxies allowlisted diagnostic command and writes audit event", async () => {
  let target = "";
  let authorization = "";
  await withFetchMock(
    async (input, init) => {
      if (input.toString().startsWith("http://supabase.test")) {
        return authUserResponse();
      }
      target = input.toString();
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(
        JSON.stringify({ exit_code: 0, stdout: "Hello from musu-bee!\n", stderr: "" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    async () => {
      const res = await POST(req({ node_name: "node-a", command: "echo", args: ["Hello from musu-bee!"] }, true));
      assert.equal(res.status, 200);
      assert.equal(target, "http://100.64.1.2:9700/execute/process");
      assert.equal(authorization, "Bearer worker-token");

      const audit = await readFile(join(testHome, ".musu", "audit", "command-center.jsonl"), "utf-8");
      const last = JSON.parse(audit.trim().split("\n").at(-1)!) as {
        event: string;
        actor_email: string;
        node: string;
        command: string;
        result: string;
      };
      assert.equal(last.event, "nodes.execute");
      assert.equal(last.actor_email, "operator@example.com");
      assert.equal(last.node, "node-a");
      assert.equal(last.command, "echo");
      assert.equal(last.result, "accepted");
    },
  );
});
