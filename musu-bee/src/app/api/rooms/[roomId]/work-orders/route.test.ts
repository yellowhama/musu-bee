import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  POST: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
};

let POST: Module["POST"];
let testHome = "";

before(async () => {
  testHome = await mkdtemp(join(tmpdir(), "musu-room-work-orders-test-"));
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.MUSU_HOME = join(testHome, ".musu");
  process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:2817";
  process.env.MUSU_BRIDGE_TOKEN = "bridge-token";
  process.env.MUSU_P2P_CONTROL_TOKEN = "room-control-token";

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

function req(body: unknown, token: string | null = "room-control-token") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new NextRequest("https://musu.pro/api/rooms/release-room/work-orders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function rawReq(body: string, token: string | null = "room-control-token") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new NextRequest("https://musu.pro/api/rooms/release-room/work-orders", {
    method: "POST",
    headers,
    body,
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

async function readAuditEvents(): Promise<Array<Record<string, unknown>>> {
  const auditPath = join(testHome, ".musu", "audit", "command-center.jsonl");
  const content = await readFile(auditPath, "utf-8").catch(() => "");
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("POST requires a room id", async () => {
  const res = await POST(req({ instruction: "Run the room task" }), {
    params: Promise.resolve({ roomId: "   " }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "room_id required");
});

test("POST requires a non-empty instruction", async () => {
  await withFetchMock(
    async () => {
      throw new Error("bridge should not be called for rejected work orders");
    },
    async () => {
      const res = await POST(req({ instruction: "   " }), {
        params: Promise.resolve({ roomId: "release-room" }),
      });
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "instruction required");

      const auditEvents = await readAuditEvents();
      const audit = auditEvents.at(-1);
      assert.ok(audit);
      assert.equal(audit.event, "rooms.work_orders");
      assert.equal(audit.result, "rejected");
      assert.equal(audit.http_status, 400);
      assert.equal(audit.origin, "musu.pro");
      assert.equal(audit.room_id, "release-room");
      assert.equal(audit.reason, "instruction required");
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "text"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "instruction"), false);
    },
  );
});

test("POST audit-logs invalid JSON after P2P auth without forwarding to bridge", async () => {
  await withFetchMock(
    async () => {
      throw new Error("bridge should not be called for invalid JSON");
    },
    async () => {
      const res = await POST(rawReq("{"), {
        params: Promise.resolve({ roomId: "release-room" }),
      });
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "invalid_json");

      const auditEvents = await readAuditEvents();
      const audit = auditEvents.at(-1);
      assert.ok(audit);
      assert.equal(audit.event, "rooms.work_orders");
      assert.equal(audit.actor_id, audit.owner_key);
      assert.match(String(audit.actor_id), /^token-sha256:[a-f0-9]{64}$/);
      assert.equal(audit.result, "rejected");
      assert.equal(audit.http_status, 400);
      assert.equal(audit.origin, "musu.pro");
      assert.equal(audit.room_id, "release-room");
      assert.equal(audit.reason, "invalid_json");
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "text"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "instruction"), false);
    },
  );
});

test("POST requires P2P control auth before forwarding a room work order", async () => {
  await withFetchMock(
    async () => {
      throw new Error("bridge should not be called before auth");
    },
    async () => {
      const res = await POST(req({ instruction: "Run the room task" }, null), {
        params: Promise.resolve({ roomId: "release-room" }),
      });
      assert.equal(res.status, 401);
      const body = (await res.json()) as {
        ok: boolean;
        error: string;
        accepted_auth_modes: string[];
      };
      assert.equal(body.ok, false);
      assert.equal(body.error, "unauthorized");
      assert.deepEqual(body.accepted_auth_modes, ["static_bearer_token"]);
    },
  );
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
        owner_scoped: boolean;
        bridge: { task_id: string; status: string };
      };
      assert.equal(body.room_id, "release-room");
      assert.equal(body.work_order_id, "wo-room-1");
      assert.equal(body.origin, "musu.pro");
      assert.equal(body.owner_scoped, true);
      assert.deepEqual(body.bridge, { task_id: "task-1", status: "queued" });

      const auditEvents = await readAuditEvents();
      const audit = auditEvents.at(-1);
      assert.ok(audit);
      assert.equal(audit.event, "rooms.work_orders");
      assert.equal(audit.actor_id, audit.owner_key);
      assert.match(String(audit.actor_id), /^token-sha256:[a-f0-9]{64}$/);
      assert.equal(audit.actor_email, null);
      assert.equal(audit.node, "HUGH_SECOND");
      assert.equal(audit.command, "room.work_order");
      assert.equal(audit.result, "accepted");
      assert.equal(audit.http_status, 202);
      assert.equal(audit.bridge_status, 202);
      assert.equal(audit.origin, "musu.pro");
      assert.equal(audit.room_id, "release-room");
      assert.equal(audit.work_order_id, "wo-room-1");
      assert.equal(audit.company_id, "company-1");
      assert.equal(audit.project_id, "project-rc1");
      assert.equal(audit.target_node, "HUGH_SECOND");
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "text"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "instruction"), false);
    },
  );
});

test("POST audit-logs bridge unavailable without storing the instruction text", async () => {
  await withFetchMock(
    async () => {
      throw new Error("bridge offline");
    },
    async () => {
      const res = await POST(
        req({
          instruction: "This should not be written to the command audit log",
          target_node: "local",
          work_order_id: "wo-room-error",
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );
      assert.equal(res.status, 503);

      const auditEvents = await readAuditEvents();
      const audit = auditEvents.at(-1);
      assert.ok(audit);
      assert.equal(audit.event, "rooms.work_orders");
      assert.equal(audit.result, "bridge_error");
      assert.equal(audit.http_status, 503);
      assert.equal(audit.room_id, "release-room");
      assert.equal(audit.work_order_id, "wo-room-error");
      assert.equal(audit.target_node, "local");
      assert.equal(audit.reason, "bridge offline");
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "text"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "instruction"), false);
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
