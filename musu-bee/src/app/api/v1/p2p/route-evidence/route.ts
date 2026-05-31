import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl } from "@/lib/p2pControlAuth";
import {
  appendRouteEvidenceRecord,
  createRouteEvidenceId,
  queryRouteEvidenceRecords,
  type RouteEvidencePayload,
  type RouteEvidenceQuery,
} from "@/lib/routeEvidenceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RouteEvidenceSchema = z.object({
  schema: z.literal("musu.route_evidence.v1"),
  version: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  session_id: z.string().min(1).nullable().optional(),
  route_kind: z.enum(["lan", "tailscale", "direct_quic", "relay", "failed"]),
  candidate_addr: z.string().min(1),
  handshake_ms: z.number().int().nonnegative().nullable().optional(),
  total_attempt_ms: z.number().int().positive(),
  peer_identity_verified: z.boolean(),
  peer_identity_method: z.string().min(1).nullable().optional(),
  peer_public_key: z.string().min(1).nullable().optional(),
  encryption: z.string(),
  payload_transited_musu_infra: z.boolean(),
  result: z.enum(["success", "failed"]),
  failure_class: z.string().nullable().optional(),
  recorded_at: z.string().min(1),
}).passthrough();

type RouteEvidence = z.infer<typeof RouteEvidenceSchema> & RouteEvidencePayload;

const LEGACY_ENCRYPTION = new Set(["", "none", "http", "none_http_bearer", "unknown"]);

function releaseBlockers(evidence: RouteEvidence): string[] {
  const blockers: string[] = [];

  if (evidence.result !== "success") {
    blockers.push("route_attempt_failed");
  }
  if (evidence.route_kind === "failed") {
    blockers.push("route_kind_failed");
  }
  if (!evidence.peer_identity_verified) {
    blockers.push("peer_identity_unverified");
  }
  if (
    evidence.peer_identity_verified &&
    (!evidence.peer_identity_method?.trim() || !evidence.peer_public_key?.trim())
  ) {
    blockers.push("missing_peer_identity_proof");
  }
  if (LEGACY_ENCRYPTION.has(evidence.encryption.trim().toLowerCase())) {
    blockers.push("legacy_or_missing_encryption");
  }
  if (evidence.route_kind === "relay" && !evidence.payload_transited_musu_infra) {
    blockers.push("relay_route_missing_infra_transit");
  }
  if (evidence.route_kind !== "relay" && evidence.payload_transited_musu_infra) {
    blockers.push("direct_route_claims_infra_transit");
  }
  if (evidence.handshake_ms == null) {
    blockers.push("missing_handshake_timing");
  }

  return blockers;
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseReleaseGrade(value: string | null): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

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

  const parsed = RouteEvidenceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_route_evidence",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const blockers = releaseBlockers(parsed.data);
  const receivedAt = new Date().toISOString();
  const evidenceId = createRouteEvidenceId();
  try {
    await appendRouteEvidenceRecord({
      id: evidenceId,
      received_at: receivedAt,
      release_grade: blockers.length === 0,
      blockers,
      evidence: parsed.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "route_evidence_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      stored: true,
      evidence_id: evidenceId,
      release_grade: blockers.length === 0,
      blockers,
      recorded_at: parsed.data.recorded_at,
      received_at: receivedAt,
    },
    { status: 202 }
  );
}

export async function GET(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  const params = req.nextUrl.searchParams;
  const query: RouteEvidenceQuery = {
    limit: parseLimit(params.get("limit")),
    source_node_id: params.get("source_node_id") ?? undefined,
    target_node_id: params.get("target_node_id") ?? undefined,
    route_kind: RouteEvidenceSchema.shape.route_kind.safeParse(params.get("route_kind")).success
      ? (params.get("route_kind") as RouteEvidenceQuery["route_kind"])
      : undefined,
    result: RouteEvidenceSchema.shape.result.safeParse(params.get("result")).success
      ? (params.get("result") as RouteEvidenceQuery["result"])
      : undefined,
    release_grade: parseReleaseGrade(params.get("release_grade")),
  };

  try {
    const records = await queryRouteEvidenceRecords(query);
    return NextResponse.json({
      ok: true,
      count: records.length,
      records,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "route_evidence_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
