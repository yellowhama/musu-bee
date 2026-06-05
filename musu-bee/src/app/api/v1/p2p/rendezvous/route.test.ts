import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

type CreateModule = { POST: (req: NextRequest) => Promise<Response> };
type SessionModule = {
  GET: (req: NextRequest, ctx: Ctx) => Promise<Response>;
};
type ActionModule = {
  POST: (req: NextRequest, ctx: Ctx) => Promise<Response>;
};
type Ctx = { params: Promise<{ id: string }> };

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_P2P_RENDEZVOUS_STORE_PATH",
  "MUSU_P2P_RENDEZVOUS_TTL_SEC",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function postReq(body: unknown, token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/rendezvous", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getReq(token: string | null = "test-token"): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/rendezvous/rv", {
    method: "GET",
    headers,
  });
}

async function withRendezvousEnv(fn: () => Promise<void>): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  const tempDir = await mkdtemp(join(tmpdir(), "musu-rendezvous-"));
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_P2P_CONTROL_TOKEN = "test-token";
  process.env.MUSU_P2P_RENDEZVOUS_STORE_PATH = join(tempDir, "sessions.json");
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

async function loadCreate(caseName: string): Promise<CreateModule> {
  return (await import(`./route?case=${caseName}-${Date.now()}`)) as CreateModule;
}

async function loadSession(caseName: string): Promise<SessionModule> {
  return (await import(`./[id]/route?case=${caseName}-${Date.now()}`)) as SessionModule;
}

async function loadCandidates(caseName: string): Promise<ActionModule> {
  return (await import(`./[id]/candidates/route?case=${caseName}-${Date.now()}`)) as ActionModule;
}

async function loadApprove(caseName: string): Promise<ActionModule> {
  return (await import(`./[id]/approve/route?case=${caseName}-${Date.now()}`)) as ActionModule;
}

async function loadClose(caseName: string): Promise<ActionModule> {
  return (await import(`./[id]/close/route?case=${caseName}-${Date.now()}`)) as ActionModule;
}

test("creates and reads a rendezvous session", async () => {
  await withRendezvousEnv(async () => {
    const { POST } = await loadCreate("create");
    const res = await POST(postReq({
      source_node_id: "pc-a",
      target_node_id: "pc-b",
      requested_capability: "remote_command",
    }));
    assert.equal(res.status, 201);
    const session = (await res.json()) as {
      session_id: string;
      owner_key: string;
      source: { node_id: string; candidate_endpoints: unknown[] };
      target: { node_id: string };
      path_selection_order: string[];
      approval_required: boolean;
      status: string;
    };

    assert.match(session.session_id, /^rv_/);
    assert.match(session.owner_key, /^token-sha256:/);
    assert.equal(session.source.node_id, "pc-a");
    assert.deepEqual(session.source.candidate_endpoints, []);
    assert.equal(session.target.node_id, "pc-b");
    assert.deepEqual(session.path_selection_order, [
      "lan",
      "tailscale",
      "direct_quic",
      "relay",
    ]);
    assert.equal(session.approval_required, true);
    assert.equal(session.status, "pending_approval");

    const { GET } = await loadSession("get");
    const getRes = await GET(getReq(), ctx(session.session_id));
    assert.equal(getRes.status, 200);
    const fetched = (await getRes.json()) as {
      session_id: string;
      owner_key: string;
      path_selection_order: string[];
    };
    assert.equal(fetched.session_id, session.session_id);
    assert.equal(fetched.owner_key, session.owner_key);
    assert.deepEqual(fetched.path_selection_order, session.path_selection_order);
  });
});

test("updates candidates, approves, and closes the rendezvous", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("flow-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("flow-candidates");
    const candidateRes = await candidates(
      postReq({
        node_id: "pc-a",
        candidate_endpoints: [
          { kind: "lan", addr: "192.168.1.10:8070", observed_at: "2026-06-01T00:00:00Z", scheme: "https" },
          { kind: "tailscale", addr: "100.64.1.10:8070", observed_at: "2026-06-01T00:00:01Z" },
          {
            kind: "direct_quic",
            addr: "203.0.113.10:8949",
            observed_at: "2026-06-01T00:00:02Z",
            public_addr: "203.0.113.10:8949",
            nat_type: "symmetric",
            nat_observed_by: "stun:musu.pro",
          },
          {
            kind: "relay",
            addr: "relay.musu.pro:443",
            observed_at: "2026-06-01T00:00:03Z",
            relay_url: "https://relay.musu.pro/r/lease-pc-a",
            relay_protocol: "websocket_tunnel",
          },
        ],
        relay_capable: true,
        public_key: "pk_test",
        capabilities: ["remote_command"],
      }),
      ctx(created.session_id)
    );
    assert.equal(candidateRes.status, 200);
    const withCandidates = (await candidateRes.json()) as {
      path_selection_order: string[];
      source: {
        relay_capable: boolean;
        candidate_endpoints: Array<{
          kind: string;
          scheme?: string;
          public_addr?: string;
          nat_type?: string;
          nat_observed_by?: string;
          relay_url?: string;
          relay_protocol?: string;
        }>;
      };
    };
    assert.deepEqual(withCandidates.path_selection_order, [
      "lan",
      "tailscale",
      "direct_quic",
      "relay",
    ]);
    assert.equal(withCandidates.source.relay_capable, true);
    assert.equal(withCandidates.source.candidate_endpoints[0]?.kind, "lan");
    assert.equal(withCandidates.source.candidate_endpoints[0]?.scheme, "https");
    assert.equal(withCandidates.source.candidate_endpoints[2]?.public_addr, "203.0.113.10:8949");
    assert.equal(withCandidates.source.candidate_endpoints[2]?.nat_type, "symmetric");
    assert.equal(withCandidates.source.candidate_endpoints[2]?.nat_observed_by, "stun:musu.pro");
    assert.equal(withCandidates.source.candidate_endpoints[3]?.relay_url, "https://relay.musu.pro/r/lease-pc-a");
    assert.equal(withCandidates.source.candidate_endpoints[3]?.relay_protocol, "websocket_tunnel");

    const { POST: approve } = await loadApprove("flow-approve");
    const approveRes = await approve(postReq({}), ctx(created.session_id));
    assert.equal(approveRes.status, 200);
    const approved = (await approveRes.json()) as { approval_required: boolean; status: string };
    assert.equal(approved.approval_required, false);
    assert.equal(approved.status, "approved");

    const { POST: close } = await loadClose("flow-close");
    const closeRes = await close(postReq({}), ctx(created.session_id));
    assert.equal(closeRes.status, 200);
    const closed = (await closeRes.json()) as { status: string; closed_at: string };
    assert.equal(closed.status, "closed");
    assert.match(closed.closed_at, /^20/);
  });
});

test("seeds new rendezvous sessions from cached node candidates", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("seed-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("seed-candidates");
    const candidateRes = await candidates(
      postReq({
        node_id: "pc-b",
        candidate_endpoints: [
          { kind: "lan", addr: "192.168.1.20:8070", observed_at: "2026-06-01T00:00:00Z" },
          { kind: "tailscale", addr: "100.64.1.20:8070", observed_at: "2026-06-01T00:00:01Z" },
          {
            kind: "direct_quic",
            addr: "198.51.100.20:8949",
            observed_at: "2026-06-01T00:00:02Z",
            public_addr: "198.51.100.20:8949",
            nat_type: "port_restricted_cone",
            nat_observed_by: "stun:musu.pro",
          },
        ],
        relay_capable: false,
        node_name: "pc-b",
        app_version: "1.15.0-rc.1",
        capabilities: ["bridge_http_forward"],
      }),
      ctx(created.session_id)
    );
    assert.equal(candidateRes.status, 200);

    const seededRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    assert.equal(seededRes.status, 201);
    const seeded = (await seededRes.json()) as {
      target: { candidate_endpoints: Array<{ kind: string; addr: string; public_addr?: string; nat_type?: string }> };
    };
    assert.equal(seeded.target.candidate_endpoints[0]?.kind, "lan");
    assert.equal(seeded.target.candidate_endpoints[0]?.addr, "192.168.1.20:8070");
    assert.equal(seeded.target.candidate_endpoints[2]?.public_addr, "198.51.100.20:8949");
    assert.equal(seeded.target.candidate_endpoints[2]?.nat_type, "port_restricted_cone");
  });
});

test("does not seed rendezvous candidates across authorized owners", async () => {
  await withRendezvousEnv(async () => {
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = [
      sha256("test-token"),
      sha256("other-token"),
    ].join(",");

    const { POST: create } = await loadCreate("cross-owner-seed-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("cross-owner-seed-candidates");
    const candidateRes = await candidates(
      postReq({
        node_id: "pc-b",
        candidate_endpoints: [
          { kind: "lan", addr: "192.168.1.20:8070", observed_at: "2026-06-01T00:00:00Z" },
        ],
        relay_capable: false,
        node_name: "pc-b",
        app_version: "1.15.0-rc.1",
        capabilities: ["bridge_http_forward"],
      }),
      ctx(created.session_id)
    );
    assert.equal(candidateRes.status, 200);

    const sameOwnerRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    assert.equal(sameOwnerRes.status, 201);
    const sameOwner = (await sameOwnerRes.json()) as {
      target: { candidate_endpoints: Array<{ addr: string }> };
    };
    assert.equal(sameOwner.target.candidate_endpoints[0]?.addr, "192.168.1.20:8070");

    const otherOwnerRes = await create(
      postReq({ source_node_id: "pc-c", target_node_id: "pc-b" }, "other-token")
    );
    assert.equal(otherOwnerRes.status, 201);
    const otherOwner = (await otherOwnerRes.json()) as {
      target: { candidate_endpoints: unknown[] };
    };
    assert.deepEqual(otherOwner.target.candidate_endpoints, []);
  });
});

test("does not expose or mutate rendezvous sessions for another authorized owner", async () => {
  await withRendezvousEnv(async () => {
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = [
      sha256("test-token"),
      sha256("other-token"),
    ].join(",");

    const { POST: create } = await loadCreate("cross-owner-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { session_id: string };

    const { GET } = await loadSession("cross-owner-get");
    const otherGet = await GET(getReq("other-token"), ctx(created.session_id));
    assert.equal(otherGet.status, 404);

    const { POST: candidates } = await loadCandidates("cross-owner-candidates");
    const otherCandidate = await candidates(
      postReq(
        {
          node_id: "pc-a",
          candidate_endpoints: [
            { kind: "lan", addr: "192.168.1.10:8070", observed_at: "2026-06-01T00:00:00Z" },
          ],
          relay_capable: false,
        },
        "other-token"
      ),
      ctx(created.session_id)
    );
    assert.equal(otherCandidate.status, 404);

    const { POST: approve } = await loadApprove("cross-owner-approve");
    const otherApprove = await approve(postReq({}, "other-token"), ctx(created.session_id));
    assert.equal(otherApprove.status, 404);

    const { POST: close } = await loadClose("cross-owner-close");
    const otherClose = await close(postReq({}, "other-token"), ctx(created.session_id));
    assert.equal(otherClose.status, 404);

    const ownerGet = await GET(getReq(), ctx(created.session_id));
    assert.equal(ownerGet.status, 200);
    const ownerSession = (await ownerGet.json()) as {
      approval_required: boolean;
      status: string;
      source: { candidate_endpoints: unknown[] };
    };
    assert.equal(ownerSession.approval_required, true);
    assert.equal(ownerSession.status, "pending_approval");
    assert.deepEqual(ownerSession.source.candidate_endpoints, []);
  });
});

test("rejects missing bearer token", async () => {
  await withRendezvousEnv(async () => {
    const { POST } = await loadCreate("auth");
    const res = await POST(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }, null));
    assert.equal(res.status, 401);
  });
});

test("rejects raw payload byte fields in rendezvous creation", async () => {
  await withRendezvousEnv(async () => {
    const { POST } = await loadCreate("create-payload-bytes-not-accepted");
    const res = await POST(postReq({
      source_node_id: "pc-a",
      target_node_id: "pc-b",
      payload_base64: Buffer.from("do-not-store-rendezvous-payload").toString("base64"),
    }));
    assert.equal(res.status, 400);

    const body = (await res.json()) as { error: string; forbidden_fields: string[] };
    assert.equal(body.error, "rendezvous_payload_bytes_not_accepted");
    assert.deepEqual(body.forbidden_fields, ["payload_base64"]);
  });
});

test("rejects unknown rendezvous creation fields", async () => {
  await withRendezvousEnv(async () => {
    const { POST } = await loadCreate("create-unknown-field");
    const res = await POST(postReq({
      source_node_id: "pc-a",
      target_node_id: "pc-b",
      unexpected_release_field: true,
    }));
    assert.equal(res.status, 400);

    const body = (await res.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.error, "invalid_rendezvous_request");
    assert.equal(body.issues.some((issue) => issue.path === "unexpected_release_field"), true);
  });
});

test("rejects candidate updates for nodes outside the session", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("bad-node-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("bad-node-candidates");
    const res = await candidates(
      postReq({ node_id: "pc-c", candidate_endpoints: [], relay_capable: false }),
      ctx(created.session_id)
    );
    assert.equal(res.status, 400);
  });
});

test("rejects raw payload byte fields in rendezvous candidate exchange", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("candidate-payload-bytes-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("candidate-payload-bytes");
    const res = await candidates(
      postReq({
        node_id: "pc-a",
        candidate_endpoints: [
          {
            kind: "lan",
            addr: "192.168.1.10:8070",
            observed_at: "2026-06-01T00:00:00Z",
            payload_base64: Buffer.from("do-not-store-candidate-payload").toString("base64"),
          },
        ],
        relay_capable: false,
      }),
      ctx(created.session_id)
    );
    assert.equal(res.status, 400);

    const body = (await res.json()) as { error: string; forbidden_fields: string[] };
    assert.equal(body.error, "rendezvous_candidates_payload_bytes_not_accepted");
    assert.deepEqual(body.forbidden_fields, ["candidate_endpoints.0.payload_base64"]);
  });
});

test("rejects unknown rendezvous candidate fields", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("candidate-unknown-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("candidate-unknown");
    const res = await candidates(
      postReq({
        node_id: "pc-a",
        candidate_endpoints: [
          {
            kind: "lan",
            addr: "192.168.1.10:8070",
            observed_at: "2026-06-01T00:00:00Z",
            unexpected_endpoint_field: true,
          },
        ],
        relay_capable: false,
      }),
      ctx(created.session_id)
    );
    assert.equal(res.status, 400);

    const body = (await res.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.error, "invalid_rendezvous_candidates");
    assert.equal(
      body.issues.some((issue) => issue.path === "candidate_endpoints.0.unexpected_endpoint_field"),
      true
    );
  });
});

test("rejects relay-capable candidates without relay endpoint details", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("bad-relay-contract-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("bad-relay-contract-candidates");
    const res = await candidates(
      postReq({
        node_id: "pc-a",
        candidate_endpoints: [
          { kind: "lan", addr: "192.168.1.10:8070", observed_at: "2026-06-01T00:00:00Z" },
        ],
        relay_capable: true,
      }),
      ctx(created.session_id)
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.error, "invalid_rendezvous_candidate_contract");
    assert.equal(body.issues[0]?.path, "relay_capable");

    const relayWithoutDetails = await candidates(
      postReq({
        node_id: "pc-a",
        candidate_endpoints: [
          { kind: "relay", addr: "relay.musu.pro:443", observed_at: "2026-06-01T00:00:00Z" },
        ],
        relay_capable: true,
      }),
      ctx(created.session_id)
    );
    assert.equal(relayWithoutDetails.status, 400);
    const relayBody = (await relayWithoutDetails.json()) as {
      issues: Array<{ path: string; message: string }>;
    };
    assert.deepEqual(
      relayBody.issues.map((issue) => issue.path),
      ["candidate_endpoints.0.relay_url", "candidate_endpoints.0.relay_protocol"]
    );
  });
});

test("rejects direct_quic candidates without public endpoint and NAT metadata", async () => {
  await withRendezvousEnv(async () => {
    const { POST: create } = await loadCreate("bad-quic-contract-create");
    const createRes = await create(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }));
    const created = (await createRes.json()) as { session_id: string };

    const { POST: candidates } = await loadCandidates("bad-quic-contract-candidates");
    const res = await candidates(
      postReq({
        node_id: "pc-a",
        candidate_endpoints: [
          { kind: "direct_quic", addr: "203.0.113.10:8949", observed_at: "2026-06-01T00:00:00Z" },
        ],
        relay_capable: false,
      }),
      ctx(created.session_id)
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    assert.equal(body.error, "invalid_rendezvous_candidate_contract");
    assert.deepEqual(
      body.issues.map((issue) => issue.path),
      ["candidate_endpoints.0.public_addr", "candidate_endpoints.0.nat_type"]
    );
  });
});

test("returns 404 for unknown rendezvous sessions", async () => {
  await withRendezvousEnv(async () => {
    const { GET } = await loadSession("not-found");
    const res = await GET(getReq(), ctx("rv_missing"));
    assert.equal(res.status, 404);
  });
});
