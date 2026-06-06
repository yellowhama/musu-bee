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
  const tempDir = await mkdtemp(join(tmpdir(), "musu-relay-payload-preflight-"));
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

function payloadReq(
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
  return new NextRequest("http://localhost/api/v1/relay/payload", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawPayloadReq(method: "POST", token: string | null, body: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/relay/payload", {
    method,
    headers,
    body,
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

test("requires P2P control auth before reporting release relay payload preflight", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { GET } = await loadModule("get-auth-required");
    const res = await GET(payloadReq("GET", null));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "unauthorized");
  });
});

test("reports release payload preflight without treating the queue as release transport", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { GET } = await loadModule("get-preflight");
    const res = await GET(payloadReq("GET"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      schema: string;
      ok: boolean;
      method: string;
      release_payload_endpoint_path: string;
      release_payload_endpoint_preflight_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_transport_wired: boolean;
      relay_transport_kind: string;
      release_grade_relay_transport_kind: string;
      release_grade_transport_required: string;
      relay_default_data_path: boolean;
      payload_transit_requires_lease: boolean;
      release_grade: boolean;
      blockers: string[];
    };

    assert.equal(body.schema, "musu.relay_payload_preflight.v1");
    assert.equal(body.ok, false);
    assert.equal(body.method, "GET");
    assert.equal(body.release_payload_endpoint_path, "/api/v1/relay/payload");
    assert.equal(body.release_payload_endpoint_preflight_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_transport_kind, "websocket_tunnel");
    assert.equal(body.release_grade_relay_transport_kind, "quic_relay_tunnel");
    assert.equal(body.release_grade_transport_required, "quic_tls_1_3");
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.payload_transit_requires_lease, true);
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
  });
});

test("returns release payload preflight status fields for invalid JSON", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { POST } = await loadModule("post-invalid-json");
    const res = await POST(rawPayloadReq("POST", "test-token", "{not-json"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      schema: string;
      ok: boolean;
      method: string;
      error: string;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      lease_verified: boolean;
      release_payload_endpoint_preflight_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_transport_wired: boolean;
      blockers: string[];
    };

    assert.equal(body.schema, "musu.relay_payload_preflight.v1");
    assert.equal(body.ok, false);
    assert.equal(body.method, "POST");
    assert.equal(body.error, "invalid_json");
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.lease_verified, false);
    assert.equal(body.release_payload_endpoint_preflight_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
  });
});

test("rejects release payload bytes before lease lookup while endpoint is preflight-only", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { POST } = await loadModule("post-payload-bytes-rejected");
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_preflight_request.v1",
      lease_id: "lease-1",
      session_id: "session-1",
      source_node_id: "source-a",
      target_node_id: "target-b",
      tunnel_id: "release-tunnel-preview",
      payload_kind: "remote_command",
      payload_sha256: "a".repeat(64),
      payload_base64: "c2hvdWxkLW5vdC1iZS1hY2NlcHRlZA==",
    }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      forbidden_fields: string[];
      release_payload_endpoint_preflight_wired: boolean;
      release_grade: boolean;
    };

    assert.equal(body.ok, false);
    assert.equal(body.error, "release_payload_bytes_not_accepted");
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.deepEqual(body.forbidden_fields, ["payload_base64"]);
    assert.equal(body.release_payload_endpoint_preflight_wired, true);
    assert.equal(body.release_grade, false);
  });
});

test("rejects unknown release payload preflight fields", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { POST } = await loadModule("post-unknown-field-rejected");
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_preflight_request.v1",
      lease_id: "lease-1",
      session_id: "session-1",
      source_node_id: "source-a",
      target_node_id: "target-b",
      unexpected_release_field: "must-not-pass-through",
    }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      schema: string;
      ok: boolean;
      error: string;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      lease_verified: boolean;
      release_payload_endpoint_preflight_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      issues: Array<{ path: string; message: string }>;
    };

    assert.equal(body.schema, "musu.relay_payload_preflight.v1");
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_relay_payload_preflight_request");
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.lease_verified, false);
    assert.equal(body.release_payload_endpoint_preflight_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(
      body.issues.some((issue) => issue.message.includes("unexpected_release_field")),
      true
    );
  });
});

test("verifies relay lease metadata but rejects release payload transport while endpoint is unwired", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const lease = await seedLease();
    const { POST } = await loadModule("post-lease-metadata-preflight");
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_preflight_request.v1",
      lease_id: lease.lease_id,
      session_id: lease.session_id,
      source_node_id: lease.source_node_id,
      target_node_id: lease.target_node_id,
      tunnel_id: "release-tunnel-preview",
      payload_kind: "remote_command",
      payload_sha256: "a".repeat(64),
    }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      ok: boolean;
      method: string;
      error: string;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      lease_verified: boolean;
      release_payload_endpoint_preflight_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_transport_wired: boolean;
      release_grade: boolean;
      blockers: string[];
      delivery_proof?: unknown;
      relay_transport_proof?: unknown;
    };

    assert.equal(body.ok, false);
    assert.equal(body.method, "POST");
    assert.equal(body.error, "relay_payload_endpoint_not_wired");
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.lease_verified, true);
    assert.equal(body.release_payload_endpoint_preflight_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.release_grade, false);
    assert.equal(body.delivery_proof, undefined);
    assert.equal(body.relay_transport_proof, undefined);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
  });
});
