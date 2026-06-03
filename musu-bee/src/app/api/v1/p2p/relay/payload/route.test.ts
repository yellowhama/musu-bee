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
      bearerReq("http://localhost/api/v1/p2p/relay/payload", payloadBody({ lease_id: "lease-1" }))
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
      payload: {
        owner_key?: string;
        payload_base64?: string;
        status: string;
        delivered_at?: string;
      };
    };
    assert.equal(deliveryBody.schema, "musu.p2p_relay_payload_delivery.v1");
    assert.equal(deliveryBody.payload.owner_key, undefined);
    assert.equal(deliveryBody.payload.payload_base64, undefined);
    assert.equal(deliveryBody.payload.status, "delivered");
    assert.equal(typeof deliveryBody.payload.delivered_at, "string");

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
