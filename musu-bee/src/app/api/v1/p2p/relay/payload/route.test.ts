import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import {
  appendRelayLease,
  createRelayLease,
  type RelayRouteKind,
} from "@/lib/p2pRelayLeaseStore";
import {
  __setP2pRelayPayloadKvClientForTest,
  appendRelayPayload,
  claimRelayPayloads,
  createRelayPayload,
  markRelayPayloadDelivered,
  p2pRelayPayloadStoreStatus,
  queryRelayPayloads,
  relayPayloadDeliveryProofFromDeliveredPayload,
  type StoredP2pRelayPayload,
} from "@/lib/p2pRelayPayloadStore";
import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  PATCH: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_PAYLOAD_STORE_PATH",
  "MUSU_P2P_RELAY_PAYLOAD_MAX_BYTES",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
] as const;

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

async function withRelayEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-relay-payload-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH = join(tempDir, "leases.json");
  process.env.MUSU_P2P_RELAY_PAYLOAD_STORE_PATH = join(tempDir, "payloads.json");
  try {
    await fn();
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

function fakeRelayPayloadKv() {
  const state: {
    delCalls: number;
    evalCommands: string[];
    list: StoredP2pRelayPayload[];
    lpushCalls: number;
    ltrimCalls: number;
    rpushCalls: number;
  } = {
    delCalls: 0,
    evalCommands: [],
    list: [],
    lpushCalls: 0,
    ltrimCalls: 0,
    rpushCalls: 0,
  };
  return {
    state,
    client: {
      async del() {
        state.delCalls += 1;
        state.list = [];
      },
      async eval<T = unknown>(script: string, _keys: string[], args: string[]): Promise<T> {
        if (script.includes("musu_relay_payload_append_v1")) {
          state.evalCommands.push("append");
          const payload = JSON.parse(args[0] ?? "{}") as StoredP2pRelayPayload;
          const maxRecords = Number.parseInt(args[1] ?? "1000", 10);
          state.list = [payload, ...state.list].slice(0, maxRecords);
          return JSON.stringify({ ok: true }) as T;
        }

        if (script.includes("musu_relay_payload_claim_v1")) {
          state.evalCommands.push("claim");
          const [
            maxRecordsText,
            now,
            ownerKey,
            targetNodeId,
            sessionId,
            leaseId,
            sourceNodeId,
            tunnelId,
            limitText,
            claimant,
          ] = args;
          const maxRecords = Number.parseInt(maxRecordsText ?? "1000", 10);
          const limit = Number.parseInt(limitText ?? "1", 10);
          const claimed: StoredP2pRelayPayload[] = [];
          state.list = state.list
            .filter((payload) => now < payload.expires_at)
            .map((payload) => {
              if (
                claimed.length < limit &&
                payload.status === "queued" &&
                payload.owner_key === ownerKey &&
                payload.target_node_id === targetNodeId &&
                (!sessionId || payload.session_id === sessionId) &&
                (!leaseId || payload.lease_id === leaseId) &&
                (!sourceNodeId || payload.source_node_id === sourceNodeId) &&
                (!tunnelId || payload.tunnel_id === tunnelId)
              ) {
                const next = {
                  ...payload,
                  status: "claimed" as const,
                  claimed_by: claimant,
                  claimed_at: now,
                };
                claimed.push(next);
                return next;
              }
              return payload;
            })
            .slice(0, maxRecords);
          return JSON.stringify(claimed) as T;
        }

        if (script.includes("musu_relay_payload_deliver_v1")) {
          state.evalCommands.push("deliver");
          const [maxRecordsText, deliveredAt, ownerKey, payloadId, targetNodeId] = args;
          const maxRecords = Number.parseInt(maxRecordsText ?? "1000", 10);
          let result:
            | { status: "delivered"; payload: StoredP2pRelayPayload }
            | { status: "not_found" }
            | { status: "requires_claim" } = { status: "not_found" };
          state.list = state.list
            .filter((payload) => deliveredAt < payload.expires_at)
            .map((payload) => {
              if (
                payload.payload_id !== payloadId ||
                payload.owner_key !== ownerKey ||
                payload.target_node_id !== targetNodeId
              ) {
                return payload;
              }
              if (payload.status !== "claimed") {
                result = { status: "requires_claim" };
                return payload;
              }
              const delivered = {
                ...payload,
                status: "delivered" as const,
                delivered_at: deliveredAt,
              };
              result = { status: "delivered", payload: delivered };
              return delivered;
            })
            .slice(0, maxRecords);
          return JSON.stringify(result) as T;
        }

        throw new Error("unexpected_relay_payload_kv_eval_script");
      },
      async lpush(_key: string, payload: StoredP2pRelayPayload) {
        state.lpushCalls += 1;
        state.list.unshift(payload);
      },
      async lrange<T>(_key: string, start: number, stop: number): Promise<T[]> {
        const end = stop < 0 ? undefined : stop + 1;
        return state.list.slice(start, end) as T[];
      },
      async ltrim(_key: string, start: number, stop: number) {
        state.ltrimCalls += 1;
        const end = stop < 0 ? undefined : stop + 1;
        state.list = state.list.slice(start, end);
      },
      async rpush(_key: string, payload: StoredP2pRelayPayload) {
        state.rpushCalls += 1;
        state.list.push(payload);
      },
    },
  };
}

async function withRelayPayloadKvEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.KV_REST_API_URL = "https://example-kv.invalid";
  process.env.KV_REST_API_TOKEN = "test-kv-token";
  try {
    await fn();
  } finally {
    __setP2pRelayPayloadKvClientForTest(null);
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function bearerReq(url: string, body?: unknown, method?: string): NextRequest {
  const resolvedMethod = method ?? (body === undefined ? "GET" : "POST");
  return new NextRequest(url, {
    method: resolvedMethod,
    headers: {
      Authorization: "Bearer test-token",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function payloadBody(overrides: Record<string, unknown> = {}) {
  const bytes = Buffer.from(JSON.stringify({ task: "relay-preview", n: 1 }), "utf8");
  return {
    schema: "musu.relay_payload_envelope.v1",
    session_id: "session-1",
    lease_id: "lease-missing",
    source_node_id: "node-a",
    target_node_id: "node-b",
    tunnel_id: "tunnel-1",
    payload_kind: "forwarded_task_envelope",
    payload_base64: bytes.toString("base64"),
    payload_sha256: createHash("sha256").update(bytes).digest("hex"),
    ...overrides,
  };
}

async function seedLease(leaseId: string): Promise<void> {
  const lease = createRelayLease({
    owner_key: p2pControlOwnerKey("test-token"),
    session_id: "session-1",
    source_node_id: "node-a",
    target_node_id: "node-b",
    requested_capability: "remote_command",
    attempted_route_kinds: ["lan", "tailscale", "direct_quic"] as RelayRouteKind[],
    failure_class: "direct_failed",
    relay_url: "wss://relay.musu.pro/api/v1/relay/connect",
  });
  await appendRelayLease({ ...lease, lease_id: leaseId });
}

test("rejects relay payload without bearer token", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("auth");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/p2p/relay/payload", {
        method: "POST",
        body: JSON.stringify(payloadBody()),
      })
    );
    assert.equal(res.status, 401);
  });
});

test("does not store relay payload when owner-scoped lease is missing", async () => {
  await withRelayEnv(async () => {
    const { GET, POST } = await loadModule("missing-lease");
    const res = await POST(
      bearerReq("http://localhost/api/v1/p2p/relay/payload", payloadBody())
    );
    assert.equal(res.status, 409);
    const body = (await res.json()) as { ok: boolean; error: string; stored: boolean };
    assert.equal(body.ok, false);
    assert.equal(body.error, "relay_payload_lease_not_found");
    assert.equal(body.stored, false);

    const getRes = await GET(bearerReq("http://localhost/api/v1/p2p/relay/payload"));
    const getBody = (await getRes.json()) as { count: number };
    assert.equal(getBody.count, 0);
  });
});

test("stores lease-bound relay payload as owner-scoped non release-grade queue record", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-1");
    const { GET, POST } = await loadModule("store");
    const res = await POST(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        payloadBody({
          lease_id: "lease-1",
          candidate_route_kinds: ["lan", "tailscale", "direct_quic", "relay"],
          attempted_route_kinds: ["lan", "tailscale", "direct_quic"],
        })
      )
    );
    assert.equal(res.status, 202);
    const body = (await res.json()) as {
      ok: boolean;
      stored: boolean;
      owner_scoped: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      release_grade: boolean;
      release_grade_blockers: string[];
      payload: {
        owner_key?: string;
        payload_id: string;
        payload_base64?: string;
        payload_bytes: number;
        relay_url: string;
        status: string;
        transport_kind: string;
        release_grade: boolean;
        candidate_route_kinds?: RelayRouteKind[];
        attempted_route_kinds?: RelayRouteKind[];
      };
    };
    assert.equal(body.ok, true);
    assert.equal(body.stored, true);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.release_grade, false);
    assert.match(body.release_grade_blockers.join(","), /relay_payload_queue_not_quic_tls_transport/);
    assert.equal(body.payload.owner_key, undefined);
    assert.equal(body.payload.payload_base64, undefined);
    assert.equal(body.payload.payload_bytes > 0, true);
    assert.equal(body.payload.relay_url, "wss://relay.musu.pro/api/v1/relay/connect");
    assert.deepEqual(body.payload.candidate_route_kinds, [
      "lan",
      "tailscale",
      "direct_quic",
      "relay",
    ]);
    assert.deepEqual(body.payload.attempted_route_kinds, ["lan", "tailscale", "direct_quic"]);
    assert.equal(body.payload.status, "queued");
    assert.equal(body.payload.transport_kind, "http_store_forward_preview");
    assert.equal(body.payload.release_grade, false);

    const getRes = await GET(
      bearerReq("http://localhost/api/v1/p2p/relay/payload?session_id=session-1&lease_id=lease-1")
    );
    const getBody = (await getRes.json()) as {
      schema: string;
      count: number;
      payloads: Array<{ owner_key?: string; payload_base64?: string; payload_id: string }>;
    };
    assert.equal(getBody.schema, "musu.p2p_relay_payloads.v1");
    assert.equal(getBody.count, 1);
    assert.equal(getBody.payloads[0]?.owner_key, undefined);
    assert.equal(getBody.payloads[0]?.payload_base64, undefined);
    assert.equal(getBody.payloads[0]?.payload_id, body.payload.payload_id);
  });
});

test("can return payload bytes only when explicitly requested", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-include");
    const { GET, POST } = await loadModule("include-payload");
    const request = payloadBody({ lease_id: "lease-include" });
    await POST(bearerReq("http://localhost/api/v1/p2p/relay/payload", request));

    const getRes = await GET(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload?session_id=session-1&include_payload=1"
      )
    );
    const getBody = (await getRes.json()) as {
      count: number;
      payloads: Array<{ payload_base64?: string; payload_sha256: string }>;
    };
    assert.equal(getBody.count, 1);
    assert.equal(getBody.payloads[0]?.payload_base64, request.payload_base64);
    assert.equal(getBody.payloads[0]?.payload_sha256, request.payload_sha256);
  });
});

test("claims queued relay payloads for the target node", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-claim");
    const { GET, PATCH, POST } = await loadModule("claim");
    const request = payloadBody({ lease_id: "lease-claim" });
    await POST(bearerReq("http://localhost/api/v1/p2p/relay/payload", request));

    const claimRes = await PATCH(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        {
          schema: "musu.relay_payload_claim.v1",
          target_node_id: "node-b",
          claimant_node_id: "node-b",
          session_id: "session-1",
          lease_id: "lease-claim",
          include_payload: true,
        },
        "PATCH"
      )
    );
    assert.equal(claimRes.status, 202);
    const claimBody = (await claimRes.json()) as {
      schema: string;
      count: number;
      payloads: Array<{
        owner_key?: string;
        payload_base64?: string;
        payload_id: string;
        status: string;
        claimed_by?: string;
        claimed_at?: string;
      }>;
    };
    assert.equal(claimBody.schema, "musu.p2p_relay_payload_claim.v1");
    assert.equal(claimBody.count, 1);
    assert.equal(claimBody.payloads[0]?.owner_key, undefined);
    assert.equal(claimBody.payloads[0]?.payload_base64, request.payload_base64);
    assert.equal(claimBody.payloads[0]?.status, "claimed");
    assert.equal(claimBody.payloads[0]?.claimed_by, "node-b");
    assert.equal(typeof claimBody.payloads[0]?.claimed_at, "string");

    const queuedRes = await GET(
      bearerReq("http://localhost/api/v1/p2p/relay/payload?status=queued")
    );
    const queuedBody = (await queuedRes.json()) as { count: number };
    assert.equal(queuedBody.count, 0);

    const claimedRes = await GET(
      bearerReq("http://localhost/api/v1/p2p/relay/payload?status=claimed")
    );
    const claimedBody = (await claimedRes.json()) as { count: number };
    assert.equal(claimedBody.count, 1);

    const secondClaimRes = await PATCH(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        {
          schema: "musu.relay_payload_claim.v1",
          target_node_id: "node-b",
          session_id: "session-1",
          lease_id: "lease-claim",
        },
        "PATCH"
      )
    );
    const secondClaimBody = (await secondClaimRes.json()) as { count: number };
    assert.equal(secondClaimRes.status, 202);
    assert.equal(secondClaimBody.count, 0);
  });
});

test("marks claimed relay payload delivered", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-deliver");
    const { GET, PATCH, POST } = await loadModule("deliver");
    await POST(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        payloadBody({ lease_id: "lease-deliver" })
      )
    );

    const claimRes = await PATCH(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        {
          schema: "musu.relay_payload_claim.v1",
          target_node_id: "node-b",
          lease_id: "lease-deliver",
        },
        "PATCH"
      )
    );
    const claimBody = (await claimRes.json()) as {
      payloads: Array<{ payload_id: string }>;
    };
    const payloadId = claimBody.payloads[0]?.payload_id;
    assert.equal(typeof payloadId, "string");

    const deliveryRes = await PATCH(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        {
          schema: "musu.relay_payload_delivery.v1",
          payload_id: payloadId,
          target_node_id: "node-b",
        },
        "PATCH"
      )
    );
    assert.equal(deliveryRes.status, 202);
    const deliveryBody = (await deliveryRes.json()) as {
      schema: string;
      delivery_proof?: {
        schema: string;
        payload_id: string;
        session_id: string;
        lease_id: string;
        source_node_id: string;
        target_node_id: string;
        relay_url: string;
        tunnel_id: string;
        payload_kind: string;
        transport_kind: string;
        relay_default_data_path: boolean;
        release_grade: boolean;
        payload_sha256: string;
        payload_bytes: number;
        claimed_by: string;
        claimed_at: string;
        created_at: string;
        delivered_at: string;
      };
      payload: {
        owner_key?: string;
        payload_base64?: string;
        payload_id: string;
        session_id: string;
        lease_id: string;
        source_node_id: string;
        target_node_id: string;
        relay_url: string;
        tunnel_id: string;
        payload_kind: string;
        transport_kind: string;
        relay_default_data_path: boolean;
        release_grade: boolean;
        payload_sha256: string;
        payload_bytes: number;
        status: string;
        claimed_by?: string;
        claimed_at?: string;
        created_at: string;
        delivered_at?: string;
      };
    };
    assert.equal(deliveryBody.schema, "musu.p2p_relay_payload_delivery.v1");
    assert.equal(deliveryBody.payload.owner_key, undefined);
    assert.equal(deliveryBody.payload.payload_base64, undefined);
    assert.equal(deliveryBody.payload.status, "delivered");
    assert.equal(typeof deliveryBody.payload.delivered_at, "string");
    assert.equal(deliveryBody.delivery_proof?.schema, "musu.relay_payload_delivery_proof.v1");
    assert.equal(deliveryBody.delivery_proof?.payload_id, deliveryBody.payload.payload_id);
    assert.equal(deliveryBody.delivery_proof?.session_id, deliveryBody.payload.session_id);
    assert.equal(deliveryBody.delivery_proof?.lease_id, deliveryBody.payload.lease_id);
    assert.equal(deliveryBody.delivery_proof?.source_node_id, deliveryBody.payload.source_node_id);
    assert.equal(deliveryBody.delivery_proof?.target_node_id, deliveryBody.payload.target_node_id);
    assert.equal(deliveryBody.delivery_proof?.relay_url, deliveryBody.payload.relay_url);
    assert.equal(deliveryBody.delivery_proof?.tunnel_id, deliveryBody.payload.tunnel_id);
    assert.equal(deliveryBody.delivery_proof?.payload_kind, deliveryBody.payload.payload_kind);
    assert.equal(deliveryBody.delivery_proof?.transport_kind, deliveryBody.payload.transport_kind);
    assert.equal(
      deliveryBody.delivery_proof?.relay_default_data_path,
      deliveryBody.payload.relay_default_data_path
    );
    assert.equal(deliveryBody.delivery_proof?.release_grade, deliveryBody.payload.release_grade);
    assert.equal(deliveryBody.delivery_proof?.payload_sha256, deliveryBody.payload.payload_sha256);
    assert.equal(deliveryBody.delivery_proof?.payload_bytes, deliveryBody.payload.payload_bytes);
    assert.equal(deliveryBody.delivery_proof?.claimed_by, deliveryBody.payload.claimed_by);
    assert.equal(deliveryBody.delivery_proof?.claimed_at, deliveryBody.payload.claimed_at);
    assert.equal(deliveryBody.delivery_proof?.created_at, deliveryBody.payload.created_at);
    assert.equal(deliveryBody.delivery_proof?.delivered_at, deliveryBody.payload.delivered_at);

    const deliveredRes = await GET(
      bearerReq("http://localhost/api/v1/p2p/relay/payload?status=delivered")
    );
    const deliveredBody = (await deliveredRes.json()) as { count: number };
    assert.equal(deliveredBody.count, 1);
  });
});

test("rejects delivery before relay payload is claimed", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-unclaimed");
    const { PATCH, POST } = await loadModule("unclaimed-delivery");
    const postRes = await POST(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        payloadBody({ lease_id: "lease-unclaimed" })
      )
    );
    const postBody = (await postRes.json()) as { payload: { payload_id: string } };

    const deliveryRes = await PATCH(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        {
          schema: "musu.relay_payload_delivery.v1",
          payload_id: postBody.payload.payload_id,
          target_node_id: "node-b",
        },
        "PATCH"
      )
    );
    assert.equal(deliveryRes.status, 409);
    const deliveryBody = (await deliveryRes.json()) as { error: string };
    assert.equal(deliveryBody.error, "relay_payload_delivery_requires_claim");
  });
});

test("KV relay payload store claims and delivers owner-scoped payloads", async () => {
  await withRelayPayloadKvEnv(async () => {
    const { client, state } = fakeRelayPayloadKv();
    __setP2pRelayPayloadKvClientForTest(client);
    const status = p2pRelayPayloadStoreStatus();
    assert.equal(status.configured, true);
    assert.equal(status.release_grade, true);
    const ownerKey = p2pControlOwnerKey("test-token");
    const payload = createRelayPayload({
      owner_key: ownerKey,
      session_id: "session-kv",
      lease_id: "lease-kv",
      source_node_id: "node-a",
      target_node_id: "node-b",
      relay_url: "wss://relay.musu.pro/api/v1/relay/connect",
      tunnel_id: "tunnel-kv",
      payload_kind: "forwarded_task_envelope",
      payload_base64: payloadBody().payload_base64,
      payload_sha256: payloadBody().payload_sha256,
    });
    await appendRelayPayload(payload);
    assert.deepEqual(state.evalCommands, ["append"]);

    const claimed = await claimRelayPayloads({
      owner_key: ownerKey,
      target_node_id: "node-b",
      claimant_node_id: "node-b",
      session_id: "session-kv",
      lease_id: "lease-kv",
      limit: 1,
      status: "queued",
    });

    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.status, "claimed");
    assert.equal(claimed[0]?.claimed_by, "node-b");
    assert.equal(typeof claimed[0]?.claimed_at, "string");
    assert.deepEqual(state.evalCommands, ["append", "claim"]);

    const queued = await queryRelayPayloads({ owner_key: ownerKey, status: "queued" });
    assert.equal(queued.length, 0);

    const delivered = await markRelayPayloadDelivered({
      owner_key: ownerKey,
      payload_id: claimed[0]!.payload_id,
      target_node_id: "node-b",
    });

    assert.equal(delivered?.status, "delivered");
    assert.equal(typeof delivered?.delivered_at, "string");
    const proof = delivered
      ? relayPayloadDeliveryProofFromDeliveredPayload(delivered)
      : null;
    assert.equal(proof?.schema, "musu.relay_payload_delivery_proof.v1");
    assert.equal(proof?.payload_id, delivered?.payload_id);
    assert.equal(proof?.relay_url, delivered?.relay_url);
    assert.equal(proof?.payload_kind, delivered?.payload_kind);
    assert.equal(proof?.transport_kind, delivered?.transport_kind);
    assert.equal(proof?.relay_default_data_path, delivered?.relay_default_data_path);
    assert.equal(proof?.release_grade, delivered?.release_grade);
    assert.equal(proof?.payload_sha256, delivered?.payload_sha256);
    assert.equal(proof?.payload_bytes, delivered?.payload_bytes);
    assert.equal(proof?.claimed_by, delivered?.claimed_by);
    assert.equal(proof?.claimed_at, delivered?.claimed_at);
    assert.equal(proof?.created_at, delivered?.created_at);
    assert.equal(proof?.delivered_at, delivered?.delivered_at);
    assert.deepEqual(state.evalCommands, ["append", "claim", "deliver"]);
    const deliveredRecords = await queryRelayPayloads({
      owner_key: ownerKey,
      status: "delivered",
    });
    assert.equal(deliveredRecords.length, 1);
    assert.equal(deliveredRecords[0]?.payload_id, claimed[0]?.payload_id);
    assert.equal(state.delCalls, 0);
    assert.equal(state.lpushCalls, 0);
    assert.equal(state.ltrimCalls, 0);
    assert.equal(state.rpushCalls, 0);
  });
});

test("KV relay payload store atomically prevents duplicate concurrent claims", async () => {
  await withRelayPayloadKvEnv(async () => {
    const { client, state } = fakeRelayPayloadKv();
    __setP2pRelayPayloadKvClientForTest(client);
    const ownerKey = p2pControlOwnerKey("test-token");
    const payload = createRelayPayload({
      owner_key: ownerKey,
      session_id: "session-kv-race",
      lease_id: "lease-kv-race",
      source_node_id: "node-a",
      target_node_id: "node-b",
      relay_url: "wss://relay.musu.pro/api/v1/relay/connect",
      tunnel_id: "tunnel-kv-race",
      payload_kind: "forwarded_task_envelope",
      payload_base64: payloadBody().payload_base64,
      payload_sha256: payloadBody().payload_sha256,
    });
    await appendRelayPayload(payload);

    const [firstClaim, secondClaim] = await Promise.all([
      claimRelayPayloads({
        owner_key: ownerKey,
        target_node_id: "node-b",
        claimant_node_id: "node-b",
        session_id: "session-kv-race",
        lease_id: "lease-kv-race",
        limit: 1,
        status: "queued",
      }),
      claimRelayPayloads({
        owner_key: ownerKey,
        target_node_id: "node-b",
        claimant_node_id: "node-b-alt",
        session_id: "session-kv-race",
        lease_id: "lease-kv-race",
        limit: 1,
        status: "queued",
      }),
    ]);

    assert.equal(firstClaim.length + secondClaim.length, 1);
    const claimed = [...firstClaim, ...secondClaim][0];
    assert.equal(claimed?.payload_id, payload.payload_id);
    assert.equal(state.evalCommands.filter((command) => command === "claim").length, 2);
    assert.equal(state.delCalls, 0);
    assert.equal(state.rpushCalls, 0);
  });
});

test("KV relay payload store rejects delivery before claim", async () => {
  await withRelayPayloadKvEnv(async () => {
    const { client, state } = fakeRelayPayloadKv();
    __setP2pRelayPayloadKvClientForTest(client);
    const ownerKey = p2pControlOwnerKey("test-token");
    const payload = createRelayPayload({
      owner_key: ownerKey,
      session_id: "session-kv-unclaimed",
      lease_id: "lease-kv-unclaimed",
      source_node_id: "node-a",
      target_node_id: "node-b",
      relay_url: "wss://relay.musu.pro/api/v1/relay/connect",
      tunnel_id: "tunnel-kv-unclaimed",
      payload_kind: "forwarded_task_envelope",
      payload_base64: payloadBody().payload_base64,
      payload_sha256: payloadBody().payload_sha256,
    });
    await appendRelayPayload(payload);

    await assert.rejects(
      () =>
        markRelayPayloadDelivered({
          owner_key: ownerKey,
          payload_id: payload.payload_id,
          target_node_id: "node-b",
        }),
      /relay_payload_delivery_requires_claim/
    );
    assert.deepEqual(state.evalCommands, ["append", "deliver"]);
    assert.equal(state.delCalls, 0);
    assert.equal(state.rpushCalls, 0);
  });
});

test("does not store relay payload when declared source_node_id does not match an owner lease (M1)", async () => {
  await withRelayEnv(async () => {
    // seedLease binds the lease to source=node-a, target=node-b.
    await seedLease("lease-m1-source");
    const { GET, POST } = await loadModule("m1-source-mismatch");
    const res = await POST(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        payloadBody({ lease_id: "lease-m1-source", source_node_id: "node-c" })
      )
    );
    // The lease store filters candidates by source/target, so a mismatched
    // declared source never matches the owner lease and is rejected before any
    // payload is stored. This is the user-facing guarantee M1 protects.
    assert.equal(res.status, 409);
    const body = (await res.json()) as { ok: boolean; error: string; stored: boolean };
    assert.equal(body.ok, false);
    assert.equal(body.error, "relay_payload_lease_not_found");
    assert.equal(body.stored, false);

    const getRes = await GET(bearerReq("http://localhost/api/v1/p2p/relay/payload"));
    const getBody = (await getRes.json()) as { count: number };
    assert.equal(getBody.count, 0);
  });
});

test("does not store relay payload when declared target_node_id does not match an owner lease (M1)", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-m1-target");
    const { GET, POST } = await loadModule("m1-target-mismatch");
    const res = await POST(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        payloadBody({ lease_id: "lease-m1-target", target_node_id: "node-d" })
      )
    );
    assert.equal(res.status, 409);
    const body = (await res.json()) as { ok: boolean; error: string; stored: boolean };
    assert.equal(body.ok, false);
    assert.equal(body.error, "relay_payload_lease_not_found");
    assert.equal(body.stored, false);

    const getRes = await GET(bearerReq("http://localhost/api/v1/p2p/relay/payload"));
    const getBody = (await getRes.json()) as { count: number };
    assert.equal(getBody.count, 0);
  });
});

test("rejects relay payload hash mismatch", async () => {
  await withRelayEnv(async () => {
    await seedLease("lease-hash");
    const { POST } = await loadModule("hash-mismatch");
    const res = await POST(
      bearerReq(
        "http://localhost/api/v1/p2p/relay/payload",
        payloadBody({ lease_id: "lease-hash", payload_sha256: "00" })
      )
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "relay_payload_sha256_mismatch");
  });
});
