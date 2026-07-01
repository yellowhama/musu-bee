import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

// route.ts → meshBearer.ts imports `server-only`, which throws under the node
// test runner. Stub it before any dynamic import of the handler (mirrors the
// agents/route.test.ts + meshBearer.test.ts pattern).
const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
};

// All env keys either handler path reads, so each test starts from a clean slate
// and never leaks config into the next (the 503-unconfigured path in particular
// must see NO mesh-bearer secret).
const ENV_KEYS = [
  "MUSU_MESH_BEARER_SECRET",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

async function loadGetHandler(caseName: string): Promise<Module["GET"]> {
  // Fresh import each call so env is read at call time (the handler + its deps
  // read process.env live, not at module-eval time).
  const mod = (await import(`./route?case=${caseName}-${Date.now()}`)) as Module;
  return mod.GET;
}

function getReq(token: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/account/mesh-bearer", {
    method: "GET",
    headers,
  });
}

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

// (a) auth-denied: a missing/wrong bearer must never reach the bearer-issuing
// branch. authorizeP2pControl rejects with 401 (token configured, none/wrong
// presented) before any owner_key is derived.
test("rejects unauthenticated requests before issuing a bearer (401)", async () => {
  // Auth is configured via the sha256 allowlist (NOT MUSU_P2P_CONTROL_TOKEN, so
  // the mesh-bearer secret fallback is irrelevant to the auth decision here).
  const realToken = "owner-secret-token";
  const allowlistHash = createHash("sha256").update(realToken).digest("hex");
  await withEnv(
    {
      MUSU_P2P_CONTROL_TOKEN_SHA256S: allowlistHash,
      MUSU_MESH_BEARER_SECRET: "server-secret",
    },
    async () => {
      const GET = await loadGetHandler("auth-denied");

      // No bearer at all → 401.
      const resNoToken = await GET(getReq(null));
      assert.equal(resNoToken.status, 401);
      const bodyNoToken = (await resNoToken.json()) as { ok: boolean; mesh_bearer?: unknown };
      assert.equal(bodyNoToken.ok, false);
      assert.equal("mesh_bearer" in bodyNoToken, false);

      // Wrong bearer → 401.
      const resWrong = await GET(getReq("not-the-right-token"));
      assert.equal(resWrong.status, 401);
      const bodyWrong = (await resWrong.json()) as { ok: boolean; mesh_bearer?: unknown };
      assert.equal(bodyWrong.ok, false);
      assert.equal("mesh_bearer" in bodyWrong, false);
    },
  );
});

// (b) 503-unconfigured: authenticated, but the server has NO mesh-bearer secret,
// so there is nothing to issue. Fail-closed with 503 and no bearer in the body.
test("returns 503 when the mesh bearer secret is unconfigured", async () => {
  // Configure auth via the sha256 allowlist ONLY, so authorizeP2pControl passes
  // while meshBearerConfigured() stays false (no MESH_BEARER_SECRET and no
  // MUSU_P2P_CONTROL_TOKEN fallback).
  const realToken = "owner-secret-token";
  const allowlistHash = createHash("sha256").update(realToken).digest("hex");
  await withEnv(
    { MUSU_P2P_CONTROL_TOKEN_SHA256S: allowlistHash },
    async () => {
      const GET = await loadGetHandler("unconfigured");
      const res = await GET(getReq(realToken));
      assert.equal(res.status, 503);
      const body = (await res.json()) as { ok: boolean; error?: string; mesh_bearer?: unknown };
      assert.equal(body.ok, false);
      assert.equal(body.error, "mesh_bearer_unconfigured");
      assert.equal("mesh_bearer" in body, false);
    },
  );
});

// (c) success: authenticated + secret present → a deterministic 64-hex bearer
// derived from the owner_key (HMAC-SHA256 over "musu.mesh_bearer.v1:"+owner_key).
// We assert the exact value to prove it is the real derivation, but the test
// computes it locally — the hex is NEVER exposed in any log assertion.
test("returns the derived 64-hex mesh bearer for an authenticated owner", async () => {
  const realToken = "owner-secret-token";
  const serverSecret = "server-mesh-secret";
  await withEnv(
    {
      MUSU_P2P_CONTROL_TOKEN: realToken,
      MUSU_MESH_BEARER_SECRET: serverSecret,
    },
    async () => {
      const GET = await loadGetHandler("success");
      const res = await GET(getReq(realToken));
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; mesh_bearer: string };
      assert.equal(body.ok, true);
      assert.match(body.mesh_bearer, /^[a-f0-9]{64}$/);

      // The bearer is a pure function of the owner_key derived from the bearer
      // token (owner_key = "token-sha256:" + sha256(token)), HMAC'd with the
      // server secret under the v1 domain separator. Recompute and compare so a
      // regression in the derivation (wrong secret/domain/owner_key) is caught.
      const ownerKey = `token-sha256:${createHash("sha256").update(realToken).digest("hex")}`;
      const expected = createHmac("sha256", serverSecret)
        .update("musu.mesh_bearer.v1:")
        .update(ownerKey)
        .digest("hex");
      assert.equal(body.mesh_bearer, expected);
    },
  );
});

// Identity binding: a different owner token yields a different bearer (one owner
// = one bearer), so two owners can never collide onto a shared mesh secret.
test("different owner tokens derive different bearers", async () => {
  const serverSecret = "server-mesh-secret";
  let bearerA = "";
  let bearerB = "";
  await withEnv(
    { MUSU_P2P_CONTROL_TOKEN: "owner-a-token", MUSU_MESH_BEARER_SECRET: serverSecret },
    async () => {
      const GET = await loadGetHandler("owner-a");
      const res = await GET(getReq("owner-a-token"));
      assert.equal(res.status, 200);
      bearerA = ((await res.json()) as { mesh_bearer: string }).mesh_bearer;
    },
  );
  await withEnv(
    { MUSU_P2P_CONTROL_TOKEN: "owner-b-token", MUSU_MESH_BEARER_SECRET: serverSecret },
    async () => {
      const GET = await loadGetHandler("owner-b");
      const res = await GET(getReq("owner-b-token"));
      assert.equal(res.status, 200);
      bearerB = ((await res.json()) as { mesh_bearer: string }).mesh_bearer;
    },
  );
  assert.match(bearerA, /^[a-f0-9]{64}$/);
  assert.match(bearerB, /^[a-f0-9]{64}$/);
  assert.notEqual(bearerA, bearerB);
});
