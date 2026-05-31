import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

type Module = { POST: (req: NextRequest) => Promise<Response> };

const ENV_KEYS = ["MUSU_P2P_CONTROL_TOKEN", "MUSU_ROUTE_EVIDENCE_TOKEN", "MUSU_TOKEN"] as const;

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
  encryption: "quic_tls_1_3",
  payload_transited_musu_infra: false,
  result: "success",
  recorded_at: "2026-06-01T01:00:00Z",
};

async function loadModule(caseName: string): Promise<Module> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
}

function req(body: unknown, token: string | null = "test-token"): NextRequest {
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

async function withRouteEvidenceToken(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
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

test("accepts hardened release-grade route evidence", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("hardened");
    const res = await POST(req(hardenedEvidence));
    assert.equal(res.status, 202);

    const body = (await res.json()) as { ok: boolean; release_grade: boolean; blockers: string[] };
    assert.equal(body.ok, true);
    assert.equal(body.release_grade, true);
    assert.deepEqual(body.blockers, []);
  });
});

test("accepts legacy debug evidence but marks it non release grade", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("legacy");
    const res = await POST(req({
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

test("rejects missing bearer token", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("missing-auth");
    const res = await POST(req(hardenedEvidence, null));
    assert.equal(res.status, 401);
  });
});

test("rejects malformed evidence", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("malformed");
    const res = await POST(req({ ...hardenedEvidence, schema: "wrong.schema", candidate_addr: "" }));
    assert.equal(res.status, 400);
  });
});
