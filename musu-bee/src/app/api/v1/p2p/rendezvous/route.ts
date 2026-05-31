import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl } from "@/lib/p2pControlAuth";
import {
  createRendezvousSession,
  loadNodeCandidateSet,
  saveRendezvousSession,
} from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateRendezvousSchema = z.object({
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  requested_capability: z.string().min(1).nullable().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateRendezvousSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_rendezvous_request",
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
      loadNodeCandidateSet(parsed.data.source_node_id),
      loadNodeCandidateSet(parsed.data.target_node_id),
    ]);
    const session = createRendezvousSession(parsed.data, {
      source: sourceSeed,
      target: targetSeed,
    });
    await saveRendezvousSession(session);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "rendezvous_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
