import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_RELAY_ENABLED",
  "MUSU_P2P_RELAY_ENTITLEMENT",
  "MUSU_P2P_RELAY_LEASE_MAX_RECORDS",
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_LEASE_TTL_SEC",
  "MUSU_P2P_RELAY_TRANSPORT_WIRED",
  "MUSU_P2P_RELAY_URL",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

const leaseRequest = {
  session_id: "rv_test",
  source_node_id: "pc-a",
  target_node_id: "pc-b",
  requested_capability: "remote_command",
  attempted_route_kinds: ["lan", "tailscale", "direct_quic"],
  direct_path_failed: true,
  failure_class: "connect_timeout",
};

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

function postReq(body: unknown, token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/relay/lease", {
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
  return new NextRequest(`http://localhost/api/v1/p2p/relay/lease${search}`, {
    method: "GET",
    headers,
  });
}

function enableRelayLeasePolicy(): void {
  process.env.MUSU_P2P_RELAY_ENABLED = "1";
  process.env.MUSU_P2P_RELAY_TRANSPORT_WIRED = "1";
  process.env.MUSU_P2P_RELAY_URL = "wss://relay.musu.pro/connect";
  process.env.MUSU_P2P_RELAY_ENTITLEMENT = "pro";
}

async function withRelayEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-relay-lease-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
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

test("denies relay lease by default with explicit policy blockers", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("default-deny");
    const res = await POST(postReq(leaseRequest));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      lease_issued: boolean;
      owner_scoped: boolean;
      relay_control_plane_wired: boolean;
      relay_transport_wired: boolean;
      relay_default_data_path: boolean;
      blockers: string[];
    };
    assert.equal(body.lease_issued, false);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_control_plane_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_default_data_path, false);
    assert.match(body.blockers.join(","), /relay_disabled/);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /connect_pro_entitlement_required/);
  });
});

test("issues an owner-scoped relay fallback lease when policy allows it", async () => {
  await withRelayEnv(async () => {
    const { GET, POST } = await loadModule("issue");
    enableRelayLeasePolicy();

    const res = await POST(postReq(leaseRequest));
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
      lease_issued: boolean;
      owner_scoped: boolean;
      relay_transport_wired: boolean;
      relay_default_data_path: boolean;
      blockers: string[];
      lease: {
        lease_id: string;
        owner_key?: string;
        relay_url: string;
        route_kind: string;
        payload_transited_musu_infra: boolean;
        default_data_path: boolean;
        policy: string;
      };
    };
    assert.equal(body.lease_issued, true);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_transport_wired, true);
    assert.equal(body.relay_default_data_path, false);
    assert.deepEqual(body.blockers, []);
    assert.match(body.lease.lease_id, /^relay-lease-/);
    assert.equal(body.lease.owner_key, undefined);
    assert.equal(body.lease.relay_url, "wss://relay.musu.pro/connect");
    assert.equal(body.lease.route_kind, "relay");
    assert.equal(body.lease.payload_transited_musu_infra, true);
    assert.equal(body.lease.default_data_path, false);
    assert.equal(body.lease.policy, "connect_pro_fallback_only");

    const getRes = await GET(getReq("?limit=10"));
    assert.equal(getRes.status, 200);
    const query = (await getRes.json()) as {
      owner_scoped: boolean;
      count: number;
      leases: Array<{ session_id: string; owner_key?: string }>;
    };
    assert.equal(query.owner_scoped, true);
    assert.equal(query.count, 1);
    assert.equal(query.leases[0]?.session_id, "rv_test");
    assert.equal(query.leases[0]?.owner_key, undefined);
  });
});

test("requires a direct path failure before relay can be leased", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("direct-first");
    enableRelayLeasePolicy();
    const res = await POST(postReq({
      ...leaseRequest,
      direct_path_failed: false,
    }));
    assert.equal(res.status, 409);
    const body = (await res.json()) as { lease_issued: boolean; blockers: string[] };
    assert.equal(body.lease_issued, false);
    assert.match(body.blockers.join(","), /relay_requires_direct_path_failure/);
  });
});

test("queries only relay leases owned by the bearer token", async () => {
  await withRelayEnv(async () => {
    const { GET, POST } = await loadModule("owner-scope");
    enableRelayLeasePolicy();

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-a-token";
    await POST(postReq({
      ...leaseRequest,
      session_id: "rv_owner_a",
      source_node_id: "owner-a-source",
    }, "owner-a-token"));

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-b-token";
    await POST(postReq({
      ...leaseRequest,
      session_id: "rv_owner_b",
      source_node_id: "owner-b-source",
    }, "owner-b-token"));

    const ownerBRes = await GET(getReq("?limit=10", "owner-b-token"));
    assert.equal(ownerBRes.status, 200);
    const ownerBBody = (await ownerBRes.json()) as {
      count: number;
      leases: Array<{ session_id: string; owner_key?: string }>;
    };
    assert.equal(ownerBBody.count, 1);
    assert.equal(ownerBBody.leases[0]?.session_id, "rv_owner_b");
    assert.equal(ownerBBody.leases[0]?.owner_key, undefined);

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-a-token";
    const ownerARes = await GET(getReq("?limit=10", "owner-a-token"));
    assert.equal(ownerARes.status, 200);
    const ownerABody = (await ownerARes.json()) as {
      count: number;
      leases: Array<{ session_id: string; owner_key?: string }>;
    };
    assert.equal(ownerABody.count, 1);
    assert.equal(ownerABody.leases[0]?.session_id, "rv_owner_a");
    assert.equal(ownerABody.leases[0]?.owner_key, undefined);
  });
});

test("rejects missing bearer token", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("auth");
    const res = await POST(postReq(leaseRequest, null));
    assert.equal(res.status, 401);
  });
});
