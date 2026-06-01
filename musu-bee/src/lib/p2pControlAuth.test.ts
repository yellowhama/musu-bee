import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";

import { authorizeP2pControl, p2pControlPrincipal } from "./p2pControlAuth";

const ENV_KEYS = [
  "MUSU_P2P_CONTROL_TOKEN",
  "MUSU_P2P_CONTROL_TOKEN_SHA256",
  "MUSU_P2P_CONTROL_TOKEN_SHA256S",
  "MUSU_ROUTE_EVIDENCE_TOKEN",
  "MUSU_TOKEN",
] as const;

function req(token: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/v1/p2p/relay/lease", { headers });
}

async function withP2pAuthEnv(fn: () => Promise<void> | void): Promise<void> {
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("accepts static P2P control bearer token", async () => {
  await withP2pAuthEnv(() => {
    process.env.MUSU_P2P_CONTROL_TOKEN = "control-token";
    assert.equal(authorizeP2pControl(req("control-token")), null);
  });
});

test("accepts SHA-256 allowlisted runtime bearer token without storing raw token", async () => {
  await withP2pAuthEnv(() => {
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = `sha256:${sha256("runtime-account-token")}`;
    assert.equal(authorizeP2pControl(req("runtime-account-token")), null);
    assert.equal(
      p2pControlPrincipal(req("runtime-account-token")).owner_key,
      `token-sha256:${sha256("runtime-account-token")}`
    );
  });
});

test("rejects missing and wrong P2P control bearer token", async () => {
  await withP2pAuthEnv(async () => {
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S = sha256("runtime-account-token");

    const missing = authorizeP2pControl(req(null));
    assert.equal(missing?.status, 401);
    assert.deepEqual(await missing?.json(), {
      ok: false,
      error: "unauthorized",
      accepted_auth_modes: ["sha256_bearer_token_allowlist"],
    });

    const wrong = authorizeP2pControl(req("wrong-token"));
    assert.equal(wrong?.status, 401);
    const wrongBody = (await wrong?.json()) as { accepted_auth_modes: string[] };
    assert.deepEqual(wrongBody.accepted_auth_modes, ["sha256_bearer_token_allowlist"]);
  });
});

test("reports unconfigured P2P control auth only when no raw token or hash allowlist exists", async () => {
  await withP2pAuthEnv(async () => {
    const res = authorizeP2pControl(req("anything"));
    assert.equal(res?.status, 503);
    assert.deepEqual(await res?.json(), {
      ok: false,
      error: "p2p_control_auth_not_configured",
      accepted_auth_modes: [],
    });
  });
});
