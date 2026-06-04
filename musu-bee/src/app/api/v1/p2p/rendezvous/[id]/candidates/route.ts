import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  saveNodeCandidateSet,
  updateRendezvousSession,
  upsertCandidateSet,
} from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const CandidateEndpointSchema = z.object({
  kind: z.enum(["lan", "tailscale", "direct_quic", "relay", "failed"]),
  addr: z.string().min(1),
  observed_at: z.string().min(1),
  scheme: z.enum(["http", "https"]).nullable().optional(),
});

const CandidatesSchema = z.object({
  node_id: z.string().min(1),
  candidate_endpoints: z.array(CandidateEndpointSchema).max(32),
  relay_capable: z.boolean(),
  node_name: z.string().min(1).optional(),
  app_version: z.string().min(1).optional(),
  public_key: z.string().optional(),
  capabilities: z.array(z.string().min(1)).max(64).optional(),
}).passthrough();

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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = CandidatesSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_rendezvous_candidates",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const session = await updateRendezvousSession(id, ownerKey, (current) =>
      upsertCandidateSet(current, parsed.data)
    );
    if (!session) {
      return NextResponse.json({ ok: false, error: "rendezvous_not_found" }, { status: 404 });
    }
    const candidateSet =
      session.source.node_id === parsed.data.node_id ? session.source : session.target;
    await saveNodeCandidateSet(ownerKey, candidateSet);
    return NextResponse.json(session);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      {
        ok: false,
        error: code === "node_not_in_rendezvous" ? code : "rendezvous_candidates_failed",
      },
      { status: code === "node_not_in_rendezvous" ? 400 : 503 }
    );
  }
}
