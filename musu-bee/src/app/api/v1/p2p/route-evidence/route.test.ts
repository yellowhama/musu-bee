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
  payload_transited_musu_infra: false,
  result: "success",
  recorded_at: "2026-06-01T01:00:00Z",
};

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

test("accepts hardened release-grade route evidence", async () => {
  await withRouteEvidenceToken(async () => {
    const { POST } = await loadModule("hardened");
    const res = await POST(postReq(hardenedEvidence));
    assert.equal(res.status, 202);

    const body = (await res.json()) as {
      ok: boolean;
      stored: boolean;
      evidence_id: string;
      release_grade: boolean;
      blockers: string[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.stored, true);
    assert.match(body.evidence_id, /^route-evidence-/);
    assert.equal(body.release_grade, true);
    assert.deepEqual(body.blockers, []);
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
      count: number;
      records: Array<{ evidence: { target_node_id: string }; release_grade: boolean }>;
    };
    assert.equal(filteredBody.count, 1);
    assert.equal(filteredBody.records[0]?.evidence.target_node_id, "pc-b");
    assert.equal(filteredBody.records[0]?.release_grade, true);
  });
});
