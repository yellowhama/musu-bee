import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
  encryption: z.string(),
  payload_transited_musu_infra: z.boolean(),
  result: z.enum(["success", "failed"]),
  failure_class: z.string().nullable().optional(),
  recorded_at: z.string().min(1),
}).passthrough();

type RouteEvidence = z.infer<typeof RouteEvidenceSchema>;

const LEGACY_ENCRYPTION = new Set(["", "none", "http", "none_http_bearer", "unknown"]);

function configuredToken(): string {
  return (
    process.env.MUSU_P2P_CONTROL_TOKEN?.trim() ||
    process.env.MUSU_ROUTE_EVIDENCE_TOKEN?.trim() ||
    process.env.MUSU_TOKEN?.trim() ||
    ""
  );
}

function bearerToken(req: NextRequest): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

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

export async function POST(req: NextRequest) {
  const expectedToken = configuredToken();
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: "route_evidence_auth_not_configured" },
      { status: 503 }
    );
  }

  if (bearerToken(req) !== expectedToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      stored: false,
      release_grade: blockers.length === 0,
      blockers,
      recorded_at: parsed.data.recorded_at,
    },
    { status: 202 }
  );
}
