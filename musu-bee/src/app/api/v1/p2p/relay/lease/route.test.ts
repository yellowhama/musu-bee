import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";
import { appendRelayLease, createRelayLease, type RelayRouteKind } from "@/lib/p2pRelayLeaseStore";

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

async function seedRelayLeaseForToken(
  token: string,
  overrides: Partial<typeof leaseRequest> = {}
): Promise<void> {
  const request = { ...leaseRequest, ...overrides };
  await appendRelayLease(createRelayLease({
    owner_key: p2pControlOwnerKey(token),
    session_id: request.session_id,
    source_node_id: request.source_node_id,
    target_node_id: request.target_node_id,
    requested_capability: request.requested_capability,
    attempted_route_kinds: request.attempted_route_kinds as RelayRouteKind[],
    failure_class: request.failure_class,
    relay_url: "wss://relay.musu.pro/connect",
  }));
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
      relay_connect_endpoint_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_default_data_path: boolean;
      relay_lease_store_configured: boolean;
      relay_lease_store_backend: string;
      relay_lease_store_release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.lease_issued, false);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_control_plane_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_connect_endpoint_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.relay_lease_store_configured, true);
    assert.equal(body.relay_lease_store_backend, "file");
    assert.equal(body.relay_lease_store_release_grade, false);
    assert.match(body.blockers.join(","), /relay_disabled/);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /connect_pro_entitlement_required/);
  });
});

test("denies env-only relay fallback lease until payload endpoint is wired", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("env-only-deny");
    enableRelayLeasePolicy();

    const res = await POST(postReq(leaseRequest));
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      lease_issued: boolean;
      owner_scoped: boolean;
      relay_transport_wired: boolean;
      relay_connect_endpoint_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_default_data_path: boolean;
      relay_lease_store_configured: boolean;
      relay_lease_store_backend: string;
      relay_lease_store_release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.lease_issued, false);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_connect_endpoint_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.relay_lease_store_configured, true);
    assert.equal(body.relay_lease_store_backend, "file");
    assert.equal(body.relay_lease_store_release_grade, false);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
  });
});

test("requires a wss relay URL before a fallback lease can be issued", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("wss-url");
    enableRelayLeasePolicy();
    process.env.MUSU_P2P_RELAY_URL = "ws://relay.musu.pro/connect";
    const res = await POST(postReq(leaseRequest));
    assert.equal(res.status, 409);
    const body = (await res.json()) as { lease_issued: boolean; blockers: string[] };
    assert.equal(body.lease_issued, false);
    assert.match(body.blockers.join(","), /relay_url_not_wss/);
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
    const { GET } = await loadModule("owner-scope");
    await seedRelayLeaseForToken("owner-a-token", {
      session_id: "rv_owner_a",
      source_node_id: "owner-a-source",
    });
    await seedRelayLeaseForToken("owner-b-token", {
      session_id: "rv_owner_b",
      source_node_id: "owner-b-source",
    });

    process.env.MUSU_P2P_CONTROL_TOKEN = "owner-b-token";
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

test("reports unconfigured production relay lease storage explicitly", async () => {
  await withRelayEnv(async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const mutableEnv = process.env as Record<string, string | undefined>;
    delete process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH;
    mutableEnv.NODE_ENV = "production";
    try {
      const { GET } = await loadModule("store-unconfigured");
      const res = await GET(getReq("?limit=10"));
      assert.equal(res.status, 503);
      const body = (await res.json()) as {
        ok: boolean;
        error: string;
        detail: string;
        relay_lease_store_configured: boolean;
        relay_lease_store_backend: string;
        relay_lease_store_release_grade: boolean;
      };
      assert.equal(body.ok, false);
      assert.equal(body.error, "relay_lease_query_failed");
      assert.match(body.detail, /p2p_relay_lease_kv_not_configured/);
      assert.equal(body.relay_lease_store_configured, false);
      assert.equal(body.relay_lease_store_backend, "unconfigured");
      assert.equal(body.relay_lease_store_release_grade, false);
    } finally {
      if (previousNodeEnv === undefined) {
        delete mutableEnv.NODE_ENV;
      } else {
        mutableEnv.NODE_ENV = previousNodeEnv;
      }
    }
  });
});

test("rejects missing bearer token", async () => {
  await withRelayEnv(async () => {
    const { POST } = await loadModule("auth");
    const res = await POST(postReq(leaseRequest, null));
    assert.equal(res.status, 401);
  });
});
