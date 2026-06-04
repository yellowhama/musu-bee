import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  POST: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
};

let POST: Module["POST"];

before(async () => {
  const testHome = await mkdtemp(join(tmpdir(), "musu-room-work-orders-test-"));
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

function req(body: unknown) {
  return new NextRequest("https://musu.pro/api/rooms/release-room/work-orders", {
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

test("POST requires a room id", async () => {
  const res = await POST(req({ instruction: "Run the room task" }), {
    params: Promise.resolve({ roomId: "   " }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "room_id required");
});

test("POST requires a non-empty instruction", async () => {
  const res = await POST(req({ instruction: "   " }), {
    params: Promise.resolve({ roomId: "release-room" }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "instruction required");
});

test("POST forwards a MUSU.PRO room work order to the local bridge", async () => {
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
      const res = await POST(
        req({
          instruction: "Summarize the release blockers",
          sender_id: "operator-1",
          target_node: "HUGH_SECOND",
          adapter_type: "claude",
          workspace_uri: "file:///F:/workspace/musu-bee",
          company_id: "company-1",
          project_id: "project-rc1",
          work_order_id: "wo-room-1",
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );

      assert.equal(res.status, 202);
      assert.equal(target, "http://127.0.0.1:2817/api/tasks/delegate");
      assert.equal(authorization, "Bearer bridge-token");
      assert.deepEqual(JSON.parse(forwardedBody), {
        channel: "company-room",
        sender_id: "operator-1",
        text: "Summarize the release blockers",
        target_node: "HUGH_SECOND",
        adapter_type: "claude",
        cwd: "F:\\workspace\\musu-bee",
        company_id: "company-1",
        project_id: "project-rc1",
        room_id: "release-room",
        work_order_id: "wo-room-1",
        origin: "musu.pro",
      });

      const body = (await res.json()) as {
        room_id: string;
        work_order_id: string;
        origin: string;
        bridge: { task_id: string; status: string };
      };
      assert.equal(body.room_id, "release-room");
      assert.equal(body.work_order_id, "wo-room-1");
      assert.equal(body.origin, "musu.pro");
      assert.deepEqual(body.bridge, { task_id: "task-1", status: "queued" });
    },
  );
});

test("POST generates a bounded work order id when omitted", async () => {
  let forwardedBody = "";

  await withFetchMock(
    async (_input, init) => {
      forwardedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ task_id: "task-2", status: "queued" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    },
    async () => {
      const res = await POST(req({ instruction: "Check room state" }), {
        params: Promise.resolve({ roomId: "release-room" }),
      });
      assert.equal(res.status, 202);

      const forwarded = JSON.parse(forwardedBody) as { work_order_id: string; room_id: string };
      assert.equal(forwarded.room_id, "release-room");
      assert.match(forwarded.work_order_id, /^wo-[0-9a-f-]{36}$/);

      const body = (await res.json()) as { work_order_id: string };
      assert.equal(body.work_order_id, forwarded.work_order_id);
    },
  );
});
