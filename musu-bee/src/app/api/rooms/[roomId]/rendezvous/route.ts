import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  authorizeP2pControl,
  p2pControlPrincipal,
  p2pSourceNodeAuthBindingFields,
  p2pSourceNodeAuthMismatch,
} from "@/lib/p2pControlAuth";
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
}).strict();

const FORBIDDEN_ROOM_RENDEZVOUS_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function pathKey(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function forbiddenRoomRendezvousByteFields(
  value: unknown,
  path: PropertyKey[] = []
): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      forbiddenRoomRendezvousByteFields(entry, [...path, index])
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const childPath = [...path, key];
    if (
      FORBIDDEN_ROOM_RENDEZVOUS_BYTE_FIELDS.includes(
        key as (typeof FORBIDDEN_ROOM_RENDEZVOUS_BYTE_FIELDS)[number]
      )
    ) {
      return [pathKey(childPath)];
    }
    return forbiddenRoomRendezvousByteFields(entry, childPath);
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
  const principal = p2pControlPrincipal(req);
  const ownerKey = principal.owner_key;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const forbiddenFields = forbiddenRoomRendezvousByteFields(json);
  if (forbiddenFields.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "room_rendezvous_payload_bytes_not_accepted",
        forbidden_fields: forbiddenFields,
        next_steps: [
          "send only room rendezvous source, target, capability, and context metadata",
          "do not send payload bytes to /api/rooms/[roomId]/rendezvous",
          "use local P2P execution after web-assisted rendezvous selects a route",
        ],
      },
      { status: 400 }
    );
  }

  const parsed = RoomRendezvousSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_room_rendezvous_request",
        issues: publicZodIssues(parsed.error),
      },
      { status: 400 }
    );
  }

  const sourceNodeAuthMismatch = p2pSourceNodeAuthMismatch(
    principal,
    parsed.data.source_node_id
  );
  if (sourceNodeAuthMismatch) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        room_id,
        origin: "musu.pro",
        ...p2pSourceNodeAuthBindingFields(principal),
        error: sourceNodeAuthMismatch.error,
        bound_source_node_id: sourceNodeAuthMismatch.bound_source_node_id,
        declared_source_node_id: parsed.data.source_node_id,
      },
      { status: 403 }
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
