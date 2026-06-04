import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
  POST: (req: NextRequest, context: { params: Promise<{ roomId: string }> }) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_ROOM_EVENT_STORE_PATH",
  "MUSU_ROOM_EVENT_MAX_EVENTS",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

function req(
  body: unknown,
  token: string | null = "test-token",
  url = "https://musu.pro/api/rooms/release-room/events"
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getReq(url: string, token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest(url, { method: "GET", headers });
}

function ctx(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function withRoomEventEnv(fn: (mod: Module) => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-room-events-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_ROOM_EVENT_STORE_PATH = join(tempDir, "events.json");
  try {
    const mod = (await import(`./route?case=${Date.now()}-${Math.random()}`)) as Module;
    await fn(mod);
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("POST requires a room id before recording a room event", async () => {
  await withRoomEventEnv(async ({ POST }) => {
    const res = await POST(req({ event_type: "presence" }), ctx("  "));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "room_id required");
  });
});

test("GET and POST require P2P control auth", async () => {
  await withRoomEventEnv(async ({ GET, POST }) => {
    const postRes = await POST(req({ event_type: "presence" }, null), ctx("release-room"));
    assert.equal(postRes.status, 401);

    const getRes = await GET(
      getReq("https://musu.pro/api/rooms/release-room/events", null),
      ctx("release-room")
    );
    assert.equal(getRes.status, 401);
  });
});

test("POST records a bounded room event with web context", async () => {
  await withRoomEventEnv(async ({ POST }) => {
    const res = await POST(
      req({
        event_type: "decision",
        company_id: "company-1",
        project_id: "project-rc1",
        work_order_id: "wo-room-1",
        source_node_id: "pc-a",
        source_agent_id: "planner",
        message: "Use LAN first, then relay only after direct path failure.",
        payload: {
          decision: "prefer-direct-p2p",
          route_order: ["lan", "tailscale", "direct_quic", "relay"],
          oversized_string: "x".repeat(700),
        },
        origin: "musu.pro-room",
      }),
      ctx("release-room")
    );
    assert.equal(res.status, 201);

    const body = (await res.json()) as {
      ok: boolean;
      room_id: string;
      event: {
        schema: string;
        event_id: string;
        owner_key: string;
        room_id: string;
        event_type: string;
        company_id: string;
        project_id: string;
        work_order_id: string;
        source_node_id: string;
        source_agent_id: string;
        message: string;
        origin: string;
        payload: { oversized_string: string; route_order: string[] };
      };
    };

    assert.equal(body.ok, true);
    assert.equal(body.room_id, "release-room");
    assert.equal(body.event.schema, "musu.room_event.v1");
    assert.match(body.event.event_id, /^room-event-/);
    assert.match(body.event.owner_key, /^token-sha256:/);
    assert.equal(body.event.room_id, "release-room");
    assert.equal(body.event.event_type, "decision");
    assert.equal(body.event.company_id, "company-1");
    assert.equal(body.event.project_id, "project-rc1");
    assert.equal(body.event.work_order_id, "wo-room-1");
    assert.equal(body.event.source_node_id, "pc-a");
    assert.equal(body.event.source_agent_id, "planner");
    assert.equal(body.event.message, "Use LAN first, then relay only after direct path failure.");
    assert.equal(body.event.origin, "musu.pro-room");
    assert.equal(body.event.payload.oversized_string.length, 512);
    assert.deepEqual(body.event.payload.route_order, ["lan", "tailscale", "direct_quic", "relay"]);
  });
});

test("GET lists room events for the same bearer owner and filters by event type", async () => {
  await withRoomEventEnv(async ({ GET, POST }) => {
    const first = await POST(
      req({
        event_type: "presence",
        company_id: "company-1",
        project_id: "project-rc1",
        source_node_id: "pc-a",
        message: "pc-a joined",
      }),
      ctx("release-room")
    );
    assert.equal(first.status, 201);

    const second = await POST(
      req({
        event_type: "message",
        company_id: "company-1",
        project_id: "project-rc1",
        source_node_id: "pc-b",
        message: "pc-b is ready for the work order",
      }),
      ctx("release-room")
    );
    assert.equal(second.status, 201);

    const filtered = await GET(
      getReq("https://musu.pro/api/rooms/release-room/events?event_type=message&company_id=company-1"),
      ctx("release-room")
    );
    assert.equal(filtered.status, 200);
    const body = (await filtered.json()) as {
      ok: boolean;
      room_id: string;
      event_order: string;
      count: number;
      events: Array<{ event_type: string; source_node_id: string; message: string }>;
    };

    assert.equal(body.ok, true);
    assert.equal(body.room_id, "release-room");
    assert.equal(body.event_order, "newest_first");
    assert.equal(body.count, 1);
    assert.equal(body.events[0]?.event_type, "message");
    assert.equal(body.events[0]?.source_node_id, "pc-b");
    assert.equal(body.events[0]?.message, "pc-b is ready for the work order");
  });
});

test("GET does not expose another authorized bearer owner's room events", async () => {
  await withRoomEventEnv(async ({ GET, POST }) => {
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = [
      sha256("test-token"),
      sha256("other-token"),
    ].join(",");
    const res = await POST(req({ event_type: "presence", message: "owner event" }), ctx("release-room"));
    assert.equal(res.status, 201);

    const otherOwner = await GET(
      getReq("https://musu.pro/api/rooms/release-room/events", "other-token"),
      ctx("release-room")
    );
    assert.equal(otherOwner.status, 200);
    const body = (await otherOwner.json()) as { count: number; events: unknown[] };
    assert.equal(body.count, 0);
    assert.deepEqual(body.events, []);
  });
});
