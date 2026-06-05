import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";
import { appendRelayLease, createRelayLease } from "@/lib/p2pRelayLeaseStore";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_P2P_RELAY_ENABLED",
  "MUSU_P2P_RELAY_ENTITLEMENT",
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_WIRED",
  "MUSU_P2P_RELAY_URL",
] as const;

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

async function withRelayEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-relay-connect-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH = join(tempDir, "leases.json");
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

function enableRelayPolicyEnv(): void {
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_P2P_RELAY_ENABLED = "1";
  process.env.MUSU_P2P_RELAY_TRANSPORT_WIRED = "1";
  process.env.MUSU_P2P_RELAY_URL = "wss://relay.musu.pro/api/v1/relay/connect";
  process.env.MUSU_P2P_RELAY_ENTITLEMENT = "pro";
}

function connectReq(
  method: "GET" | "POST",
  token: string | null = "test-token",
  body?: unknown
): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return new NextRequest("http://localhost/api/v1/relay/connect?session_id=s&node_id=n", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function seedLease(token = "test-token") {
  const lease = createRelayLease({
    owner_key: p2pControlOwnerKey(token),
    session_id: "session-1",
    source_node_id: "source-a",
    target_node_id: "target-b",
    requested_capability: "remote_command",
    attempted_route_kinds: ["lan", "direct_quic"],
    failure_class: "connect_timeout",
    relay_url: "wss://relay.musu.pro/api/v1/relay/connect",
  });
  await appendRelayLease(lease);
  return lease;
}

test("requires P2P control auth before reporting relay connect preflight status", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { GET } = await loadModule("get-auth-required");
    const res = await GET(connectReq("GET", null));
    assert.equal(res.status, 401);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      accepted_auth_modes: string[];
    };
    assert.equal(body.ok, false);
    assert.equal(body.error, "unauthorized");
    assert.deepEqual(body.accepted_auth_modes, ["static_bearer_token"]);
  });
});

test("reports relay connect preflight without claiming payload transport", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { GET } = await loadModule("get-preflight");
    const res = await GET(connectReq("GET"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      schema: string;
      ok: boolean;
      method: string;
      relay_connect_path: string;
      relay_transport_kind: string;
      release_grade_relay_transport_kind: string;
      release_grade_transport_required: string;
      relay_transport_wired: boolean;
      relay_connect_endpoint_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_default_data_path: boolean;
      payload_transit_requires_lease: boolean;
      relay_control_plane_wired: boolean;
      owner_scoped: boolean;
      relay_lease_store_configured: boolean;
      relay_lease_store_backend: string;
      relay_lease_store_release_grade: boolean;
      blockers: string[];
    };

    assert.equal(body.schema, "musu.relay_connect.v1");
    assert.equal(body.ok, false);
    assert.equal(body.method, "GET");
    assert.equal(body.relay_connect_path, "/api/v1/relay/connect");
    assert.equal(body.relay_transport_kind, "websocket_tunnel");
    assert.equal(body.release_grade_relay_transport_kind, "quic_relay_tunnel");
    assert.equal(body.release_grade_transport_required, "quic_tls_1_3");
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_connect_endpoint_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.payload_transit_requires_lease, true);
    assert.equal(body.relay_control_plane_wired, true);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_lease_store_configured, true);
    assert.equal(body.relay_lease_store_backend, "file");
    assert.equal(body.relay_lease_store_release_grade, false);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.doesNotMatch(body.blockers.join(","), /relay_disabled/);
    assert.doesNotMatch(body.blockers.join(","), /relay_url_not_configured/);
  });
});

test("verifies relay lease but rejects payload transit while payload endpoint is unwired", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const lease = await seedLease();
    const { POST } = await loadModule("post-lease-preflight");
    const res = await POST(connectReq("POST", "test-token", {
      lease_id: lease.lease_id,
      session_id: lease.session_id,
      source_node_id: lease.source_node_id,
      target_node_id: lease.target_node_id,
    }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      ok: boolean;
      method: string;
      error: string;
      relay_connect_accepted: boolean;
      lease_verified: boolean;
      relay_connect_endpoint_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_transport_wired: boolean;
      relay_control_plane_wired: boolean;
      owner_scoped: boolean;
      blockers: string[];
      relay_transport_proof?: unknown;
    };

    assert.equal(body.ok, false);
    assert.equal(body.method, "POST");
    assert.equal(body.error, "relay_payload_endpoint_not_wired");
    assert.equal(body.relay_connect_accepted, false);
    assert.equal(body.lease_verified, true);
    assert.equal(body.relay_connect_endpoint_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_control_plane_wired, true);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_transport_proof, undefined);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
  });
});
