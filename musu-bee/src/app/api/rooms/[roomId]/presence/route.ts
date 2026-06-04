import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { saveNodeCandidateSet } from "@/lib/p2pRendezvousStore";
import {
  ROOM_PRESENCE_STATUSES,
  createRoomPresence,
  queryRoomPresence,
  roomPresenceToCandidateSet,
  upsertRoomPresence,
  type RoomPresenceStatus,
} from "@/lib/roomPresenceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ roomId: string }> };

const MAX_CONTEXT_VALUE_CHARS = 160;

const CandidateEndpointSchema = z.object({
  kind: z.enum(["lan", "tailscale", "direct_quic", "relay", "failed"]),
  addr: z.string().min(1),
  observed_at: z.string().min(1).optional(),
  scheme: z.enum(["http", "https"]).nullable().optional(),
});

const RoomPresenceSchema = z.object({
  node_id: z.string().min(1),
  node_name: z.string().min(1).optional(),
  app_version: z.string().min(1).optional(),
  status: z.enum(ROOM_PRESENCE_STATUSES).optional(),
  company_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  source_agent_id: z.string().min(1).optional(),
  active_work_order_ids: z.array(z.string().min(1)).max(32).optional(),
  candidate_endpoints: z.array(CandidateEndpointSchema).max(32).optional(),
  relay_capable: z.boolean().optional(),
  public_key: z.string().optional(),
  capabilities: z.array(z.string().min(1)).max(64).optional(),
  origin: z.string().min(1).optional(),
}).passthrough();

function normalizeContextValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, MAX_CONTEXT_VALUE_CHARS).join("");
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(parsed, 500);
}

function parsePresenceStatus(value: string | null): RoomPresenceStatus | undefined {
  return ROOM_PRESENCE_STATUSES.includes(value as RoomPresenceStatus)
    ? (value as RoomPresenceStatus)
    : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

async function roomIdFrom(ctx: Ctx): Promise<string | null> {
  const { roomId } = await ctx.params;
  return normalizeContextValue(roomId);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const room_id = await roomIdFrom(ctx);
  if (!room_id) {
    return NextResponse.json({ ok: false, error: "room_id required" }, { status: 400 });
  }

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

  const parsed = RoomPresenceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_room_presence",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const presence = createRoomPresence({
      ...parsed.data,
      owner_key: p2pControlPrincipal(req).owner_key,
      room_id,
      origin: parsed.data.origin ?? "musu.pro",
    });
    await upsertRoomPresence(presence);
    await saveNodeCandidateSet(roomPresenceToCandidateSet(presence));
    return NextResponse.json(
      {
        ok: true,
        room_id,
        presence,
        candidate_cache_seeded: true,
      },
      { status: 201 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      {
        ok: false,
        error: detail === "node_id_required" ? detail : "room_presence_store_failed",
        detail,
      },
      { status: detail === "node_id_required" ? 400 : 503 }
    );
  }
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const room_id = await roomIdFrom(ctx);
  if (!room_id) {
    return NextResponse.json({ ok: false, error: "room_id required" }, { status: 400 });
  }

  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  const search = req.nextUrl.searchParams;
  try {
    const presence = await queryRoomPresence(room_id, {
      owner_key: p2pControlPrincipal(req).owner_key,
      limit: parseLimit(search.get("limit")),
      company_id: normalizeContextValue(search.get("company_id")) ?? undefined,
      project_id: normalizeContextValue(search.get("project_id")) ?? undefined,
      node_id: normalizeContextValue(search.get("node_id")) ?? undefined,
      source_agent_id: normalizeContextValue(search.get("source_agent_id")) ?? undefined,
      status: parsePresenceStatus(search.get("status")),
      include_expired: parseBoolean(search.get("include_expired")) ?? false,
    });
    return NextResponse.json({
      ok: true,
      room_id,
      presence_order: "last_seen_desc",
      count: presence.length,
      presence,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "room_presence_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
