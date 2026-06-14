import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

type Module = {
  POST: (req: NextRequest) => Promise<Response>;
};

let POST: Module["POST"];

before(async () => {
  const testHome = await mkdtemp(join(tmpdir(), "musu-tasks-forward-test-"));
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.MUSU_HOME = join(testHome, ".musu");
  process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:2817";
  process.env.MUSU_BRIDGE_TOKEN = "bridge-token";

  const require = createRequire(import.meta.url);
  const nodeModule = require("module") as typeof import("node:module") & {
    _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  nodeModule._load = function patchedLoad(request: string, parent?: unknown, isMain?: boolean) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    ({ POST } = (await import("./route")) as Module);
  } finally {
    nodeModule._load = originalLoad;
  }
});

function req(body: unknown, url = "https://musu.pro/api/tasks/forward") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

test("POST requires a non-empty instruction", async () => {
  const res = await POST(req({ instruction: "   " }));
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "instruction required");
});

test("POST forwards MUSU.PRO work-order context to the local bridge", async () => {
  let target = "";
  let authorization = "";
  let forwardedBody = "";

  await withFetchMock(
    async (input, init) => {
      target = input.toString();
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      forwardedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ task_id: "task-1", status: "queued" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      // The route maps workspace_uri → cwd via fileURLToPath, which is
      // OS-dependent (F:\... on Windows, /F:/... on Linux). Derive the expected
      // cwd the SAME way so this asserts the forwarding contract, not the host's
      // path style (which previously broke the Linux CI build).
      const workspaceUri = "file:///F:/workspace/musu-bee";
      const expectedCwd = fileURLToPath(workspaceUri);
      const res = await POST(
        req({
          instruction: "Run the release smoke locally",
          channel: "company-room",
          sender_id: "operator-1",
          target_node: "local",
          adapter_type: "claude",
          workspace_uri: workspaceUri,
          company_id: "company-1",
          project_id: "project-rc1",
          room_id: "release-room",
          work_order_id: "wo-20260604-1",
        }),
      );

      assert.equal(res.status, 202);
      assert.equal(target, "http://127.0.0.1:2817/api/tasks/delegate");
      assert.equal(authorization, "Bearer bridge-token");
      assert.deepEqual(JSON.parse(forwardedBody), {
        channel: "company-room",
        sender_id: "operator-1",
        text: "Run the release smoke locally",
        adapter_type: "claude",
        cwd: expectedCwd,
        company_id: "company-1",
        project_id: "project-rc1",
        room_id: "release-room",
        work_order_id: "wo-20260604-1",
        origin: "musu.pro",
      });
    },
  );
});
