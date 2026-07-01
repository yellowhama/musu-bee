import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";
import { appendRelayLease, createRelayLease } from "@/lib/p2pRelayLeaseStore";
import { queryRelayTransportProofs } from "@/lib/p2pRelayTransportProofStore";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_P2P_RELAY_ENABLED",
  "MUSU_P2P_RELAY_ENTITLEMENT",
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_WIRED",
  "MUSU_P2P_RELAY_URL",
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

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
  process.env.MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH = join(tempDir, "transport-proofs.json");
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

async function seedLease(
  token = "test-token",
  overrides: {
    relay_url?: string;
    attempted_route_kinds?: Array<"lan" | "tailscale" | "direct_quic" | "relay">;
    failure_class?: string | null;
  } = {}
) {
  const lease = createRelayLease({
    owner_key: p2pControlOwnerKey(token),
    session_id: "session-1",
    source_node_id: "source-a",
    target_node_id: "target-b",
    requested_capability: "remote_command",
    attempted_route_kinds: overrides.attempted_route_kinds ?? ["lan", "direct_quic"],
    failure_class: overrides.failure_class ?? "connect_timeout",
    relay_url: overrides.relay_url ?? "wss://relay.musu.pro/api/v1/relay/connect",
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
    assert.equal(body.relay_payload_endpoint_wired, true);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_transport_kind, "quic_relay_tunnel");
    assert.equal(body.release_grade_relay_transport_kind, "quic_relay_tunnel");
    assert.equal(body.release_grade_transport_required, "quic_tls_1_3");
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.payload_transit_requires_lease, true);
    assert.equal(body.release_grade, false);
    assert.doesNotMatch(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /relay_tunnel_runtime_not_implemented/);
    assert.doesNotMatch(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
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
    assert.equal(body.relay_payload_endpoint_wired, true);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.doesNotMatch(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /relay_tunnel_runtime_not_implemented/);
  });
});

test("rejects release payload bytes before lease lookup while endpoint accepts proof metadata only", async () => {
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
      payload_kind: "forwarded_task_envelope",
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

test("requires release tunnel payload metadata before lease lookup", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { POST } = await loadModule("post-release-metadata-required");
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_preflight_request.v1",
      lease_id: "lease-1",
      session_id: "session-1",
      source_node_id: "source-a",
      target_node_id: "target-b",
    }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      lease_verified: boolean;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      issues: Array<{ path: string; message: string }>;
    };

    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_relay_payload_preflight_request");
    assert.equal(body.lease_verified, false);
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.issues.some((issue) => issue.path === "tunnel_id"), true);
    assert.equal(body.issues.some((issue) => issue.path === "payload_kind"), true);
    assert.equal(body.issues.some((issue) => issue.path === "payload_sha256"), true);
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
      tunnel_id: "release-tunnel-preview",
      payload_kind: "forwarded_task_envelope",
      payload_sha256: "a".repeat(64),
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
    assert.equal(body.relay_payload_endpoint_wired, true);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(
      body.issues.some((issue) => issue.message.includes("unexpected_release_field")),
      true
    );
  });
});

test("verifies relay lease metadata but rejects release payload transport while runtime is unwired", async () => {
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
      payload_kind: "forwarded_task_envelope",
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
      release_payload_metadata: {
        tunnel_id: string;
        payload_kind: string;
        payload_sha256: string;
      };
      blockers: string[];
      delivery_proof?: unknown;
      relay_transport_proof?: unknown;
    };

    assert.equal(body.ok, false);
    assert.equal(body.method, "POST");
    assert.equal(body.error, "relay_transport_not_wired");
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.lease_verified, true);
    assert.equal(body.release_payload_endpoint_preflight_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, true);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.release_grade, false);
    assert.deepEqual(body.release_payload_metadata, {
      tunnel_id: "release-tunnel-preview",
      payload_kind: "forwarded_task_envelope",
      payload_sha256: "a".repeat(64),
    });
    assert.equal(body.delivery_proof, undefined);
    assert.equal(body.relay_transport_proof, undefined);
    assert.doesNotMatch(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
  });
});

test("rejects release payload preflight when bearer token is bound to another source node", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    process.env.MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS = `sha256:${sha256("test-token")}=source-a`;
    const { POST } = await loadModule("post-source-node-auth-binding");
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_preflight_request.v1",
      lease_id: "lease-1",
      session_id: "session-1",
      source_node_id: "source-z",
      target_node_id: "target-b",
      tunnel_id: "release-tunnel-preview",
      payload_kind: "forwarded_task_envelope",
      payload_sha256: "a".repeat(64),
    }));
    assert.equal(res.status, 403);
    const body = (await res.json()) as {
      ok: boolean;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      lease_verified: boolean;
      source_node_auth_bound: boolean;
      error: string;
      bound_source_node_id: string;
      declared_source_node_id: string;
    };
    assert.equal(body.ok, false);
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.lease_verified, false);
    assert.equal(body.source_node_auth_bound, true);
    assert.equal(body.error, "source_node_id_auth_mismatch");
    assert.equal(body.bound_source_node_id, "source-a");
    assert.equal(body.declared_source_node_id, "source-z");
  });
});

test("rejects lease-bound release payload proof metadata while release tunnel runtime is unwired", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const lease = await seedLease();
    const { POST } = await loadModule("post-release-proof");
    const payloadSha = "c".repeat(64);
    const openedAt = "2026-06-28T01:00:00.000Z";
    const closedAt = "2026-06-28T01:00:01.000Z";
    const deliveredAt = "2026-06-28T01:00:02.000Z";
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_release_request.v1",
      lease_id: lease.lease_id,
      session_id: lease.session_id,
      source_node_id: lease.source_node_id,
      target_node_id: lease.target_node_id,
      tunnel_id: "release-tunnel-1",
      payload_kind: "forwarded_task_envelope",
      payload_sha256: payloadSha,
      relay_transport_proof: {
        schema: "musu.relay_transport_proof.v1",
        session_id: lease.session_id,
        lease_id: lease.lease_id,
        source_node_id: lease.source_node_id,
        target_node_id: lease.target_node_id,
        transport_kind: "quic_relay_tunnel",
        relay_url: lease.relay_url,
        tunnel_id: "release-tunnel-1",
        handshake_ms: 17,
        payload_bytes_transited: 512,
        payload_transited_musu_infra: true,
        peer_identity_verified: true,
        peer_identity_method: "quic_tls_cert_fingerprint",
        peer_public_key: "sha256:" + "d".repeat(64),
        encryption: "quic_tls_1_3",
        transport_verified_by: "musu_quic_tls_transport",
        opened_at: openedAt,
        closed_at: closedAt,
      },
      delivery_proof: {
        schema: "musu.relay_payload_delivery_proof.v1",
        payload_id: "release-payload-1",
        session_id: lease.session_id,
        lease_id: lease.lease_id,
        source_node_id: lease.source_node_id,
        target_node_id: lease.target_node_id,
        relay_url: lease.relay_url,
        tunnel_id: "release-tunnel-1",
        payload_kind: "forwarded_task_envelope",
        transport_kind: "quic_relay_tunnel",
        relay_default_data_path: false,
        release_grade: true,
        payload_sha256: payloadSha,
        payload_bytes: 512,
        claimed_by: lease.target_node_id,
        claimed_at: closedAt,
        created_at: openedAt,
        delivered_at: deliveredAt,
      },
    }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      lease_verified: boolean;
      release_payload_lease_ready: boolean;
      release_payload_proof_ready: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_tunnel_runtime_implemented: boolean;
      relay_transport_wired: boolean;
      relay_transport_proof_store_release_grade: boolean;
      proof_blockers: string[];
      blockers: string[];
      release_payload_metadata: {
        payload_sha256: string;
        payload_bytes_transited: number;
      };
      relay_transport_proof?: unknown;
      delivery_proof?: unknown;
    };

    assert.equal(body.ok, false);
    assert.equal(body.error, "release_relay_tunnel_runtime_not_implemented");
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.equal(body.lease_verified, true);
    assert.equal(body.release_payload_lease_ready, true);
    assert.equal(body.release_payload_proof_ready, true);
    assert.equal(body.relay_payload_endpoint_wired, true);
    assert.equal(body.relay_tunnel_runtime_implemented, false);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_transport_proof_store_release_grade, false);
    assert.match(body.blockers.join(","), /relay_tunnel_runtime_not_implemented/);
    assert.match(body.blockers.join(","), /release_relay_tunnel_runtime_not_implemented/);
    assert.deepEqual(body.proof_blockers, ["relay_transport_proof_store_backend_not_release_grade"]);
    assert.equal(body.release_payload_metadata.payload_sha256, payloadSha);
    assert.equal(body.release_payload_metadata.payload_bytes_transited, 512);
    assert.equal(body.relay_transport_proof, undefined);
    assert.equal(body.delivery_proof, undefined);

    const proofs = await queryRelayTransportProofs({
      owner_key: p2pControlOwnerKey("test-token"),
      lease_id: lease.lease_id,
    });
    assert.equal(proofs.length, 0);
  });
});

test("rejects release payload preflight when relay lease no longer matches configured relay URL", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const lease = await seedLease("test-token", {
      relay_url: "wss://stale-relay.musu.pro/api/v1/relay/connect",
    });
    const { POST } = await loadModule("post-stale-lease-relay-url");
    const res = await POST(payloadReq("POST", "test-token", {
      schema: "musu.relay_payload_preflight_request.v1",
      lease_id: lease.lease_id,
      session_id: lease.session_id,
      source_node_id: lease.source_node_id,
      target_node_id: lease.target_node_id,
      tunnel_id: "release-tunnel-preview",
      payload_kind: "forwarded_task_envelope",
      payload_sha256: "b".repeat(64),
    }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      lease_verified: boolean;
      release_payload_lease_ready: boolean;
      release_payload_accepted: boolean;
      payload_stored: boolean;
      payload_transported: boolean;
      lease_blockers: string[];
      blockers: string[];
      lease: {
        relay_url: string;
        attempted_route_kinds: string[];
        payload_transited_musu_infra: boolean;
        default_data_path: boolean;
      };
    };

    assert.equal(body.ok, false);
    assert.equal(body.error, "release_relay_lease_not_payload_ready");
    assert.equal(body.lease_verified, true);
    assert.equal(body.release_payload_lease_ready, false);
    assert.equal(body.release_payload_accepted, false);
    assert.equal(body.payload_stored, false);
    assert.equal(body.payload_transported, false);
    assert.deepEqual(body.lease_blockers, ["release_relay_lease_relay_url_mismatch"]);
    assert.match(body.blockers.join(","), /release_relay_lease_relay_url_mismatch/);
    assert.equal(body.lease.relay_url, "wss://stale-relay.musu.pro/api/v1/relay/connect");
    assert.deepEqual(body.lease.attempted_route_kinds, ["lan", "direct_quic"]);
    assert.equal(body.lease.payload_transited_musu_infra, true);
    assert.equal(body.lease.default_data_path, false);
  });
});
