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
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_MAX_RECORDS",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_PROOF_TTL_SEC",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

const proofFixture = {
  schema: "musu.relay_transport_proof.v1",
  session_id: "rv_123",
  lease_id: "filled-by-test",
  source_node_id: "pc-a",
  target_node_id: "pc-b",
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
};

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

function postReq(body: unknown, token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/relay/transport-proof", {
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
  return new NextRequest(`http://localhost/api/v1/p2p/relay/transport-proof${search}`, {
    method: "GET",
    headers,
  });
}

async function withTransportProofEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-relay-transport-proof-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH = join(tempDir, "relay-leases.json");
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

async function seedRelayLease(): Promise<StoredP2pRelayLease> {
  const lease = createRelayLease({
    owner_key: p2pControlOwnerKey("test-token"),
    session_id: proofFixture.session_id,
    source_node_id: proofFixture.source_node_id,
    target_node_id: proofFixture.target_node_id,
    requested_capability: "remote_command",
    attempted_route_kinds: ["lan", "tailscale"],
    failure_class: "connect_timeout",
    relay_url: proofFixture.relay_url,
  });
  await appendRelayLease(lease);
  return lease;
}

test("rejects missing bearer token", async () => {
  await withTransportProofEnv(async () => {
    const { POST } = await loadModule("auth");
    const res = await POST(postReq({ ...proofFixture }, null));
    assert.equal(res.status, 401);
  });
});

test("does not store relay transport proof without an owner-scoped lease", async () => {
  await withTransportProofEnv(async () => {
    const { GET, POST } = await loadModule("missing-lease");

    const res = await POST(postReq({ ...proofFixture, lease_id: "relay-lease-missing" }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      accepted: boolean;
      stored: boolean;
      release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.accepted, false);
    assert.equal(body.stored, false);
    assert.equal(body.release_grade, false);
    assert.match(body.blockers.join(","), /relay_transport_proof_lease_not_found/);

    const getRes = await GET(getReq("?limit=10"));
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as { count: number; proofs: unknown[] };
    assert.equal(getBody.count, 0);
    assert.equal(getBody.proofs.length, 0);
  });
});

test("stores lease-bound relay transport proof owner-scoped", async () => {
  await withTransportProofEnv(async () => {
    const { GET, POST } = await loadModule("stores-proof");
    const lease = await seedRelayLease();

    const res = await POST(postReq({ ...proofFixture, lease_id: lease.lease_id }));
    assert.equal(res.status, 202);
    const body = (await res.json()) as {
      accepted: boolean;
      stored: boolean;
      release_grade: boolean;
      relay_transport_proof_store_backend: string;
      blockers: string[];
      proof: {
        proof_id: string;
        owner_key?: string;
        lease_id: string;
        release_grade: boolean;
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.stored, true);
    assert.equal(body.relay_transport_proof_store_backend, "file");
    assert.equal(body.release_grade, false);
    assert.equal(body.proof.release_grade, true);
    assert.equal(body.proof.owner_key, undefined);
    assert.equal(body.proof.lease_id, lease.lease_id);
    assert.match(
      body.blockers.join(","),
      /relay_transport_proof_store_backend_not_release_grade/
    );

    const getRes = await GET(getReq(`?lease_id=${encodeURIComponent(lease.lease_id)}&limit=10`));
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as {
      schema: string;
      owner_scoped: boolean;
      count: number;
      relay_transport_proof_store_backend: string;
      proofs: Array<{ owner_key?: string; lease_id: string; tunnel_id: string }>;
    };
    assert.equal(getBody.schema, "musu.p2p_relay_transport_proofs.v1");
    assert.equal(getBody.owner_scoped, true);
    assert.equal(getBody.relay_transport_proof_store_backend, "file");
    assert.equal(getBody.count, 1);
    assert.equal(getBody.proofs[0]?.owner_key, undefined);
    assert.equal(getBody.proofs[0]?.lease_id, lease.lease_id);
    assert.equal(getBody.proofs[0]?.tunnel_id, proofFixture.tunnel_id);
  });
});

test("stores invalid proof as non release grade when lease binding exists", async () => {
  await withTransportProofEnv(async () => {
    const { POST } = await loadModule("stores-non-release-proof");
    const lease = await seedRelayLease();

    const res = await POST(postReq({
      ...proofFixture,
      lease_id: lease.lease_id,
      transport_kind: "websocket_tunnel",
      payload_transited_musu_infra: false,
      opened_at: "2026-06-01T01:00:02Z",
      closed_at: "2026-06-01T01:00:01Z",
    }));
    assert.equal(res.status, 202);
    const body = (await res.json()) as {
      accepted: boolean;
      stored: boolean;
      release_grade: boolean;
      blockers: string[];
      proof: { release_grade: boolean };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.stored, true);
    assert.equal(body.release_grade, false);
    assert.equal(body.proof.release_grade, false);
    assert.match(body.blockers.join(","), /relay_transport_proof_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_transport_proof_no_infra_transit/);
    assert.match(body.blockers.join(","), /relay_transport_proof_timestamp_order_invalid/);
  });
});
