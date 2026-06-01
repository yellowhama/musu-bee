import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

export function configuredP2pControlToken(): string {
  return (
    process.env.MUSU_P2P_CONTROL_TOKEN?.trim() ||
    process.env.MUSU_ROUTE_EVIDENCE_TOKEN?.trim() ||
    process.env.MUSU_TOKEN?.trim() ||
    ""
  );
}

export function configuredP2pControlTokenHashes(): string[] {
  const raw = [
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256S,
    process.env.MUSU_P2P_CONTROL_TOKEN_SHA256,
  ]
    .filter(Boolean)
    .join(",");

  return raw
    .split(/[,\s;]+/)
    .map((value) => value.trim().replace(/^sha256:/i, "").toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/.test(value));
}

export type P2pControlPrincipal = {
  owner_key: string;
};

export function bearerToken(req: NextRequest): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

export function p2pControlOwnerKey(token: string): string {
  return `token-sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function configuredAuthModes(): string[] {
  const modes: string[] = [];
  if (configuredP2pControlToken()) {
    modes.push("static_bearer_token");
  }
  if (configuredP2pControlTokenHashes().length > 0) {
    modes.push("sha256_bearer_token_allowlist");
  }
  return modes;
}

export function authorizeP2pControl(req: NextRequest): NextResponse | null {
  const expectedToken = configuredP2pControlToken();
  const expectedTokenHashes = configuredP2pControlTokenHashes();
  const acceptedAuthModes = configuredAuthModes();
  if (!expectedToken && expectedTokenHashes.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "p2p_control_auth_not_configured",
        accepted_auth_modes: acceptedAuthModes,
      },
      { status: 503 }
    );
  }

  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", accepted_auth_modes: acceptedAuthModes },
      { status: 401 }
    );
  }

  if (expectedToken && timingSafeStringEqual(token, expectedToken)) {
    return null;
  }

  const presentedHash = tokenHash(token);
  if (expectedTokenHashes.some((hash) => timingSafeStringEqual(presentedHash, hash))) {
    return null;
  }

  return NextResponse.json(
    { ok: false, error: "unauthorized", accepted_auth_modes: acceptedAuthModes },
    { status: 401 }
  );
}

export function p2pControlPrincipal(req: NextRequest): P2pControlPrincipal {
  return {
    owner_key: p2pControlOwnerKey(bearerToken(req)),
  };
}
