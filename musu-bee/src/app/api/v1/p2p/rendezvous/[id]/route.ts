import { NextRequest, NextResponse } from "next/server";

import { authorizeP2pControl } from "@/lib/p2pControlAuth";
import { getRendezvousSession } from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function validSessionId(id: string): boolean {
  return Boolean(id) && !id.includes("/") && !id.includes("..");
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  const { id } = await ctx.params;
  if (!validSessionId(id)) {
    return NextResponse.json({ ok: false, error: "invalid_session_id" }, { status: 400 });
  }

  try {
    const session = await getRendezvousSession(id);
    if (!session) {
      return NextResponse.json({ ok: false, error: "rendezvous_not_found" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "rendezvous_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
