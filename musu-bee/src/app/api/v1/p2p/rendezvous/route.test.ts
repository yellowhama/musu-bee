import assert from "node:assert/strict";
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
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_RENDEZVOUS_STORE_PATH",
  "MUSU_P2P_RENDEZVOUS_TTL_SEC",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
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
      source: { node_id: string; candidate_endpoints: unknown[] };
      target: { node_id: string };
      approval_required: boolean;
      status: string;
    };

    assert.match(session.session_id, /^rv_/);
    assert.equal(session.source.node_id, "pc-a");
    assert.deepEqual(session.source.candidate_endpoints, []);
    assert.equal(session.target.node_id, "pc-b");
    assert.equal(session.approval_required, true);
    assert.equal(session.status, "pending_approval");

    const { GET } = await loadSession("get");
    const getRes = await GET(getReq(), ctx(session.session_id));
    assert.equal(getRes.status, 200);
    const fetched = (await getRes.json()) as { session_id: string };
    assert.equal(fetched.session_id, session.session_id);
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
        ],
        relay_capable: true,
        public_key: "pk_test",
        capabilities: ["remote_command"],
      }),
      ctx(created.session_id)
    );
    assert.equal(candidateRes.status, 200);
    const withCandidates = (await candidateRes.json()) as {
      source: { relay_capable: boolean; candidate_endpoints: Array<{ kind: string; scheme?: string }> };
    };
    assert.equal(withCandidates.source.relay_capable, true);
    assert.equal(withCandidates.source.candidate_endpoints[0]?.kind, "lan");
    assert.equal(withCandidates.source.candidate_endpoints[0]?.scheme, "https");

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
      target: { candidate_endpoints: Array<{ kind: string; addr: string }> };
    };
    assert.equal(seeded.target.candidate_endpoints[0]?.kind, "lan");
    assert.equal(seeded.target.candidate_endpoints[0]?.addr, "192.168.1.20:8070");
  });
});

test("rejects missing bearer token", async () => {
  await withRendezvousEnv(async () => {
    const { POST } = await loadCreate("auth");
    const res = await POST(postReq({ source_node_id: "pc-a", target_node_id: "pc-b" }, null));
    assert.equal(res.status, 401);
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

test("returns 404 for unknown rendezvous sessions", async () => {
  await withRendezvousEnv(async () => {
    const { GET } = await loadSession("not-found");
    const res = await GET(getReq(), ctx("rv_missing"));
    assert.equal(res.status, 404);
  });
});
