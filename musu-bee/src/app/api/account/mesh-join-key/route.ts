import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUser } from "@/lib/auth-server";
import { checkMeshJoinRateLimit } from "@/lib/meshJoinRateLimit";
import {
  HeadscaleProvisioningError,
  provisionMeshJoinKey,
} from "@/lib/headscaleProvisioning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/mesh-join-key
 *
 * "Account login = automatic mesh join": the desktop CLI calls this right after
 * a successful login to obtain a one-time Headscale preauth key bound to the
 * caller's account, then runs `tailscale up --login-server --authkey`. No
 * device-add pass is copied between machines — every device of the same account
 * lands in the same isolated fleet.
 *
 * Security model mirrors the existing single-owner control-plane endpoints:
 *  - identity strictly from getUser().id server-side (request body cannot set it)
 *  - same-origin / CSRF guard (this POST mints a real credential)
 *  - fail-closed config gate: no Headscale API config → 503, never a silent allow
 *  - fail-closed enrollment allowlist (MUSU_MESH_ENROLL_USER_IDS), symmetric with
 *    device-approve's MUSU_DEVICE_APPROVER_USER_IDS
 *  - per-account rate limit (each mint creates a key on the control plane)
 *  - the Headscale admin API key lives only in server env, never returned
 */

const RequestSchema = z
  .object({
    // Optional cosmetic node name; never affects identity or auth.
    node_name: z.string().min(1).max(128).optional(),
  })
  .strict();

/** Comma/space/semicolon-separated allowlist parser (same shape as device-approve). */
function allowedEnrollUserIds(): string[] {
  return (process.env.MUSU_MESH_ENROLL_USER_IDS ?? "")
    .split(/[,\s;]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function siteOrigins(): Set<string> {
  const origins = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      /* ignore malformed env */
    }
  }
  return origins;
}

/**
 * Same-origin guard (CSRF). Mirrors device/approve/route.ts: require an Origin
 * (or Referer fallback) matching the site origin or the request's own origin.
 * A state-changing request with neither header is rejected.
 */
function isSameOrigin(req: NextRequest): boolean {
  const allowed = siteOrigins();
  allowed.add(req.nextUrl.origin);

  const originHeader = req.headers.get("origin");
  if (originHeader) {
    return allowed.has(originHeader);
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

const DEFAULT_TTL_SECONDS = 600;

function joinKeyTtlSeconds(): number {
  const configured = Number(process.env.MESH_JOIN_KEY_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_SECONDS;
  return Math.max(60, Math.floor(configured));
}

export async function POST(req: NextRequest) {
  // CSRF / same-origin before any state change or provisioning call.
  if (!isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "cross_origin_rejected" }, { status: 403 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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

  // Fail-closed enrollment allowlist, symmetric with device-approve.
  const allowlist = allowedEnrollUserIds();
  if (allowlist.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "mesh_enroll_not_configured",
        detail: "MUSU_MESH_ENROLL_USER_IDS is unset; all mesh enrollments are denied (fail-closed)",
      },
      { status: 503 }
    );
  }
  if (!allowlist.includes(user.id)) {
    return NextResponse.json(
      { ok: false, error: "enroll_not_allowlisted" },
      { status: 403 }
    );
  }

  // Per-account rate limit (each mint creates a control-plane key).
  const rate = checkMeshJoinRateLimit(user.id);
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

  try {
    const result = await provisionMeshJoinKey({
      apiUrl,
      apiKey,
      loginServer,
      accountUserId: user.id,
      ttlSeconds: joinKeyTtlSeconds(),
      nowMs: Date.now(),
    });

    // Audit (M-1): who enrolled, when. Never log the key itself.
    console.log(
      `[mesh-join-key] minted for account=${user.id} tailnet=${result.tailnet} ttl=${joinKeyTtlSeconds()}s`
    );

    return NextResponse.json({
      ok: true,
      login_server: result.loginServer,
      authkey: result.authkey,
      tailnet: result.tailnet,
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
