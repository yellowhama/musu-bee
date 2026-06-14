import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach, beforeEach, mock } from "node:test";
import { NextRequest } from "next/server";

// Mutable handle so each test sets the Supabase user getUser() returns.
let currentUser: { id: string } | null = null;

mock.module("@/lib/auth-server", {
  namedExports: {
    getUser: async () => currentUser,
    getUserFromRequest: async () => currentUser,
  },
});

type StartPollModule = { POST: (req: NextRequest) => Promise<Response> };
type ApproveModule = { POST: (req: NextRequest) => Promise<Response> };

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "MUSU_DEVICE_CODE_STORE_PATH",
  "MUSU_DEVICE_CODE_TTL_SEC",
  "MUSU_DEVICE_APPROVER_USER_IDS",
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
  "NEXT_PUBLIC_APP_URL",
] as const;

const SITE_ORIGIN = "https://musu.test";
let tempDir: string;
const previousEnv = new Map<(typeof ENV_KEYS)[number], string | undefined>();

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "musu-device-code-"));
  for (const key of ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MUSU_DEVICE_CODE_STORE_PATH = join(tempDir, "device-codes.json");
  process.env.NEXT_PUBLIC_APP_URL = SITE_ORIGIN;
  process.env.MUSU_P2P_CONTROL_TOKEN = "shared-control-token";
  process.env.MUSU_DEVICE_APPROVER_USER_IDS = "owner-1, owner-2";
  currentUser = null;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const prev = previousEnv.get(key);
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
  await rm(tempDir, { recursive: true, force: true });
});

async function loadDeviceRoute(): Promise<StartPollModule> {
  return (await import("@/app/api/v1/auth/device/route")) as unknown as StartPollModule;
}
async function loadApproveRoute(): Promise<ApproveModule> {
  return (await import(
    "@/app/api/v1/auth/device/approve/route"
  )) as unknown as ApproveModule;
}

function startReq(body: unknown = {}): NextRequest {
  return new NextRequest(`${SITE_ORIGIN}/api/v1/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pollReq(deviceCode: string): NextRequest {
  return new NextRequest(`${SITE_ORIGIN}/api/v1/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });
}

function approveReq(userCode: string, origin: string | null = SITE_ORIGIN): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) {
    headers.Origin = origin;
  }
  return new NextRequest(`${SITE_ORIGIN}/api/v1/auth/device/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_code: userCode }),
  });
}

async function startFlow(): Promise<{ userCode: string; deviceCode: string }> {
  const { POST } = await loadDeviceRoute();
  const res = await POST(startReq({ node_name: "test-node" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user_code: string; device_code: string; interval: number };
  assert.equal(body.interval, 5);
  return { userCode: body.user_code, deviceCode: body.device_code };
}

test("start returns the device contract shape", async () => {
  const { POST } = await loadDeviceRoute();
  const res = await POST(startReq({ node_name: "laptop" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body.user_code, "string");
  assert.equal(typeof body.device_code, "string");
  assert.equal(body.verification_uri, `${SITE_ORIGIN}/link`);
  assert.equal(body.expires_in, 900);
  assert.equal(body.interval, 5);
});

test("poll before approve returns 202 pending", async () => {
  const { deviceCode } = await startFlow();
  const { POST } = await loadDeviceRoute();
  const res = await POST(pollReq(deviceCode));
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { status: "pending" });
});

test("approve by a non-allowlisted user is denied (H-3)", async () => {
  const { userCode } = await startFlow();
  currentUser = { id: "intruder" };
  const { POST } = await loadApproveRoute();
  const res = await POST(approveReq(userCode));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "approver_not_allowlisted");
});

test("approve with no allowlist env is fail-closed (H-3)", async () => {
  const { userCode } = await startFlow();
  delete process.env.MUSU_DEVICE_APPROVER_USER_IDS;
  currentUser = { id: "owner-1" };
  const { POST } = await loadApproveRoute();
  const res = await POST(approveReq(userCode));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "device_approval_not_configured");
});

test("cross-origin approve is rejected (M-1)", async () => {
  const { userCode } = await startFlow();
  currentUser = { id: "owner-1" };
  const { POST } = await loadApproveRoute();
  const res = await POST(approveReq(userCode, "https://evil.example"));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "cross_origin_rejected");
});

test("approve with no Origin/Referer header is rejected (M-1)", async () => {
  const { userCode } = await startFlow();
  currentUser = { id: "owner-1" };
  const { POST } = await loadApproveRoute();
  const res = await POST(approveReq(userCode, null));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "cross_origin_rejected");
});

test("full flow: approve then poll yields the shared token, second poll is 410", async () => {
  const { userCode, deviceCode } = await startFlow();
  currentUser = { id: "owner-2" };

  const approve = await loadApproveRoute();
  const approveRes = await approve.POST(approveReq(userCode));
  assert.equal(approveRes.status, 200);
  assert.equal((await approveRes.json()).approved, true);

  const device = await loadDeviceRoute();
  const pollRes = await device.POST(pollReq(deviceCode));
  assert.equal(pollRes.status, 200);
  assert.equal((await pollRes.json()).token, "shared-control-token");

  // Second poll after consume -> 410 Gone.
  const pollAgain = await device.POST(pollReq(deviceCode));
  assert.equal(pollAgain.status, 410);
  assert.equal((await pollAgain.json()).status, "expired");
});

test("poll issues 503 when only the SHA256 allowlist is configured", async () => {
  const { userCode, deviceCode } = await startFlow();
  delete process.env.MUSU_P2P_CONTROL_TOKEN;
  process.env.MUSU_P2P_CONTROL_TOKEN_SHA256 = "a".repeat(64);
  currentUser = { id: "owner-1" };

  const approve = await loadApproveRoute();
  assert.equal((await approve.POST(approveReq(userCode))).status, 200);

  const device = await loadDeviceRoute();
  const pollRes = await device.POST(pollReq(deviceCode));
  assert.equal(pollRes.status, 503);
  assert.equal((await pollRes.json()).error, "p2p_control_token_not_issuable");
});
