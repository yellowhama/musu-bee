import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  createRendezvousSession,
  loadNodeCandidateSet,
  saveRendezvousSession,
} from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ roomId: string }> };

const RoomRendezvousSchema = z.object({
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  requested_capability: z.string().min(1).nullable().optional(),
  company_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  work_order_id: z.string().min(1).optional(),
}).passthrough();

function normalizeContextValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 128);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { roomId } = await ctx.params;
  const room_id = normalizeContextValue(roomId);
  if (!room_id) {
    return NextResponse.json({ ok: false, error: "room_id required" }, { status: 400 });
  }

  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const ownerKey = p2pControlPrincipal(req).owner_key;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = RoomRendezvousSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_room_rendezvous_request",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const [sourceSeed, targetSeed] = await Promise.all([
      loadNodeCandidateSet(ownerKey, parsed.data.source_node_id),
      loadNodeCandidateSet(ownerKey, parsed.data.target_node_id),
    ]);
    const session = createRendezvousSession(
      {
        owner_key: ownerKey,
        source_node_id: parsed.data.source_node_id,
        target_node_id: parsed.data.target_node_id,
        requested_capability: parsed.data.requested_capability ?? null,
        company_id: normalizeContextValue(parsed.data.company_id),
        project_id: normalizeContextValue(parsed.data.project_id),
        room_id,
        work_order_id: normalizeContextValue(parsed.data.work_order_id),
        origin: "musu.pro",
      },
      {
        source: sourceSeed,
        target: targetSeed,
      }
    );
    await saveRendezvousSession(session);
    return NextResponse.json(
      {
        ok: true,
        room_id,
        origin: "musu.pro",
        session,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "room_rendezvous_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
