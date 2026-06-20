import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { checkMeshJoinRateLimit } from "@/lib/meshJoinRateLimit";
import { deriveMeshBearer } from "@/lib/meshBearer";
import {
  HeadscaleProvisioningError,
  headscaleUserNameForOwnerKey,
  provisionMeshJoinKey,
} from "@/lib/headscaleProvisioning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/mesh-join-key
 *
 * "Account login = automatic mesh join": the desktop CLI calls this right after
 * a successful login to obtain a one-time Headscale preauth key for the owner's
 * fleet, then runs `tailscale up --login-server --authkey`. No device-add pass
 * is copied between machines — every device of the same owner lands in the same
 * isolated fleet.
 *
 * This is a CLI endpoint (musu.exe), NOT a browser endpoint. It authenticates
 * with the single-owner control bearer token (the same token device-flow issues
 * to ~/.musu/token), exactly like the other p2p-control endpoints. There is no
 * cookie/same-origin involved — the bearer token IS the CSRF defense.
 *
 *  - auth: authorizeP2pControl (bearer control token / sha256 allowlist)
 *  - identity: owner_key derived from the bearer token (one owner = one fleet)
 *  - fail-closed config gate: no Headscale API config → 503
 *  - per-owner rate limit (each mint creates a key on the control plane)
 *  - the Headscale admin API key lives only in server env, never returned
 */

const RequestSchema = z
  .object({
    // Optional cosmetic node name; never affects identity or auth.
    node_name: z.string().min(1).max(128).optional(),
  })
  .strict();

const DEFAULT_TTL_SECONDS = 600;

function joinKeyTtlSeconds(): number {
  const configured = Number(process.env.MESH_JOIN_KEY_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_SECONDS;
  return Math.max(60, Math.floor(configured));
}

export async function POST(req: NextRequest) {
  // Auth: single-owner control bearer token (NOT cookies/same-origin — this is a
  // CLI endpoint). Same gate as the other p2p-control endpoints.
  const denied = authorizeP2pControl(req);
  if (denied) return denied;

  // Identity: one owner key per control token → one fleet → one acct user.
  const ownerKey = p2pControlPrincipal(req).owner_key;

  // Fail-closed config gate: without Headscale API access we cannot provision.
  const apiUrl = process.env.HEADSCALE_API_URL?.trim();
  const apiKey = process.env.HEADSCALE_API_KEY?.trim();
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "mesh_not_configured",
        detail: "HEADSCALE_API_URL / HEADSCALE_API_KEY unset; mesh enrollment is disabled (fail-closed)",
      },
      { status: 503 }
    );
  }

  // Per-owner rate limit (each mint creates a control-plane key).
  const rate = checkMeshJoinRateLimit(ownerKey);
  if (rate.limited) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  // Validate the (minimal) body; strict so no field can ever smuggle identity.
  let json: unknown = {};
  if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
  }
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const loginServer = process.env.HEADSCALE_LOGIN_SERVER?.trim() || apiUrl;

  let tailnetName: string;
  try {
    tailnetName = headscaleUserNameForOwnerKey(ownerKey);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_owner_key" }, { status: 400 });
  }

  try {
    const result = await provisionMeshJoinKey({
      apiUrl,
      apiKey,
      loginServer,
      tailnetName,
      ttlSeconds: joinKeyTtlSeconds(),
      nowMs: Date.now(),
    });

    // Account-wide mesh bearer: deterministic from owner_key, so every machine
    // of this owner receives the SAME bearer (the cross-machine bridge auth that
    // the per-machine random tokens could never agree on). Empty when no server
    // secret is configured — the CLI then falls back to its existing behavior.
    const meshBearer = deriveMeshBearer(ownerKey);

    // Audit (M-1): who enrolled, when. Never log the key, the owner token, or
    // the mesh bearer.
    console.log(
      `[mesh-join-key] minted tailnet=${result.tailnet} ttl=${joinKeyTtlSeconds()}s mesh_bearer=${meshBearer ? "issued" : "unconfigured"}`
    );

    return NextResponse.json({
      ok: true,
      login_server: result.loginServer,
      authkey: result.authkey,
      tailnet: result.tailnet,
      // Shared cross-machine bridge bearer (hex). Absent if server secret unset.
      ...(meshBearer ? { mesh_bearer: meshBearer } : {}),
    });
  } catch (err) {
    if (err instanceof HeadscaleProvisioningError) {
      // 400 from invalid account-id shape; 502 from control-plane failures.
      return NextResponse.json(
        { ok: false, error: "mesh_provisioning_failed" },
        { status: err.status === 400 ? 400 : 502 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "mesh_provisioning_failed" },
      { status: 502 }
    );
  }
}
