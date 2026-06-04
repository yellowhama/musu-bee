import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  ROOM_EVENT_TYPES,
  appendRoomEvent,
  createRoomEvent,
  queryRoomEvents,
  type RoomEventType,
} from "@/lib/roomEventStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ roomId: string }> };

const MAX_CONTEXT_VALUE_CHARS = 160;

const RoomEventSchema = z.object({
  event_type: z.enum(ROOM_EVENT_TYPES),
  company_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  work_order_id: z.string().min(1).optional(),
  source_node_id: z.string().min(1).optional(),
  source_agent_id: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  payload: z.unknown().optional(),
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
  return Math.min(parsed, 200);
}

function parseEventType(value: string | null): RoomEventType | undefined {
  return ROOM_EVENT_TYPES.includes(value as RoomEventType)
    ? (value as RoomEventType)
    : undefined;
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

  const parsed = RoomEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_room_event",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const event = createRoomEvent({
      ...parsed.data,
      owner_key: p2pControlPrincipal(req).owner_key,
      room_id,
      origin: parsed.data.origin ?? "musu.pro",
    });
    await appendRoomEvent(event);
    return NextResponse.json(
      {
        ok: true,
        room_id,
        event,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "room_event_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
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
    const events = await queryRoomEvents(room_id, {
      owner_key: p2pControlPrincipal(req).owner_key,
      limit: parseLimit(search.get("limit")),
      company_id: normalizeContextValue(search.get("company_id")) ?? undefined,
      project_id: normalizeContextValue(search.get("project_id")) ?? undefined,
      work_order_id: normalizeContextValue(search.get("work_order_id")) ?? undefined,
      source_node_id: normalizeContextValue(search.get("source_node_id")) ?? undefined,
      source_agent_id: normalizeContextValue(search.get("source_agent_id")) ?? undefined,
      event_type: parseEventType(search.get("event_type")),
      since: normalizeContextValue(search.get("since")) ?? undefined,
    });
    return NextResponse.json({
      ok: true,
      room_id,
      event_order: "newest_first",
      count: events.length,
      events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "room_event_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
