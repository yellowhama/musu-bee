import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
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
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
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
  }
}

function enableRelayPolicyEnv(): void {
  process.env.MUSU_P2P_RELAY_ENABLED = "1";
  process.env.MUSU_P2P_RELAY_TRANSPORT_WIRED = "1";
  process.env.MUSU_P2P_RELAY_URL = "wss://relay.musu.pro/api/v1/relay/connect";
  process.env.MUSU_P2P_RELAY_ENTITLEMENT = "pro";
  process.env.KV_REST_API_URL = "https://upstash.invalid";
  process.env.KV_REST_API_TOKEN = "test-token";
}

function connectReq(method: "GET" | "POST"): NextRequest {
  return new NextRequest("http://localhost/api/v1/relay/connect?session_id=s&node_id=n", {
    method,
  });
}

test("fails closed when relay connect is reached over HTTP", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { GET } = await loadModule("get-fail-closed");
    const res = await GET(connectReq("GET"));
    assert.equal(res.status, 501);
    const body = (await res.json()) as {
      schema: string;
      ok: boolean;
      error: string;
      method: string;
      relay_connect_path: string;
      relay_transport_kind: string;
      release_grade_transport_required: string;
      relay_transport_wired: boolean;
      relay_payload_endpoint_wired: boolean;
      relay_default_data_path: boolean;
      payload_transit_requires_lease: boolean;
      blockers: string[];
    };

    assert.equal(body.schema, "musu.relay_connect_unavailable.v1");
    assert.equal(body.ok, false);
    assert.equal(body.error, "relay_payload_transport_not_implemented");
    assert.equal(body.method, "GET");
    assert.equal(body.relay_connect_path, "/api/v1/relay/connect");
    assert.equal(body.relay_transport_kind, "websocket_tunnel");
    assert.equal(body.release_grade_transport_required, "quic_tls_1_3");
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_default_data_path, false);
    assert.equal(body.payload_transit_requires_lease, true);
    assert.match(body.blockers.join(","), /relay_transport_not_wired/);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
    assert.doesNotMatch(body.blockers.join(","), /relay_disabled/);
    assert.doesNotMatch(body.blockers.join(","), /relay_url_not_configured/);
  });
});

test("does not accept POST payload transit while the relay endpoint is unwired", async () => {
  await withRelayEnv(async () => {
    enableRelayPolicyEnv();
    const { POST } = await loadModule("post-fail-closed");
    const res = await POST(connectReq("POST"));
    assert.equal(res.status, 501);
    const body = (await res.json()) as {
      ok: boolean;
      method: string;
      relay_payload_endpoint_wired: boolean;
      relay_transport_wired: boolean;
      blockers: string[];
      relay_transport_proof?: unknown;
    };

    assert.equal(body.ok, false);
    assert.equal(body.method, "POST");
    assert.equal(body.relay_payload_endpoint_wired, false);
    assert.equal(body.relay_transport_wired, false);
    assert.equal(body.relay_transport_proof, undefined);
    assert.match(body.blockers.join(","), /relay_payload_endpoint_not_wired/);
  });
});
