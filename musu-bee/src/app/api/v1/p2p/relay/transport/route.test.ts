import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
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
  "MUSU_P2P_RELAY_LEASE_STORE_PATH",
  "MUSU_P2P_RELAY_TRANSPORT_WIRED",
  "MUSU_P2P_RELAY_URL",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

function getReq(token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/relay/transport", {
    method: "GET",
    headers,
  });
}

async function withRelayEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-relay-transport-"));
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

function enableRelayTransportPolicy(): void {
  process.env.MUSU_P2P_RELAY_ENABLED = "1";
  process.env.MUSU_P2P_RELAY_TRANSPORT_WIRED = "1";
  process.env.MUSU_P2P_RELAY_URL = "wss://relay.musu.pro/api/v1/relay/connect";
  process.env.MUSU_P2P_RELAY_ENTITLEMENT = "pro";
  process.env.KV_REST_API_URL = "https://upstash.invalid";
  process.env.KV_REST_API_TOKEN = "test-token";
}

test("reports relay transport preflight blockers by default", async () => {
  await withRelayEnv(async () => {
    const { GET } = await loadModule("default-blockers");
    const res = await GET(getReq());
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      schema: string;
      ok: boolean;
      owner_scoped: boolean;
      relay_transport_descriptor_wired: boolean;
      relay_transport_wired: boolean;
      relay_connect_endpoint_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_default_data_path: boolean;
      relay_lease_store_backend: string;
      relay_lease_store_release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.schema, "musu.p2p_relay_transport.v1");
    assert.equal(body.ok, false);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_transport_descriptor_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_connect_endpoint_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.relay_lease_store_backend, "file");
    assert.equal(body.relay_lease_store_release_grade, false);
    assert.match(body.blockers.join(","), /relay_disabled/);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_tunnel_runtime_not_implemented/);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.match(body.blockers.join(","), /relay_url_not_configured/);
    assert.match(body.blockers.join(","), /connect_pro_entitlement_required/);
    assert.match(body.blockers.join(","), /relay_lease_store_not_release_grade/);
  });
});

test("rejects non-wss relay transport URLs", async () => {
  await withRelayEnv(async () => {
    const { GET } = await loadModule("url-scheme");
    enableRelayTransportPolicy();
    process.env.MUSU_P2P_RELAY_URL = "ws://relay.musu.pro/api/v1/relay/connect";
    const res = await GET(getReq());
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; blockers: string[] };
    assert.equal(body.ok, false);
    assert.match(body.blockers.join(","), /relay_url_not_wss/);
  });
});

test("keeps relay transport preflight blocked when only env policy is configured", async () => {
  await withRelayEnv(async () => {
    const { GET } = await loadModule("preflight-env-only");
    enableRelayTransportPolicy();
    const res = await GET(getReq());
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      owner_scoped: boolean;
      relay_control_plane_wired: boolean;
      relay_transport_descriptor_wired: boolean;
      relay_transport_wired: boolean;
      relay_connect_endpoint_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_payload_queue_endpoint_wired: boolean;
      relay_default_data_path: boolean;
      relay_url: string;
      relay_connect_path: string;
      relay_transport_kind: string;
      release_grade_relay_transport_kind: string;
      release_grade_transport_required: string;
      payload_transit_requires_lease: boolean;
      relay_lease_store_configured: boolean;
      relay_lease_store_release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.ok, false);
    assert.equal(body.owner_scoped, true);
    assert.equal(body.relay_control_plane_wired, true);
    assert.equal(body.relay_transport_descriptor_wired, true);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_connect_endpoint_wired, true);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_payload_queue_endpoint_wired, true);
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.relay_url, "wss://relay.musu.pro/api/v1/relay/connect");
    assert.equal(body.relay_connect_path, "/api/v1/relay/connect");
    assert.equal(body.relay_transport_kind, "websocket_tunnel");
    assert.equal(body.release_grade_relay_transport_kind, "quic_relay_tunnel");
    assert.equal(body.release_grade_transport_required, "quic_tls_1_3");
    assert.equal(body.payload_transit_requires_lease, true);
    assert.equal(body.relay_lease_store_configured, true);
    assert.equal(body.relay_lease_store_release_grade, true);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_tunnel_runtime_not_implemented/);
    assert.match(body.blockers.join(","), /relay_transport_kind_not_release_grade/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
  });
});

test("rejects missing bearer token", async () => {
  await withRelayEnv(async () => {
    const { GET } = await loadModule("auth");
    const res = await GET(getReq(null));
    assert.equal(res.status, 401);
  });
});
