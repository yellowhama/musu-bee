import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";
import {
  appendRelayLease,
  createRelayLease,
  type StoredP2pRelayLease,
} from "@/lib/p2pRelayLeaseStore";
import {
  appendRelayPayload,
  claimRelayPayloads,
  createRelayPayload,
  markRelayPayloadDelivered,
  type StoredP2pRelayPayload,
} from "@/lib/p2pRelayPayloadStore";
import {
  appendRelayTransportProof,
  createRelayTransportProof,
} from "@/lib/p2pRelayTransportProofStore";
import {
  appendRouteEvidenceRecord,
  type RouteEvidencePayload,
} from "@/lib/routeEvidenceStore";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_P2P_RELAY_ENABLED",
  "MUSU_P2P_RELAY_ENTITLEMENT",
  "MUSU_P2P_RELAY_LEASE_MAX_RECORDS",
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_LEASE_TTL_SEC",
  "MUSU_P2P_RELAY_PAYLOAD_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_MAX_RECORDS",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_TTL_SEC",
  "MUSU_P2P_RELAY_TRANSPORT_WIRED",
  "MUSU_P2P_RELAY_URL",
  "MUSU_ROUTE_EVIDENCE_MAX_RECORDS",
  "MUSU_ROUTE_EVIDENCE_STORE_PATH",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

const hardenedEvidence = {
  schema: "musu.route_evidence.v1",
  version: "1.15.0-rc.1",
  source_node_id: "pc-a",
  target_node_id: "pc-b",
  session_id: "rv_123",
  route_kind: "direct_quic",
  candidate_addr: "203.0.113.10:8070",
  handshake_ms: 42,
  total_attempt_ms: 311,
  peer_identity_verified: true,
  peer_identity_method: "quic_tls_cert_fingerprint",
  peer_public_key: "sha256:test",
  encryption: "quic_tls_1_3",
  transport_verified_by: "musu_quic_tls_transport",
  payload_transited_musu_infra: false,
  result: "success",
  recorded_at: "2026-06-01T01:00:00Z",
} as const satisfies RouteEvidencePayload;

function relayTransportProof(leaseId: string, overrides: Record<string, unknown> = {}) {
  return {
    schema: "musu.relay_transport_proof.v1",
    session_id: hardenedEvidence.session_id,
    lease_id: leaseId,
    transport_kind: "quic_relay_tunnel",
    relay_url: "wss://relay.musu.pro/connect",
    tunnel_id: "relay-tunnel-test",
    handshake_ms: 23,
    payload_bytes_transited: 128,
    payload_transited_musu_infra: true,
    encryption: "quic_tls_1_3",
    transport_verified_by: "musu_quic_tls_transport",
    opened_at: "2026-06-01T01:00:01Z",
    closed_at: "2026-06-01T01:00:02Z",
    ...overrides,
  };
}

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

function postReq(body: unknown, token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/route-evidence", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getReq(search = "", token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest(`http://localhost/api/v1/p2p/route-evidence${search}`, {
    method: "GET",
    headers,
  });
}

async function withRouteEvidenceToken(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-route-evidence-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_ROUTE_EVIDENCE_STORE_PATH = join(tempDir, "route-evidence.json");
  process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH = join(tempDir, "relay-leases.json");
  process.env.MUSU_P2P_RELAY_PAYLOAD_STORE_PATH = join(tempDir, "relay-payloads.json");
  process.env.MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH = join(
    tempDir,
    "relay-transport-proofs.json"
  );
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

async function seedRelayLeaseForEvidence(): Promise<StoredP2pRelayLease> {
  const attemptedRouteKinds: StoredP2pRelayLease["attempted_route_kinds"] = ["lan", "tailscale"];
  const lease = createRelayLease({
    owner_key: p2pControlOwnerKey("test-token"),
    session_id: hardenedEvidence.session_id,
    source_node_id: hardenedEvidence.source_node_id,
    target_node_id: hardenedEvidence.target_node_id,
    requested_capability: "remote_command",
    attempted_route_kinds: attemptedRouteKinds,
    failure_class: "connect_timeout",
    relay_url: "wss://relay.musu.pro/connect",
  });
  await appendRelayLease(lease);
  return lease;
}

async function seedRelayTransportProofForEvidence(lease: StoredP2pRelayLease): Promise<void> {
  await appendRelayTransportProof(createRelayTransportProof({
    owner_key: p2pControlOwnerKey("test-token"),
    session_id: hardenedEvidence.session_id,
    lease_id: lease.lease_id,
    source_node_id: hardenedEvidence.source_node_id,
    target_node_id: hardenedEvidence.target_node_id,
    relay_url: "wss://relay.musu.pro/connect",
    tunnel_id: "relay-tunnel-test",
    transport_kind: "quic_relay_tunnel",
    handshake_ms: 23,
    payload_bytes_transited: 128,
    payload_transited_musu_infra: true,
    encryption: "quic_tls_1_3",
    transport_verified_by: "musu_quic_tls_transport",
    opened_at: "2026-06-01T01:00:01Z",
    closed_at: "2026-06-01T01:00:02Z",
  }));
}

async function seedDeliveredRelayPayloadForEvidence(
  lease: StoredP2pRelayLease
): Promise<StoredP2pRelayPayload> {
  const payloadBytes = Buffer.from(JSON.stringify({ task: "relay-route-proof", n: 1 }), "utf8");
  const payload = createRelayPayload({
    owner_key: p2pControlOwnerKey("test-token"),
    session_id: hardenedEvidence.session_id,
    lease_id: lease.lease_id,
    source_node_id: hardenedEvidence.source_node_id,
    target_node_id: hardenedEvidence.target_node_id,
    relay_url: "wss://relay.musu.pro/connect",
    tunnel_id: "relay-tunnel-test",
    payload_kind: "forwarded_task_envelope",
    payload_base64: payloadBytes.toString("base64"),
  });
  await appendRelayPayload(payload);
  const claimed = await claimRelayPayloads({
    owner_key: p2pControlOwnerKey("test-token"),
    target_node_id: hardenedEvidence.target_node_id,
    claimant_node_id: hardenedEvidence.target_node_id,
    session_id: hardenedEvidence.session_id,
    lease_id: lease.lease_id,
    source_node_id: hardenedEvidence.source_node_id,
    tunnel_id: "relay-tunnel-test",
    limit: 1,
    status: "queued",
  });
  assert.equal(claimed.length, 1);
  const delivered = await markRelayPayloadDelivered({
    owner_key: p2pControlOwnerKey("test-token"),
    payload_id: claimed[0]!.payload_id,
    target_node_id: hardenedEvidence.target_node_id,
  });
  assert.ok(delivered);
  assert.equal(delivered.status, "delivered");
  assert.equal(typeof delivered.delivered_at, "string");
  return delivered;
}

function relayPayloadDeliveryProof(payload: StoredP2pRelayPayload) {
  return {
    schema: "musu.relay_payload_delivery_proof.v1",
    payload_id: payload.payload_id,
    session_id: payload.session_id,
    lease_id: payload.lease_id,
    source_node_id: payload.source_node_id,
    target_node_id: payload.target_node_id,
    tunnel_id: payload.tunnel_id,
    payload_sha256: payload.payload_sha256,
    payload_bytes: payload.payload_bytes,
    delivered_at: payload.delivered_at ?? "",
  };
}

function relayRouteEvidenceForLease(
  lease: StoredP2pRelayLease,
  overrides: Record<string, unknown> = {}
) {
  return {
    ...hardenedEvidence,
    route_kind: "relay",
    candidate_addr: "relay.musu.pro:443",
    payload_transited_musu_infra: true,
    relay_fallback: {
      direct_path_failed: true,
      lease_requested: true,
      status: "issued",
      lease_issued: true,
      attempted_route_kinds: ["lan", "tailscale"],
      requested_capability: "remote_command",
      policy: "connect_pro_fallback_only",
      blockers: [],
      lease_id: lease.lease_id,
      payload_transport_attempted: true,
      payload_transport_proven: true,
    },
    relay_transport_proof: relayTransportProof(lease.lease_id),
    ...overrides,
  };
}

test("accepts hardened release-grade route evidence", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("hardened");
    const res = await POST(postReq(hardenedEvidence));
    assert.equal(res.status, 202);

    const body = (await res.json()) as {
      ok: boolean;
      stored: boolean;
      evidence_id: string;
      owner_scoped: boolean;
      release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.stored, true);
    assert.equal(body.owner_scoped, true);
    assert.match(body.evidence_id, /^route-evidence-/);
    assert.equal(body.release_grade, true);
    assert.deepEqual(body.blockers, []);
  });
});

test("keeps relay route evidence non release grade without relay lease proof", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-missing-lease-proof");
    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_route_missing_lease_proof/);
  });
});

test("keeps issued-looking relay route evidence non release grade without stored lease", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-unbacked-lease-proof");
    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: "lease_test_123",
      },
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_route_lease_not_found/);
  });
});

test("keeps stored-lease relay route evidence non release grade without transport proof", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-backed-lease-without-transport-proof");
    const lease = await seedRelayLeaseForEvidence();

    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: lease.lease_id,
      },
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_route_missing_transport_proof/);
  });
});

test("keeps transport-proof relay route evidence non release grade until payload endpoint is wired", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("relay-route-backed-transport-proof-endpoint-blocked");
    const lease = await seedRelayLeaseForEvidence();

    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: lease.lease_id,
      },
      relay_transport_proof: relayTransportProof(lease.lease_id),
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_route_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_route_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /relay_route_transport_proof_not_stored/);

    const getRes = await GET(getReq("?route_kind=relay&release_grade=true&limit=10"));
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as {
      count: number;
      records: Array<{
        evidence: {
          relay_transport_proof?: {
            schema: string;
            lease_id: string;
          };
        };
      }>;
    };
    assert.equal(getBody.count, 0);
    assert.equal(getBody.records.length, 0);
  });
});

test("does not accept inline relay transport proof unless it is backed by the proof store", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-inline-transport-proof-store-bound");
    const lease = await seedRelayLeaseForEvidence();
    await seedRelayTransportProofForEvidence(lease);

    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: lease.lease_id,
      },
      relay_transport_proof: relayTransportProof(lease.lease_id),
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.doesNotMatch(body.blockers.join(","), /relay_route_transport_proof_not_stored/);
    assert.match(
      body.blockers.join(","),
      /relay_route_transport_proof_store_backend_not_release_grade/
    );
    assert.match(body.blockers.join(","), /relay_route_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_route_payload_endpoint_not_wired/);
  });
});

test("requires payload delivery proof when relay fallback claims payload transport proven", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-payload-proof-missing");
    const lease = await seedRelayLeaseForEvidence();
    await seedRelayTransportProofForEvidence(lease);

    const res = await POST(postReq(relayRouteEvidenceForLease(lease)));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.doesNotMatch(body.blockers.join(","), /relay_fallback_payload_transport_not_proven/);
    assert.match(
      body.blockers.join(","),
      /relay_fallback_payload_delivery_proof_missing/
    );
  });
});

test("keeps payload delivery proof non release grade unless it is backed by the payload store", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-payload-proof-not-stored");
    const lease = await seedRelayLeaseForEvidence();
    await seedRelayTransportProofForEvidence(lease);

    const res = await POST(postReq(relayRouteEvidenceForLease(lease, {
      relay_payload_delivery_proof: {
        schema: "musu.relay_payload_delivery_proof.v1",
        payload_id: "relay-payload-missing",
        session_id: hardenedEvidence.session_id,
        lease_id: lease.lease_id,
        source_node_id: hardenedEvidence.source_node_id,
        target_node_id: hardenedEvidence.target_node_id,
        tunnel_id: "relay-tunnel-test",
        payload_sha256: "sha256:missing",
        payload_bytes: 128,
        delivered_at: "2026-06-01T01:00:02Z",
      },
    })));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(
      body.blockers.join(","),
      /relay_fallback_payload_delivery_proof_not_stored/
    );
  });
});

test("accepts stored delivered relay payload proof while keeping file-store proof non release grade", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-payload-proof-stored");
    const lease = await seedRelayLeaseForEvidence();
    await seedRelayTransportProofForEvidence(lease);
    const deliveredPayload = await seedDeliveredRelayPayloadForEvidence(lease);

    const res = await POST(postReq(relayRouteEvidenceForLease(lease, {
      relay_payload_delivery_proof: relayPayloadDeliveryProof(deliveredPayload),
    })));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    const blockers = body.blockers.join(",");
    assert.equal(body.release_grade, false);
    assert.doesNotMatch(blockers, /relay_fallback_payload_delivery_proof_missing/);
    assert.doesNotMatch(blockers, /relay_fallback_payload_delivery_proof_not_stored/);
    assert.doesNotMatch(blockers, /relay_fallback_payload_delivery_proof_sha256_mismatch/);
    assert.match(blockers, /relay_fallback_payload_store_backend_not_release_grade/);
    assert.match(blockers, /relay_route_payload_endpoint_not_wired/);
  });
});

test("keeps target-drain preview relay evidence non release grade even with delivery proof", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-target-drain-preview");
    const lease = await seedRelayLeaseForEvidence();
    const deliveredPayload = await seedDeliveredRelayPayloadForEvidence(lease);

    const res = await POST(postReq(relayRouteEvidenceForLease(lease, {
      encryption: "relay_payload_queue_preview",
      transport_verified_by: "musu_relay_payload_drain_preview",
      relay_transport_proof: undefined,
      relay_payload_delivery_proof: relayPayloadDeliveryProof(deliveredPayload),
    })));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    const blockers = body.blockers.join(",");
    assert.equal(body.release_grade, false);
    assert.doesNotMatch(blockers, /relay_fallback_payload_delivery_proof_missing/);
    assert.doesNotMatch(blockers, /relay_fallback_payload_delivery_proof_not_stored/);
    assert.match(blockers, /transport_not_release_grade_quic_tls/);
    assert.match(blockers, /relay_route_missing_transport_proof/);
    assert.match(blockers, /relay_route_transport_not_wired/);
    assert.match(blockers, /relay_route_payload_endpoint_not_wired/);
  });
});

test("keeps relay transport proof non release grade when it is not bound to the stored lease URL", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-transport-proof-url-mismatch");
    const lease = await seedRelayLeaseForEvidence();

    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: lease.lease_id,
      },
      relay_transport_proof: relayTransportProof(lease.lease_id, {
        relay_url: "wss://unexpected-relay.example/connect",
      }),
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_route_transport_proof_relay_url_mismatch/);
  });
});

test("keeps relay transport proof non release grade when kind or timestamps are invalid", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("relay-route-transport-proof-invalid-kind-time");
    const lease = await seedRelayLeaseForEvidence();

    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: lease.lease_id,
      },
      relay_transport_proof: relayTransportProof(lease.lease_id, {
        transport_kind: "websocket_tunnel",
        opened_at: "2026-06-01T01:00:02Z",
        closed_at: "2026-06-01T01:00:01Z",
      }),
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_route_transport_proof_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_route_transport_proof_timestamp_order_invalid/);
  });
});

test("accepts legacy debug evidence but marks it non release grade", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("legacy");
    const res = await POST(postReq({
      ...hardenedEvidence,
      route_kind: "tailscale",
      peer_identity_verified: false,
      encryption: "none_http_bearer",
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /peer_identity_unverified/);
    assert.match(body.blockers.join(","), /legacy_or_missing_encryption/);
  });
});

test("stores relay fallback evidence after failed direct route", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("relay-fallback");
    const evidence = {
      ...hardenedEvidence,
      route_kind: "tailscale",
      peer_identity_verified: false,
      encryption: "none_http_bearer",
      result: "failed",
      failure_class: "forward_failed_after_retries",
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "denied",
        lease_issued: false,
        attempted_route_kinds: ["tailscale", "lan"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: ["relay_transport_not_wired"],
        failure_class: "relay_lease_denied",
      },
    };

    const res = await POST(postReq(evidence));
    assert.equal(res.status, 202);
    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /route_attempt_failed/);

    const getRes = await GET(getReq("?limit=1"));
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as {
      records: Array<{
        evidence: {
          relay_fallback?: {
            status: string;
            lease_requested: boolean;
            attempted_route_kinds: string[];
            requested_capability?: string;
            blockers?: string[];
          };
        };
      }>;
    };
    assert.equal(getBody.records[0]?.evidence.relay_fallback?.status, "denied");
    assert.equal(getBody.records[0]?.evidence.relay_fallback?.lease_requested, true);
    assert.deepEqual(
      getBody.records[0]?.evidence.relay_fallback?.attempted_route_kinds,
      ["tailscale", "lan"]
    );
    assert.equal(
      getBody.records[0]?.evidence.relay_fallback?.requested_capability,
      "remote_command"
    );
    assert.deepEqual(getBody.records[0]?.evidence.relay_fallback?.blockers, [
      "relay_transport_not_wired",
    ]);
  });
});

test("keeps issued relay fallback non release grade until payload transport is proven", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("relay-fallback-issued-no-payload-transport");
    const evidence = {
      ...hardenedEvidence,
      route_kind: "tailscale",
      peer_identity_verified: false,
      encryption: "none_http_bearer",
      result: "failed",
      failure_class: "forward_failed_after_retries",
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["tailscale", "lan"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: "relay-lease-test",
        payload_transport_attempted: false,
        payload_transport_proven: false,
        payload_transport_failure_class: "relay_payload_transport_not_implemented",
      },
    };

    const res = await POST(postReq(evidence));
    assert.equal(res.status, 202);
    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_fallback_payload_transport_not_attempted/);
    assert.match(body.blockers.join(","), /relay_fallback_payload_transport_not_proven/);
    assert.match(body.blockers.join(","), /relay_fallback_payload_transport_not_implemented/);

    const getRes = await GET(getReq("?limit=1"));
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as {
      records: Array<{
        evidence: {
          relay_fallback?: {
            payload_transport_attempted?: boolean;
            payload_transport_proven?: boolean;
            payload_transport_failure_class?: string;
          };
        };
      }>;
    };
    assert.equal(getBody.records[0]?.evidence.relay_fallback?.payload_transport_attempted, false);
    assert.equal(getBody.records[0]?.evidence.relay_fallback?.payload_transport_proven, false);
    assert.equal(
      getBody.records[0]?.evidence.relay_fallback?.payload_transport_failure_class,
      "relay_payload_transport_not_implemented"
    );
  });
});

test("keeps queued relay fallback non release grade until target polling proves transport", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("relay-fallback-queued-payload-preview");
    const evidence = {
      ...hardenedEvidence,
      route_kind: "tailscale",
      peer_identity_verified: false,
      encryption: "none_http_bearer",
      result: "failed",
      failure_class: "forward_failed_after_retries",
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["tailscale", "lan"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: "relay-lease-test",
        payload_transport_attempted: true,
        payload_transport_proven: false,
        payload_transport_failure_class: "relay_target_polling_not_implemented",
      },
    };

    const res = await POST(postReq(evidence));
    assert.equal(res.status, 202);
    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.doesNotMatch(body.blockers.join(","), /relay_fallback_payload_transport_not_attempted/);
    assert.doesNotMatch(body.blockers.join(","), /relay_fallback_payload_transport_not_implemented/);
    assert.match(body.blockers.join(","), /relay_fallback_payload_transport_not_proven/);

    const getRes = await GET(getReq("?limit=1"));
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as {
      records: Array<{
        evidence: {
          relay_fallback?: {
            payload_transport_attempted?: boolean;
            payload_transport_proven?: boolean;
            payload_transport_failure_class?: string;
          };
        };
      }>;
    };
    assert.equal(getBody.records[0]?.evidence.relay_fallback?.payload_transport_attempted, true);
    assert.equal(getBody.records[0]?.evidence.relay_fallback?.payload_transport_proven, false);
    assert.equal(
      getBody.records[0]?.evidence.relay_fallback?.payload_transport_failure_class,
      "relay_target_polling_not_implemented"
    );
  });
});

test("requires identity proof material when evidence claims peer verification", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("missing-identity-proof");
    const res = await POST(postReq({
      ...hardenedEvidence,
      peer_identity_method: undefined,
      peer_public_key: undefined,
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /missing_peer_identity_proof/);
  });
});

test("keeps HTTPS fingerprint-pinned bridge evidence non release grade until QUIC/TLS transport", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("non-quic-tls-proof");
    const res = await POST(postReq({
      ...hardenedEvidence,
      peer_identity_method: "tls_cert_fingerprint_pin",
      encryption: "https_tls_fingerprint_pin",
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /transport_not_release_grade_quic_tls/);
  });
});

test("keeps claimed QUIC/TLS evidence non release grade without transport proof", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("missing-transport-proof");
    const res = await POST(postReq({
      ...hardenedEvidence,
      transport_verified_by: undefined,
    }));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { release_grade: boolean; blockers: string[] };
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /missing_release_grade_transport_proof/);
  });
});

test("rejects missing bearer token", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("missing-auth");
    const res = await POST(postReq(hardenedEvidence, null));
    assert.equal(res.status, 401);
  });
});

test("rejects malformed evidence", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("malformed");
    const res = await POST(postReq({ ...hardenedEvidence, schema: "wrong.schema", candidate_addr: "" }));
    assert.equal(res.status, 400);
  });
});

test("queries stored route evidence with filters", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("query");
    await POST(postReq(hardenedEvidence));
    await POST(postReq({
      ...hardenedEvidence,
      target_node_id: "pc-c",
      route_kind: "tailscale",
      peer_identity_verified: false,
      encryption: "none_http_bearer",
    }));

    const allRes = await GET(getReq("?limit=10"));
    assert.equal(allRes.status, 200);
    const allBody = (await allRes.json()) as { count: number };
    assert.equal(allBody.count, 2);

    const filteredRes = await GET(getReq("?target_node_id=pc-b&release_grade=true"));
    assert.equal(filteredRes.status, 200);
    const filteredBody = (await filteredRes.json()) as {
      owner_scoped: boolean;
      count: number;
      records: Array<{ evidence: { target_node_id: string }; release_grade: boolean; owner_key?: string }>;
    };
    assert.equal(filteredBody.owner_scoped, true);
    assert.equal(filteredBody.count, 1);
    assert.equal(filteredBody.records[0]?.evidence.target_node_id, "pc-b");
    assert.equal(filteredBody.records[0]?.release_grade, true);
    assert.equal(filteredBody.records[0]?.owner_key, undefined);
  });
});

test("excludes stale relay records without current transport proof from release-grade queries", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("query-stale-relay-proof");
    await POST(postReq(hardenedEvidence));

    const staleRelayEvidence: RouteEvidencePayload = {
      ...hardenedEvidence,
      route_kind: "relay",
      candidate_addr: "relay.musu.pro:443",
      payload_transited_musu_infra: true,
      relay_fallback: {
        direct_path_failed: true,
        lease_requested: true,
        status: "issued",
        lease_issued: true,
        attempted_route_kinds: ["lan", "tailscale"],
        requested_capability: "remote_command",
        policy: "connect_pro_fallback_only",
        blockers: [],
        lease_id: "stale-relay-lease",
        payload_transport_attempted: true,
        payload_transport_proven: true,
      },
    };
    await appendRouteEvidenceRecord({
      id: "stale-relay-release-grade",
      owner_key: p2pControlOwnerKey("test-token"),
      received_at: "2026-06-01T01:00:03Z",
      release_grade: true,
      blockers: [],
      evidence: staleRelayEvidence,
    });

    const filteredRes = await GET(getReq("?release_grade=true&limit=10"));
    assert.equal(filteredRes.status, 200);
    const filteredBody = (await filteredRes.json()) as {
      count: number;
      records: Array<{ id: string; evidence: { route_kind: string }; release_grade: boolean }>;
    };
    assert.equal(filteredBody.count, 1);
    assert.equal(filteredBody.records[0]?.evidence.route_kind, "direct_quic");
    assert.equal(
      filteredBody.records.some((record) => record.id === "stale-relay-release-grade"),
      false
    );
  });
});

test("queries only records owned by the bearer token", async () => {
  await withRouteEvidenceToken(async () => {
    const { GET, POST } = await loadModule("owner-scope");

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-a-token";
    await POST(postReq({
      ...hardenedEvidence,
      source_node_id: "owner-a-source",
      target_node_id: "owner-a-target",
    }, "owner-a-token"));

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-b-token";
    await POST(postReq({
      ...hardenedEvidence,
      source_node_id: "owner-b-source",
      target_node_id: "owner-b-target",
    }, "owner-b-token"));

    const ownerBRes = await GET(getReq("?limit=10", "owner-b-token"));
    assert.equal(ownerBRes.status, 200);
    const ownerBBody = (await ownerBRes.json()) as {
      count: number;
      records: Array<{ evidence: { source_node_id: string }; owner_key?: string }>;
    };
    assert.equal(ownerBBody.count, 1);
    assert.equal(ownerBBody.records[0]?.evidence.source_node_id, "owner-b-source");
    assert.equal(ownerBBody.records[0]?.owner_key, undefined);

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-a-token";
    const ownerARes = await GET(getReq("?limit=10", "owner-a-token"));
    assert.equal(ownerARes.status, 200);
    const ownerABody = (await ownerARes.json()) as {
      count: number;
      records: Array<{ evidence: { source_node_id: string }; owner_key?: string }>;
    };
    assert.equal(ownerABody.count, 1);
    assert.equal(ownerABody.records[0]?.evidence.source_node_id, "owner-a-source");
    assert.equal(ownerABody.records[0]?.owner_key, undefined);
  });
});
