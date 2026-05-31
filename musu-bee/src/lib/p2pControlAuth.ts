import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export function configuredP2pControlToken(): string {
  return (
    process.env.MUSU_P2P_CONTROL_TOKEN?.trim() ||
    process.env.MUSU_ROUTE_EVIDENCE_TOKEN?.trim() ||
    process.env.MUSU_TOKEN?.trim() ||
    ""
  );
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

export function authorizeP2pControl(req: NextRequest): NextResponse | null {
  const expectedToken = configuredP2pControlToken();
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: "p2p_control_auth_not_configured" },
      { status: 503 }
    );
  }

  if (bearerToken(req) !== expectedToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return null;
}

export function p2pControlPrincipal(req: NextRequest): P2pControlPrincipal {
  return {
    owner_key: p2pControlOwnerKey(bearerToken(req)),
  };
}
