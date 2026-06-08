import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUser } from "@/lib/auth-server";
import { p2pControlOwnerKey } from "@/lib/p2pControlAuth";
import { approveDeviceCode } from "@/lib/deviceCodeStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ApproveSchema = z
  .object({
    user_code: z.string().min(1).max(64),
  })
  .strict();

/**
 * H-3: only Supabase users whose id is in MUSU_DEVICE_APPROVER_USER_IDS
 * (comma-separated) may approve a device. Fail-closed: if the env is unset OR
 * empty, NO ONE can approve. This is what makes the single-owner control plane
 * *enforced* rather than hoped — every approved device shares one owner_key
 * (the shared control token), so without the allowlist any logged-in user could
 * mint that shared token.
 */
function allowedApproverUserIds(): string[] {
  return (process.env.MUSU_DEVICE_APPROVER_USER_IDS ?? "")
    .split(/[,\s;]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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
 * M-1 (CSRF): the approve POST mutates the device flow and is authenticated by
 * the Supabase session cookie, so it must be same-origin. We require an Origin
 * (or fall back to Referer) header that matches the site origin — the request's
 * own origin is always acceptable, plus any configured NEXT_PUBLIC_APP_URL.
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

  // No Origin and no Referer: reject. Browsers send Origin on cross-origin
  // POSTs; a missing one on a state-changing request is treated as untrusted.
  return false;
}

/**
 * POST /api/v1/auth/device/approve
 * Body: { user_code }. Approves the pending device code identified by user_code.
 * The approving owner identity comes ONLY from getUser().id server-side (H-2
 * guard): the request body can never set who approved.
 */
export async function POST(req: NextRequest) {
  // M-1: CSRF / same-origin check before any state change.
  if (!isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "cross_origin_rejected" }, { status: 403 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // H-3: fail-closed allowlist enforcement.
  const allowlist = allowedApproverUserIds();
  if (allowlist.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "device_approval_not_configured",
        detail:
          "MUSU_DEVICE_APPROVER_USER_IDS is unset; all device approvals are denied (fail-closed)",
      },
      { status: 503 }
    );
  }
  if (!allowlist.includes(user.id)) {
    return NextResponse.json(
      { ok: false, error: "approver_not_allowlisted" },
      { status: 403 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = ApproveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_approve_request" }, { status: 400 });
  }

  // Every approved device shares ONE owner_key derived from the shared control
  // token (the same key the poll endpoint's issued token resolves to). The
  // allowlist above is what keeps this single-owner safe.
  const sharedOwnerKey = p2pControlOwnerKey("musu.device.shared-owner.v1");

  let result;
  try {
    result = await approveDeviceCode(parsed.data.user_code, sharedOwnerKey);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "device_code_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }

  switch (result.status) {
    case "approved":
      return NextResponse.json(
        { ok: true, approved: true, node_name: result.record.node_name },
        { status: 200 }
      );
    case "not_found":
      return NextResponse.json({ ok: false, error: "device_code_not_found" }, { status: 404 });
    case "expired":
      return NextResponse.json({ ok: false, error: "device_code_expired" }, { status: 410 });
    case "locked":
      return NextResponse.json(
        { ok: false, error: "device_code_locked", detail: "too many failed approval attempts" },
        { status: 423 }
      );
    case "not_pending":
    default:
      return NextResponse.json(
        { ok: false, error: "device_code_not_pending", attempt_count: result.attempt_count },
        { status: 409 }
      );
  }
}
