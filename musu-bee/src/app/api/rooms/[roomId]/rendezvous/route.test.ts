import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";
import { saveNodeCandidateSet } from "@/lib/p2pRendezvousStore";

type Module = {
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
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

function req(body: unknown, token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("https://musu.pro/api/rooms/release-room/rendezvous", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function ctx(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

async function withRoomRendezvousEnv(fn: (mod: Module) => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-room-rendezvous-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_P2P_RENDEZVOUS_STORE_PATH = join(tempDir, "sessions.json");
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

test("POST requires a room id before opening a room rendezvous", async () => {
  await withRoomRendezvousEnv(async ({ POST }) => {
    const res = await POST(req({ source_node_id: "pc-a", target_node_id: "pc-b" }), ctx("  "));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "room_id required");
  });
});

test("POST requires P2P control auth", async () => {
  await withRoomRendezvousEnv(async ({ POST }) => {
    const res = await POST(req({ source_node_id: "pc-a", target_node_id: "pc-b" }, null), ctx("release-room"));
    assert.equal(res.status, 401);
  });
});

test("POST creates a room-scoped rendezvous and preserves web context", async () => {
  await withRoomRendezvousEnv(async ({ POST }) => {
    await saveNodeCandidateSet(
      p2pControlOwnerKey("test-token"),
      {
        node_id: "pc-b",
        node_name: "HUGH-MAIN",
        app_version: "1.15.0-rc.1",
        relay_capable: true,
        public_key: "pk_target",
        capabilities: ["remote_command"],
        candidate_endpoints: [
          { kind: "lan", addr: "192.168.1.192:8949", observed_at: "2026-06-04T00:00:00Z", scheme: "https" },
          { kind: "tailscale", addr: "100.64.1.192:8949", observed_at: "2026-06-04T00:00:01Z" },
          {
            kind: "direct_quic",
            addr: "198.51.100.192:8949",
            observed_at: "2026-06-04T00:00:02Z",
            public_addr: "198.51.100.192:8949",
            nat_type: "open_internet",
            nat_observed_by: "stun:musu.pro",
          },
          {
            kind: "relay",
            addr: "relay.musu.pro:443",
            observed_at: "2026-06-04T00:00:03Z",
            relay_url: "https://relay.musu.pro/r/lease-pc-b",
            relay_protocol: "websocket_tunnel",
          },
        ],
      }
    );

    const res = await POST(
      req({
        source_node_id: "pc-a",
        target_node_id: "pc-b",
        requested_capability: "remote_command",
        company_id: "company-1",
        project_id: "project-rc1",
        work_order_id: "wo-room-1",
      }),
      ctx("release-room")
    );
    assert.equal(res.status, 201);

    const body = (await res.json()) as {
      ok: boolean;
      room_id: string;
      origin: string;
      session: {
        owner_key: string;
        source: { node_id: string };
        target: {
          node_id: string;
          candidate_endpoints: Array<{
            kind: string;
            addr: string;
            public_addr?: string;
            nat_type?: string;
            relay_url?: string;
            relay_protocol?: string;
          }>;
        };
        path_selection_order: string[];
        requested_capability: string;
        context: {
          company_id: string;
          project_id: string;
          room_id: string;
          work_order_id: string;
          origin: string;
        };
      };
    };

    assert.equal(body.ok, true);
    assert.equal(body.room_id, "release-room");
    assert.equal(body.origin, "musu.pro");
    assert.equal(body.session.owner_key, p2pControlOwnerKey("test-token"));
    assert.equal(body.session.source.node_id, "pc-a");
    assert.equal(body.session.target.node_id, "pc-b");
    assert.equal(body.session.target.candidate_endpoints[0]?.kind, "lan");
    assert.equal(body.session.target.candidate_endpoints[0]?.addr, "192.168.1.192:8949");
    assert.equal(body.session.target.candidate_endpoints[2]?.public_addr, "198.51.100.192:8949");
    assert.equal(body.session.target.candidate_endpoints[2]?.nat_type, "open_internet");
    assert.equal(body.session.target.candidate_endpoints[3]?.relay_url, "https://relay.musu.pro/r/lease-pc-b");
    assert.equal(body.session.target.candidate_endpoints[3]?.relay_protocol, "websocket_tunnel");
    assert.deepEqual(body.session.path_selection_order, ["lan", "tailscale", "direct_quic", "relay"]);
    assert.equal(body.session.requested_capability, "remote_command");
    assert.deepEqual(body.session.context, {
      company_id: "company-1",
      project_id: "project-rc1",
      room_id: "release-room",
      work_order_id: "wo-room-1",
      origin: "musu.pro",
    });
  });
});

test("POST rejects raw payload byte fields in room rendezvous creation", async () => {
  await withRoomRendezvousEnv(async ({ POST }) => {
    const res = await POST(
      req({
        source_node_id: "pc-a",
        target_node_id: "pc-b",
        payload_base64: Buffer.from("do-not-store-room-rendezvous-payload").toString("base64"),
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
    assert.equal(body.error, "room_rendezvous_payload_bytes_not_accepted");
    assert.deepEqual(body.forbidden_fields, ["payload_base64"]);
  });
});

test("POST rejects unknown room rendezvous fields including body room_id", async () => {
  await withRoomRendezvousEnv(async ({ POST }) => {
    const res = await POST(
      req({
        source_node_id: "pc-a",
        target_node_id: "pc-b",
        room_id: "body-room-must-not-win",
        unexpected_release_field: true,
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
    assert.equal(body.error, "invalid_room_rendezvous_request");
    assert.deepEqual(
      body.issues.map((issue) => issue.path).sort(),
      ["room_id", "unexpected_release_field"]
    );
  });
});
