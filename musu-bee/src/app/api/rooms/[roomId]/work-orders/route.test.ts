import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
  PATCH: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
  POST: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
};

let GET: Module["GET"];
let PATCH: Module["PATCH"];
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
  process.env.MUSU_ROOM_WORK_ORDER_STORE_PATH = join(testHome, "room-work-orders.json");

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
    ({ GET, PATCH, POST } = (await import("./route")) as Module);
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

function getReq(url: string, token: string | null = "room-control-token") {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new NextRequest(url, { method: "GET", headers });
}

function patchReq(body: unknown, token: string | null = "room-control-token") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new NextRequest("https://musu.pro/api/rooms/release-room/work-orders", {
    method: "PATCH",
    headers,
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

test("POST can queue a MUSU.PRO room work order for Desktop outbound pickup without calling bridge", async () => {
  await withFetchMock(
    async () => {
      throw new Error("hosted MUSU.PRO must not call a local bridge for outbound pickup orders");
    },
    async () => {
      const res = await POST(
        req({
          instruction: "Reply with one-machine work-order smoke token",
          sender_id: "operator-1",
          target_node: "HUGH_SECOND",
          adapter_type: "claude",
          workspace_uri: "file:///F:/workspace/musu-bee",
          company_id: "company-1",
          project_id: "project-rc1",
          source_agent_id: "planner",
          work_order_id: "wo-outbound-1",
          delivery_mode: "desktop_outbound_pickup",
          permission_envelope: {
            allowed_actions: ["diagnostic_reply"],
            shell: false,
            network: false,
          },
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );

      assert.equal(res.status, 202);
      const body = (await res.json()) as {
        ok: boolean;
        room_id: string;
        work_order_id: string;
        origin: string;
        owner_scoped: boolean;
        delivery_mode: string;
        requires_desktop_outbound_pickup: boolean;
        bridge: null;
        work_order: {
          owner_key?: string;
          work_order_id: string;
          status: string;
          target_node: string;
          instruction: string;
          delivery_mode: string;
          permission_envelope: { allowed_actions: string[]; shell: boolean; network: boolean };
        };
      };
      assert.equal(body.ok, true);
      assert.equal(body.room_id, "release-room");
      assert.equal(body.work_order_id, "wo-outbound-1");
      assert.equal(body.origin, "musu.pro");
      assert.equal(body.owner_scoped, true);
      assert.equal(body.delivery_mode, "desktop_outbound_pickup");
      assert.equal(body.requires_desktop_outbound_pickup, true);
      assert.equal(body.bridge, null);
      assert.equal(body.work_order.owner_key, undefined);
      assert.equal(body.work_order.work_order_id, "wo-outbound-1");
      assert.equal(body.work_order.status, "queued");
      assert.equal(body.work_order.target_node, "HUGH_SECOND");
      assert.equal(body.work_order.instruction, "Reply with one-machine work-order smoke token");
      assert.equal(body.work_order.delivery_mode, "desktop_outbound_pickup");
      assert.deepEqual(body.work_order.permission_envelope.allowed_actions, ["diagnostic_reply"]);
      assert.equal(body.work_order.permission_envelope.shell, false);
      assert.equal(body.work_order.permission_envelope.network, false);

      const auditEvents = await readAuditEvents();
      const audit = auditEvents.at(-1);
      assert.ok(audit);
      assert.equal(audit.event, "rooms.work_orders");
      assert.equal(audit.command, "room.work_order");
      assert.equal(audit.result, "queued");
      assert.equal(audit.http_status, 202);
      assert.equal(audit.room_id, "release-room");
      assert.equal(audit.work_order_id, "wo-outbound-1");
      assert.equal(audit.target_node, "HUGH_SECOND");
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "text"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(audit, "instruction"), false);
    },
  );
});

test("GET lists queued owner-scoped room work orders for Desktop pickup", async () => {
  const res = await GET(
    getReq("https://musu.pro/api/rooms/release-room/work-orders?status=queued&target_node=HUGH_SECOND"),
    { params: Promise.resolve({ roomId: "release-room" }) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    schema: string;
    ok: boolean;
    room_id: string;
    owner_scoped: boolean;
    count: number;
    work_orders: Array<{ owner_key?: string; work_order_id: string; status: string }>;
  };
  assert.equal(body.schema, "musu.room_work_order_inbox.v1");
  assert.equal(body.ok, true);
  assert.equal(body.room_id, "release-room");
  assert.equal(body.owner_scoped, true);
  assert.ok(body.count >= 1);
  assert.equal(body.work_orders.some((order) => order.work_order_id === "wo-outbound-1"), true);
  assert.equal(body.work_orders.find((order) => order.work_order_id === "wo-outbound-1")?.owner_key, undefined);
});

test("PATCH claims queued room work orders for the target Desktop", async () => {
  const res = await PATCH(
    patchReq({
      schema: "musu.room_work_order_claim.v1",
      target_node_id: "HUGH_SECOND",
      claimant_node_id: "hugh_second",
      work_order_id: "wo-outbound-1",
      limit: 1,
    }),
    { params: Promise.resolve({ roomId: "release-room" }) },
  );
  assert.equal(res.status, 202);
  const body = (await res.json()) as {
    schema: string;
    ok: boolean;
    owner_scoped: boolean;
    claimed: boolean;
    count: number;
    target_node: string;
    work_orders: Array<{
      owner_key?: string;
      work_order_id: string;
      status: string;
      claimed_by: string;
      claimed_at: string;
    }>;
  };
  assert.equal(body.schema, "musu.room_work_order_claim.v1");
  assert.equal(body.ok, true);
  assert.equal(body.owner_scoped, true);
  assert.equal(body.claimed, true);
  assert.equal(body.count, 1);
  assert.equal(body.target_node, "HUGH_SECOND");
  assert.equal(body.work_orders[0]?.owner_key, undefined);
  assert.equal(body.work_orders[0]?.work_order_id, "wo-outbound-1");
  assert.equal(body.work_orders[0]?.status, "claimed");
  assert.equal(body.work_orders[0]?.claimed_by, "hugh_second");
  assert.equal(typeof body.work_orders[0]?.claimed_at, "string");
});

test("PATCH marks claimed room work orders accepted after local bridge handoff", async () => {
  const res = await PATCH(
    patchReq({
      schema: "musu.room_work_order_delivery.v1",
      target_node_id: "HUGH_SECOND",
      work_order_id: "wo-outbound-1",
      status: "accepted",
      bridge_task_id: "bridge-task-1",
      bridge_status: "202",
    }),
    { params: Promise.resolve({ roomId: "release-room" }) },
  );
  assert.equal(res.status, 202);
  const body = (await res.json()) as {
    schema: string;
    ok: boolean;
    accepted: boolean;
    requeued: boolean;
    failed: boolean;
    work_order: {
      owner_key?: string;
      work_order_id: string;
      status: string;
      bridge_task_id: string;
      bridge_status: string;
      terminal_at: string;
    };
  };
  assert.equal(body.schema, "musu.room_work_order_delivery.v1");
  assert.equal(body.ok, true);
  assert.equal(body.accepted, true);
  assert.equal(body.requeued, false);
  assert.equal(body.failed, false);
  assert.equal(body.work_order.owner_key, undefined);
  assert.equal(body.work_order.work_order_id, "wo-outbound-1");
  assert.equal(body.work_order.status, "accepted");
  assert.equal(body.work_order.bridge_task_id, "bridge-task-1");
  assert.equal(body.work_order.bridge_status, "202");
  assert.equal(typeof body.work_order.terminal_at, "string");

  const auditEvents = await readAuditEvents();
  const audit = auditEvents.at(-1);
  assert.ok(audit);
  assert.equal(audit.event, "rooms.work_orders");
  assert.equal(audit.command, "room.work_order.delivery");
  assert.equal(audit.result, "accepted");
  assert.equal(audit.work_order_id, "wo-outbound-1");
  assert.equal(Object.prototype.hasOwnProperty.call(audit, "text"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(audit, "instruction"), false);
});

test("PATCH can requeue a claimed room work order after local bridge handoff failure", async () => {
  await withFetchMock(
    async () => {
      throw new Error("hosted MUSU.PRO must not call a local bridge for outbound pickup orders");
    },
    async () => {
      const queued = await POST(
        req({
          instruction: "Requeue me after bridge failure",
          target_node: "HUGH_SECOND",
          work_order_id: "wo-requeue-1",
          delivery_mode: "desktop_outbound_pickup",
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );
      assert.equal(queued.status, 202);

      const claimed = await PATCH(
        patchReq({
          schema: "musu.room_work_order_claim.v1",
          target_node_id: "HUGH_SECOND",
          claimant_node_id: "hugh_second",
          work_order_id: "wo-requeue-1",
          limit: 1,
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );
      assert.equal(claimed.status, 202);

      const delivered = await PATCH(
        patchReq({
          schema: "musu.room_work_order_delivery.v1",
          target_node_id: "HUGH_SECOND",
          work_order_id: "wo-requeue-1",
          status: "queued",
          bridge_status: "0",
          error: "bridge_unavailable:test",
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );
      assert.equal(delivered.status, 202);
      const body = (await delivered.json()) as {
        ok: boolean;
        requeued: boolean;
        work_order: {
          owner_key?: string;
          work_order_id: string;
          status: string;
          claimed_by?: string;
          last_error: string;
        };
      };
      assert.equal(body.ok, true);
      assert.equal(body.requeued, true);
      assert.equal(body.work_order.owner_key, undefined);
      assert.equal(body.work_order.work_order_id, "wo-requeue-1");
      assert.equal(body.work_order.status, "queued");
      assert.equal(body.work_order.claimed_by, undefined);
      assert.equal(body.work_order.last_error, "bridge_unavailable:test");

      const listed = await GET(
        getReq("https://musu.pro/api/rooms/release-room/work-orders?status=queued&target_node=HUGH_SECOND&work_order_id=wo-requeue-1"),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );
      assert.equal(listed.status, 200);
      const listedBody = (await listed.json()) as { count: number; work_orders: Array<{ work_order_id: string; status: string }> };
      assert.equal(listedBody.count, 1);
      assert.equal(listedBody.work_orders[0]?.work_order_id, "wo-requeue-1");
      assert.equal(listedBody.work_orders[0]?.status, "queued");
    },
  );
});

test("PATCH does not expose another authorized owner work-order claims", async () => {
  await withFetchMock(
    async () => {
      throw new Error("hosted MUSU.PRO must not call a local bridge for outbound pickup orders");
    },
    async () => {
      const queued = await POST(
        req({
          instruction: "Owner-scoped queued order",
          target_node: "HUGH_SECOND",
          work_order_id: "wo-owner-scope-1",
          delivery_mode: "desktop_outbound_pickup",
        }),
        { params: Promise.resolve({ roomId: "release-room" }) },
      );
      assert.equal(queued.status, 202);

      const previous = process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S;
      process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = [
        "room-control-token",
        "other-room-token",
      ].map((token) => createHash("sha256").update(token).digest("hex")).join(",");
      try {
        const res = await PATCH(
          patchReq({
            schema: "musu.room_work_order_claim.v1",
            target_node_id: "HUGH_SECOND",
            claimant_node_id: "other-owner-node",
            work_order_id: "wo-owner-scope-1",
            limit: 10,
          }, "other-room-token"),
          { params: Promise.resolve({ roomId: "release-room" }) },
        );
        assert.equal(res.status, 202);
        const body = (await res.json()) as { ok: boolean; claimed: boolean; count: number; work_orders: unknown[] };
        assert.equal(body.ok, true);
        assert.equal(body.claimed, false);
        assert.equal(body.count, 0);
        assert.deepEqual(body.work_orders, []);
      } finally {
        if (previous === undefined) {
          delete process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S;
        } else {
          process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = previous;
        }
      }
    },
  );
});
