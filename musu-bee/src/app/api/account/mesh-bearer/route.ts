import { NextRequest, NextResponse } from "next/server";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { deriveMeshBearer, meshBearerConfigured } from "@/lib/meshBearer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/account/mesh-bearer
 *
 * V31: the bearer-only sibling of `/api/account/mesh-join-key`. Returns ONLY the
 * account's shared mesh bearer — a pure deterministic HMAC of the owner key
 * (`deriveMeshBearer`) — with NO Headscale preauth-key provisioning and NO rate
 * limit. The bridge's heartbeat loop calls this every cycle to AUTO-RECONCILE
 * its `~/.musu/mesh.env`: if the on-disk bearer is missing OR differs (e.g. a
 * reinstalled machine still holding its per-machine token), it re-fetches the
 * canonical account bearer and writes it, so cross-machine auth self-heals
 * without a manual `mesh join-account`.
 *
 * Why a separate endpoint (not reuse mesh-join-key): mesh-join-key MINTS a
 * Headscale preauth key on every call and is per-owner rate-limited — calling it
 * every heartbeat would churn the control plane and trip the limit. This handler
 * is a pure function of the owner key: no side effects, no rate limit needed.
 *
 *  - auth: authorizeP2pControl (same bearer control token as the other p2p
 *    endpoints; the token IS the CSRF defense — this is a CLI endpoint).
 *  - identity: owner_key derived from the bearer token (one owner = one bearer).
 *  - fail-closed: no server secret → 503 (the CLI then keeps its current bearer).
 *  - NEVER logs the bearer hex — presence only (mirrors mesh-join-key:124-127).
 */
export async function GET(req: NextRequest) {
  // Auth: single-owner control bearer token (NOT cookies — CLI endpoint).
  const denied = authorizeP2pControl(req);
  if (denied) return denied;

  // Fail-closed: without the server secret there is no account bearer to issue.
  if (!meshBearerConfigured()) {
    console.log("[mesh-bearer] request rejected: mesh_bearer=unconfigured");
    return NextResponse.json(
      { ok: false, error: "mesh_bearer_unconfigured" },
      { status: 503 }
    );
  }

  const ownerKey = p2pControlPrincipal(req).owner_key;
  const meshBearer = deriveMeshBearer(ownerKey);

  // Audit: presence only. NEVER log the bearer hex or the owner token.
  console.log(`[mesh-bearer] issued mesh_bearer=${meshBearer ? "issued" : "unconfigured"}`);

  return NextResponse.json({ ok: true, mesh_bearer: meshBearer });
}
