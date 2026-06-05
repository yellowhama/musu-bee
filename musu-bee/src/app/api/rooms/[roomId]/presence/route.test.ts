import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { loadNodeCandidateSet } from "@/lib/p2pRendezvousStore";

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
  "MUSU_P2P_RENDEZVOUS_STORE_PATH",
  "MUSU_P2P_RENDEZVOUS_TTL_SEC",
  "MUSU_ROOM_PRESENCE_STORE_PATH",
  "MUSU_ROOM_PRESENCE_TTL_SEC",
  "MUSU_ROOM_PRESENCE_MAX_RECORDS",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

function req(
  body: unknown,
  token: string | null = "test-token",
  url = "https://musu.pro/api/rooms/release-room/presence"
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

async function withRoomPresenceEnv(fn: (mod: Module) => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-room-presence-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_ROOM_PRESENCE_STORE_PATH = join(tempDir, "presence.json");
  process.env.MUSU_P2P_RENDEZVOUS_STORE_PATH = join(tempDir, "rendezvous.json");
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

test("POST requires a room id before recording room presence", async () => {
  await withRoomPresenceEnv(async ({ POST }) => {
    const res = await POST(req({ node_id: "pc-a" }), ctx("  "));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "room_id required");
  });
});

test("GET and POST require P2P control auth", async () => {
  await withRoomPresenceEnv(async ({ GET, POST }) => {
    const postRes = await POST(req({ node_id: "pc-a" }, null), ctx("release-room"));
    assert.equal(postRes.status, 401);

    const getRes = await GET(
      getReq("https://musu.pro/api/rooms/release-room/presence", null),
      ctx("release-room")
    );
    assert.equal(getRes.status, 401);
  });
});

test("POST upserts bounded room presence and seeds rendezvous candidates", async () => {
  await withRoomPresenceEnv(async ({ POST }) => {
    const res = await POST(
      req({
        node_id: "pc-a",
        node_name: "HUGH_SECOND",
        app_version: "1.15.0-rc.1",
        status: "busy",
        company_id: "company-1",
        project_id: "project-rc1",
        source_agent_id: "planner",
        active_work_order_ids: ["wo-1", "wo-2"],
        candidate_endpoints: [
          { kind: "lan", addr: "192.168.1.100:8949", observed_at: "2026-06-04T00:00:00Z", scheme: "https" },
          { kind: "tailscale", addr: "100.64.1.100:8949", observed_at: "2026-06-04T00:00:01Z" },
          {
            kind: "direct_quic",
            addr: "203.0.113.100:8949",
            observed_at: "2026-06-04T00:00:02Z",
            public_addr: "203.0.113.100:8949",
            nat_type: "restricted_cone",
            nat_observed_by: "stun:musu.pro",
          },
          {
            kind: "relay",
            addr: "relay.musu.pro:443",
            observed_at: "2026-06-04T00:00:03Z",
            relay_url: "https://relay.musu.pro/r/lease-pc-a",
            relay_protocol: "websocket_tunnel",
          },
        ],
        relay_capable: true,
        public_key: "pk_source",
        capabilities: ["remote_command", "browser"],
        origin: "musu.pro-room",
      }),
      ctx("release-room")
    );
    assert.equal(res.status, 201);

    const body = (await res.json()) as {
      ok: boolean;
      room_id: string;
      candidate_cache_seeded: boolean;
      presence: {
        schema: string;
        owner_key: string;
        room_id: string;
        node_id: string;
        node_name: string;
        app_version: string;
        status: string;
        company_id: string;
        project_id: string;
        source_agent_id: string;
        active_work_order_ids: string[];
        candidate_endpoints: Array<{
          kind: string;
          addr: string;
          observed_at: string;
          scheme?: string;
          public_addr?: string;
          nat_type?: string;
          nat_observed_by?: string;
          relay_url?: string;
          relay_protocol?: string;
        }>;
        relay_capable: boolean;
        public_key: string;
        capabilities: string[];
        origin: string;
        heartbeat_ttl_seconds: number;
      };
    };

    assert.equal(body.ok, true);
    assert.equal(body.room_id, "release-room");
    assert.equal(body.candidate_cache_seeded, true);
    assert.equal(body.presence.schema, "musu.room_presence.v1");
    assert.match(body.presence.owner_key, /^token-sha256:/);
    assert.equal(body.presence.room_id, "release-room");
    assert.equal(body.presence.node_id, "pc-a");
    assert.equal(body.presence.node_name, "HUGH_SECOND");
    assert.equal(body.presence.app_version, "1.15.0-rc.1");
    assert.equal(body.presence.status, "busy");
    assert.equal(body.presence.company_id, "company-1");
    assert.equal(body.presence.project_id, "project-rc1");
    assert.equal(body.presence.source_agent_id, "planner");
    assert.deepEqual(body.presence.active_work_order_ids, ["wo-1", "wo-2"]);
    assert.equal(body.presence.candidate_endpoints[0]?.kind, "lan");
    assert.equal(body.presence.candidate_endpoints[0]?.addr, "192.168.1.100:8949");
    assert.equal(body.presence.candidate_endpoints[0]?.scheme, "https");
    assert.equal(body.presence.candidate_endpoints[2]?.public_addr, "203.0.113.100:8949");
    assert.equal(body.presence.candidate_endpoints[2]?.nat_type, "restricted_cone");
    assert.equal(body.presence.candidate_endpoints[2]?.nat_observed_by, "stun:musu.pro");
    assert.equal(body.presence.candidate_endpoints[3]?.relay_url, "https://relay.musu.pro/r/lease-pc-a");
    assert.equal(body.presence.candidate_endpoints[3]?.relay_protocol, "websocket_tunnel");
    assert.equal(body.presence.relay_capable, true);
    assert.equal(body.presence.public_key, "pk_source");
    assert.deepEqual(body.presence.capabilities, ["remote_command", "browser"]);
    assert.equal(body.presence.origin, "musu.pro-room");
    assert.equal(body.presence.heartbeat_ttl_seconds, 120);

    const cached = await loadNodeCandidateSet(body.presence.owner_key, "pc-a");
    assert.equal(cached?.node_id, "pc-a");
    assert.equal(cached?.node_name, "HUGH_SECOND");
    assert.equal(cached?.candidate_endpoints[0]?.addr, "192.168.1.100:8949");
    assert.equal(cached?.candidate_endpoints[2]?.public_addr, "203.0.113.100:8949");
    assert.equal(cached?.candidate_endpoints[2]?.nat_type, "restricted_cone");
    assert.equal(cached?.candidate_endpoints[3]?.relay_protocol, "websocket_tunnel");
    assert.deepEqual(cached?.capabilities, ["remote_command", "browser"]);
  });
});

test("GET returns current owner-scoped room presence with filters", async () => {
  await withRoomPresenceEnv(async ({ GET, POST }) => {
    const first = await POST(
      req({
        node_id: "pc-a",
        status: "online",
        company_id: "company-1",
        project_id: "project-rc1",
      }),
      ctx("release-room")
    );
    assert.equal(first.status, 201);

    const second = await POST(
      req({
        node_id: "pc-b",
        status: "busy",
        company_id: "company-1",
        project_id: "project-rc1",
      }),
      ctx("release-room")
    );
    assert.equal(second.status, 201);

    const filtered = await GET(
      getReq("https://musu.pro/api/rooms/release-room/presence?status=busy&company_id=company-1"),
      ctx("release-room")
    );
    assert.equal(filtered.status, 200);
    const body = (await filtered.json()) as {
      ok: boolean;
      room_id: string;
      presence_order: string;
      count: number;
      presence: Array<{ node_id: string; status: string }>;
    };

    assert.equal(body.ok, true);
    assert.equal(body.room_id, "release-room");
    assert.equal(body.presence_order, "last_seen_desc");
    assert.equal(body.count, 1);
    assert.equal(body.presence[0]?.node_id, "pc-b");
    assert.equal(body.presence[0]?.status, "busy");
  });
});

test("GET does not expose another authorized bearer owner's room presence", async () => {
  await withRoomPresenceEnv(async ({ GET, POST }) => {
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = [
      sha256("test-token"),
      sha256("other-token"),
    ].join(",");
    const res = await POST(req({ node_id: "pc-a", status: "online" }), ctx("release-room"));
    assert.equal(res.status, 201);

    const otherOwner = await GET(
      getReq("https://musu.pro/api/rooms/release-room/presence", "other-token"),
      ctx("release-room")
    );
    assert.equal(otherOwner.status, 200);
    const body = (await otherOwner.json()) as { count: number; presence: unknown[] };
    assert.equal(body.count, 0);
    assert.deepEqual(body.presence, []);
  });
});

test("GET accepts the diagnostic include_expired flag while returning fresh presence", async () => {
  await withRoomPresenceEnv(async ({ GET, POST }) => {
    process.env.MUSU_ROOM_PRESENCE_TTL_SEC = "15";
    const res = await POST(req({ node_id: "pc-a", status: "online" }), ctx("release-room"));
    assert.equal(res.status, 201);

    const current = await GET(
      getReq("https://musu.pro/api/rooms/release-room/presence"),
      ctx("release-room")
    );
    assert.equal(current.status, 200);
    assert.equal(((await current.json()) as { count: number }).count, 1);

    const diagnostic = await GET(
      getReq("https://musu.pro/api/rooms/release-room/presence?include_expired=true"),
      ctx("release-room")
    );
    assert.equal(diagnostic.status, 200);
    assert.equal(((await diagnostic.json()) as { count: number }).count, 1);
  });
});

test("POST rejects raw payload byte fields in room presence", async () => {
  await withRoomPresenceEnv(async ({ POST }) => {
    const res = await POST(
      req({
        node_id: "pc-a",
        candidate_endpoints: [
          {
            kind: "lan",
            addr: "192.168.1.100:8949",
            payload_base64: Buffer.from("do-not-store-room-presence-payload").toString("base64"),
          },
        ],
      }),
      ctx("release-room")
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      ok: boolean;
      accepted: boolean;
      error: string;
      forbidden_fields: string[];
    };
    assert.equal(body.ok, false);
    assert.equal(body.accepted, false);
    assert.equal(body.error, "room_presence_payload_bytes_not_accepted");
    assert.deepEqual(body.forbidden_fields, ["candidate_endpoints.0.payload_base64"]);
  });
});

test("POST rejects unknown room presence and candidate fields", async () => {
  await withRoomPresenceEnv(async ({ POST }) => {
    const res = await POST(
      req({
        node_id: "pc-a",
        room_id: "body-room-must-not-win",
        unexpected_release_field: true,
        candidate_endpoints: [
          {
            kind: "lan",
            addr: "192.168.1.100:8949",
            unexpected_endpoint_field: true,
          },
        ],
      }),
      ctx("release-room")
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_room_presence");
    assert.deepEqual(
      body.issues.map((issue) => issue.path).sort(),
      ["candidate_endpoints.0.unexpected_endpoint_field", "room_id", "unexpected_release_field"]
    );
  });
});
