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
  public_addr: z.string().min(1).nullable().optional(),
  nat_type: z.enum([
    "unknown",
    "open_internet",
    "full_cone",
    "restricted_cone",
    "port_restricted_cone",
    "symmetric",
  ]).nullable().optional(),
  nat_observed_by: z.string().min(1).nullable().optional(),
  relay_url: z.string().min(1).nullable().optional(),
  relay_protocol: z.enum([
    "quic_relay_tunnel",
    "quic_tls_1_3",
    "websocket_tunnel",
    "store_forward_queue",
  ]).nullable().optional(),
}).strict();

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
}).strict();

const FORBIDDEN_ROOM_PRESENCE_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function pathKey(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function forbiddenRoomPresenceByteFields(
  value: unknown,
  path: PropertyKey[] = []
): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      forbiddenRoomPresenceByteFields(entry, [...path, index])
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const childPath = [...path, key];
    if (
      FORBIDDEN_ROOM_PRESENCE_BYTE_FIELDS.includes(
        key as (typeof FORBIDDEN_ROOM_PRESENCE_BYTE_FIELDS)[number]
      )
    ) {
      return [pathKey(childPath)];
    }
    return forbiddenRoomPresenceByteFields(entry, childPath);
  });
}

function publicZodIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.flatMap((issue) => {
    const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
    if (issue.code === "unrecognized_keys" && keys.length > 0) {
      return keys.map((key) => ({
        path: pathKey([...issue.path, String(key)]),
        message: issue.message,
      }));
    }
    return {
      path: issue.path.join("."),
      message: issue.message,
    };
  });
}

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
  const principal = p2pControlPrincipal(req);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const forbiddenFields = forbiddenRoomPresenceByteFields(json);
  if (forbiddenFields.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "room_presence_payload_bytes_not_accepted",
        forbidden_fields: forbiddenFields,
        next_steps: [
          "send only room presence, route candidate, NAT, relay descriptor, and capability metadata",
          "do not send payload bytes to /api/rooms/[roomId]/presence",
          "use room events or local P2P execution for work payloads",
        ],
      },
      { status: 400 }
    );
  }

  const parsed = RoomPresenceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_room_presence",
        issues: publicZodIssues(parsed.error),
      },
      { status: 400 }
    );
  }

  try {
    const presence = createRoomPresence({
      ...parsed.data,
      owner_key: principal.owner_key,
      room_id,
      origin: parsed.data.origin ?? "musu.pro",
    });
    await upsertRoomPresence(presence);
    await saveNodeCandidateSet(principal.owner_key, roomPresenceToCandidateSet(presence));
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
