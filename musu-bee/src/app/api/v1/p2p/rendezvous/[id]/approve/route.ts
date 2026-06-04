import { NextRequest, NextResponse } from "next/server";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { updateRendezvousSession } from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function validSessionId(id: string): boolean {
  return Boolean(id) && !id.includes("/") && !id.includes("..");
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const ownerKey = p2pControlPrincipal(req).owner_key;

  const { id } = await ctx.params;
  if (!validSessionId(id)) {
    return NextResponse.json({ ok: false, error: "invalid_session_id" }, { status: 400 });
  }

  try {
    const approvedAt = new Date().toISOString();
    const session = await updateRendezvousSession(id, ownerKey, (current) => ({
      ...current,
      approval_required: false,
      status: "approved",
      approved_at: approvedAt,
    }));
    if (!session) {
      return NextResponse.json({ ok: false, error: "rendezvous_not_found" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "rendezvous_approve_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
