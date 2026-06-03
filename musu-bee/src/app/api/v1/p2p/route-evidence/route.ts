import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
  p2pRelayTransportProofStoreStatus,
  queryRelayTransportProofs,
} from "@/lib/p2pRelayTransportProofStore";
import {
  p2pRelayPayloadStoreStatus,
  queryRelayPayloads,
} from "@/lib/p2pRelayPayloadStore";
import { relayPayloadEndpointWired, relayTransportWired } from "@/lib/p2pRelayPolicy";
import {
  appendRouteEvidenceRecord,
  createRouteEvidenceId,
  queryRouteEvidenceRecords,
  type RouteEvidencePayload,
  type RouteEvidenceQuery,
} from "@/lib/routeEvidenceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RouteKindSchema = z.enum(["lan", "tailscale", "direct_quic", "relay", "failed"]);

const RelayFallbackSchema = z.object({
  direct_path_failed: z.boolean(),
  lease_requested: z.boolean(),
  status: z.enum([
    "skipped_no_token",
    "skipped_no_session",
    "denied",
    "issued",
    "failed",
    "timed_out",
  ]),
  lease_issued: z.boolean(),
  attempted_route_kinds: z.array(RouteKindSchema),
  requested_capability: z.string().min(1).nullable().optional(),
  policy: z.string().min(1).nullable().optional(),
  blockers: z.array(z.string().min(1)).optional(),
  lease_id: z.string().min(1).nullable().optional(),
  failure_class: z.string().min(1).nullable().optional(),
  payload_transport_attempted: z.boolean().optional(),
  payload_transport_proven: z.boolean().optional(),
  payload_transport_failure_class: z.string().min(1).nullable().optional(),
});

const RelayTransportProofSchema = z.object({
  schema: z.literal("musu.relay_transport_proof.v1"),
  session_id: z.string().min(1),
  lease_id: z.string().min(1),
  transport_kind: z.string().min(1),
  relay_url: z.string().min(1),
  tunnel_id: z.string().min(1),
  handshake_ms: z.number().int().nonnegative(),
  payload_bytes_transited: z.number().int().positive(),
  payload_transited_musu_infra: z.boolean(),
  encryption: z.string().min(1),
  transport_verified_by: z.string().min(1),
  opened_at: z.string().min(1),
  closed_at: z.string().min(1).nullable().optional(),
}).passthrough();

const RelayPayloadDeliveryProofSchema = z.object({
  schema: z.literal("musu.relay_payload_delivery_proof.v1"),
  payload_id: z.string().min(1),
  session_id: z.string().min(1),
  lease_id: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  tunnel_id: z.string().min(1),
  payload_sha256: z.string().min(1),
  payload_bytes: z.number().int().positive(),
  delivered_at: z.string().min(1),
}).passthrough();

const RouteEvidenceSchema = z.object({
  schema: z.literal("musu.route_evidence.v1"),
  version: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  session_id: z.string().min(1).nullable().optional(),
  route_kind: RouteKindSchema,
  candidate_addr: z.string().min(1),
  handshake_ms: z.number().int().nonnegative().nullable().optional(),
  total_attempt_ms: z.number().int().positive(),
  peer_identity_verified: z.boolean(),
  peer_identity_method: z.string().min(1).nullable().optional(),
  peer_public_key: z.string().min(1).nullable().optional(),
  encryption: z.string(),
  transport_verified_by: z.string().min(1).nullable().optional(),
  payload_transited_musu_infra: z.boolean(),
  result: z.enum(["success", "failed"]),
  failure_class: z.string().nullable().optional(),
  relay_fallback: RelayFallbackSchema.optional(),
  relay_transport_proof: RelayTransportProofSchema.optional(),
  relay_payload_delivery_proof: RelayPayloadDeliveryProofSchema.optional(),
  recorded_at: z.string().min(1),
}).passthrough();

type RouteEvidence = z.infer<typeof RouteEvidenceSchema> & RouteEvidencePayload;

const LEGACY_ENCRYPTION = new Set(["", "none", "http", "none_http_bearer", "unknown"]);
const RELEASE_GRADE_ENCRYPTION = new Set(["quic_tls_1_3"]);
const RELEASE_GRADE_TRANSPORT_VERIFIERS = new Set(["musu_quic_tls_transport"]);
const RELEASE_GRADE_RELAY_TRANSPORT_KINDS = new Set(["quic_relay_tunnel"]);

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sameRouteKindSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  for (const value of leftSet) {
    if (!rightSet.has(value)) {
      return false;
    }
  }
  return true;
}

async function relayLeaseStoreBlockers(evidence: RouteEvidence, ownerKey: string): Promise<string[]> {
  if (evidence.route_kind !== "relay") {
    return [];
  }

  const relay = evidence.relay_fallback;
  const leaseId = relay?.lease_id?.trim();
  if (!relay || relay.status !== "issued" || !relay.lease_issued || !leaseId) {
    return [];
  }

  if (!evidence.session_id?.trim()) {
    return ["relay_route_missing_session_id"];
  }

  try {
    const leases = await queryRelayLeases({
      owner_key: ownerKey,
      limit: 50,
      session_id: evidence.session_id,
      source_node_id: evidence.source_node_id,
      target_node_id: evidence.target_node_id,
    });
    const lease = leases.find((candidate) => candidate.lease_id === leaseId);
    if (!lease) {
      return ["relay_route_lease_not_found"];
    }
    const blockers: string[] = [];
    if (!sameRouteKindSet(lease.attempted_route_kinds, relay.attempted_route_kinds)) {
      blockers.push("relay_route_lease_attempts_mismatch");
    }
    const proofRelayUrl = evidence.relay_transport_proof?.relay_url.trim();
    if (proofRelayUrl && proofRelayUrl !== lease.relay_url.trim()) {
      blockers.push("relay_route_transport_proof_relay_url_mismatch");
    }
    return blockers;
  } catch (error) {
    return [`relay_route_lease_store_unavailable:${error instanceof Error ? error.message : "unknown"}`];
  }
}

function relayTransportProofBlockers(evidence: RouteEvidence): string[] {
  if (evidence.route_kind !== "relay") {
    return [];
  }

  const blockers: string[] = [];
  const proof = evidence.relay_transport_proof;
  if (!proof) {
    return ["relay_route_missing_transport_proof"];
  }

  const relayLeaseId = evidence.relay_fallback?.lease_id?.trim() ?? "";
  if (proof.lease_id.trim() !== relayLeaseId) {
    blockers.push("relay_route_transport_proof_lease_mismatch");
  }
  if (evidence.session_id?.trim() && proof.session_id.trim() !== evidence.session_id.trim()) {
    blockers.push("relay_route_transport_proof_session_mismatch");
  }
  if (!proof.relay_url.trim().startsWith("wss://")) {
    blockers.push("relay_route_transport_proof_relay_url_not_wss");
  }
  if (!RELEASE_GRADE_RELAY_TRANSPORT_KINDS.has(proof.transport_kind.trim())) {
    blockers.push("relay_route_transport_proof_kind_not_release_grade");
  }
  if (!proof.payload_transited_musu_infra) {
    blockers.push("relay_route_transport_proof_no_infra_transit");
  }
  if (proof.encryption.trim().toLowerCase() !== "quic_tls_1_3") {
    blockers.push("relay_route_transport_proof_not_quic_tls");
  }
  if (proof.transport_verified_by.trim() !== "musu_quic_tls_transport") {
    blockers.push("relay_route_transport_proof_not_verified");
  }
  const openedAt = parseIsoTimestamp(proof.opened_at);
  const closedAt = parseIsoTimestamp(proof.closed_at);
  if (openedAt === null) {
    blockers.push("relay_route_transport_proof_opened_at_invalid");
  }
  if (proof.closed_at?.trim() && closedAt === null) {
    blockers.push("relay_route_transport_proof_closed_at_invalid");
  }
  if (openedAt !== null && closedAt !== null && closedAt < openedAt) {
    blockers.push("relay_route_transport_proof_timestamp_order_invalid");
  }

  return blockers;
}

async function relayTransportProofStoreBlockers(
  evidence: RouteEvidence,
  ownerKey: string
): Promise<string[]> {
  if (evidence.route_kind !== "relay") {
    return [];
  }

  const proof = evidence.relay_transport_proof;
  if (!proof) {
    return [];
  }

  try {
    const blockers: string[] = [];
    const storeStatus = p2pRelayTransportProofStoreStatus();
    if (!storeStatus.release_grade) {
      blockers.push("relay_route_transport_proof_store_backend_not_release_grade");
    }
    const storedProofs = await queryRelayTransportProofs({
      owner_key: ownerKey,
      limit: 50,
      session_id: proof.session_id,
      lease_id: proof.lease_id,
      source_node_id: evidence.source_node_id,
      target_node_id: evidence.target_node_id,
      tunnel_id: proof.tunnel_id,
    });
    const storedProof = storedProofs.find((candidate) => (
      candidate.relay_url.trim() === proof.relay_url.trim() &&
      candidate.transport_kind.trim() === proof.transport_kind.trim() &&
      candidate.payload_bytes_transited === proof.payload_bytes_transited &&
      candidate.payload_transited_musu_infra === proof.payload_transited_musu_infra &&
      candidate.encryption.trim().toLowerCase() === proof.encryption.trim().toLowerCase() &&
      candidate.transport_verified_by.trim() === proof.transport_verified_by.trim()
    ));
    if (!storedProof) {
      blockers.push("relay_route_transport_proof_not_stored");
      return blockers;
    }
    if (!storedProof.release_grade) {
      blockers.push("relay_route_transport_proof_store_not_release_grade");
    }
    return blockers;
  } catch (error) {
    return [
      `relay_route_transport_proof_store_unavailable:${
        error instanceof Error ? error.message : "unknown"
      }`,
    ];
  }
}

function relayFallbackPayloadTransportBlockers(evidence: RouteEvidence): string[] {
  const relay = evidence.relay_fallback;
  if (!relay || relay.status !== "issued" || !relay.lease_issued) {
    return [];
  }

  const blockers: string[] = [];
  if (relay.payload_transport_attempted !== true) {
    blockers.push("relay_fallback_payload_transport_not_attempted");
  }
  if (relay.payload_transport_proven !== true) {
    blockers.push("relay_fallback_payload_transport_not_proven");
  }
  if (relay.payload_transport_failure_class?.trim() === "relay_payload_transport_not_implemented") {
    blockers.push("relay_fallback_payload_transport_not_implemented");
  }
  return blockers;
}

async function relayPayloadDeliveryProofBlockers(
  evidence: RouteEvidence,
  ownerKey: string
): Promise<string[]> {
  const relay = evidence.relay_fallback;
  if (!relay || relay.status !== "issued" || !relay.lease_issued) {
    return [];
  }
  if (relay.payload_transport_proven !== true) {
    return [];
  }

  const proof = evidence.relay_payload_delivery_proof;
  if (!proof) {
    return ["relay_fallback_payload_delivery_proof_missing"];
  }

  const blockers: string[] = [];
  if (evidence.session_id?.trim() && proof.session_id.trim() !== evidence.session_id.trim()) {
    blockers.push("relay_fallback_payload_delivery_proof_session_mismatch");
  }
  if (relay.lease_id?.trim() && proof.lease_id.trim() !== relay.lease_id.trim()) {
    blockers.push("relay_fallback_payload_delivery_proof_lease_mismatch");
  }
  if (proof.source_node_id.trim() !== evidence.source_node_id.trim()) {
    blockers.push("relay_fallback_payload_delivery_proof_source_mismatch");
  }
  if (proof.target_node_id.trim() !== evidence.target_node_id.trim()) {
    blockers.push("relay_fallback_payload_delivery_proof_target_mismatch");
  }
  const transportTunnelId = evidence.relay_transport_proof?.tunnel_id.trim();
  if (transportTunnelId && proof.tunnel_id.trim() !== transportTunnelId) {
    blockers.push("relay_fallback_payload_delivery_proof_tunnel_mismatch");
  }
  if (parseIsoTimestamp(proof.delivered_at) === null) {
    blockers.push("relay_fallback_payload_delivery_proof_delivered_at_invalid");
  }

  const storeStatus = p2pRelayPayloadStoreStatus();
  if (!storeStatus.release_grade) {
    blockers.push("relay_fallback_payload_store_backend_not_release_grade");
  }

  try {
    const payloads = await queryRelayPayloads({
      owner_key: ownerKey,
      limit: 50,
      session_id: proof.session_id,
      lease_id: proof.lease_id,
      source_node_id: proof.source_node_id,
      target_node_id: proof.target_node_id,
      tunnel_id: proof.tunnel_id,
      status: "delivered",
    });
    const storedPayload = payloads.find((payload) => payload.payload_id === proof.payload_id);
    if (!storedPayload) {
      blockers.push("relay_fallback_payload_delivery_proof_not_stored");
      return blockers;
    }
    if (storedPayload.payload_sha256.trim().toLowerCase() !== proof.payload_sha256.trim().toLowerCase()) {
      blockers.push("relay_fallback_payload_delivery_proof_sha256_mismatch");
    }
    if (storedPayload.payload_bytes !== proof.payload_bytes) {
      blockers.push("relay_fallback_payload_delivery_proof_bytes_mismatch");
    }
    if (!storedPayload.delivered_at?.trim()) {
      blockers.push("relay_fallback_payload_delivery_proof_stored_delivery_missing");
    } else if (storedPayload.delivered_at.trim() !== proof.delivered_at.trim()) {
      blockers.push("relay_fallback_payload_delivery_proof_delivered_at_mismatch");
    }
  } catch (error) {
    blockers.push(
      `relay_fallback_payload_delivery_proof_store_unavailable:${
        error instanceof Error ? error.message : "unknown"
      }`
    );
  }

  return blockers;
}

async function releaseBlockers(evidence: RouteEvidence, ownerKey: string): Promise<string[]> {
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
  if (!RELEASE_GRADE_ENCRYPTION.has(evidence.encryption.trim().toLowerCase())) {
    blockers.push("transport_not_release_grade_quic_tls");
  }
  if (
    RELEASE_GRADE_ENCRYPTION.has(evidence.encryption.trim().toLowerCase()) &&
    !RELEASE_GRADE_TRANSPORT_VERIFIERS.has(evidence.transport_verified_by?.trim() ?? "")
  ) {
    blockers.push("missing_release_grade_transport_proof");
  }
  if (evidence.route_kind === "relay" && !evidence.payload_transited_musu_infra) {
    blockers.push("relay_route_missing_infra_transit");
  }
  if (evidence.route_kind === "relay") {
    if (!relayTransportWired()) {
      blockers.push("relay_route_transport_not_wired");
    }
    if (!relayPayloadEndpointWired()) {
      blockers.push("relay_route_payload_endpoint_not_wired");
    }
    const relay = evidence.relay_fallback;
    if (!relay) {
      blockers.push("relay_route_missing_lease_proof");
    } else {
      if (!relay.direct_path_failed) {
        blockers.push("relay_route_missing_direct_failure");
      }
      if (!relay.lease_requested) {
        blockers.push("relay_route_missing_lease_request");
      }
      if (relay.status !== "issued" || !relay.lease_issued) {
        blockers.push("relay_route_lease_not_issued");
      }
      if (!relay.lease_id?.trim()) {
        blockers.push("relay_route_missing_lease_id");
      }
      if (!relay.attempted_route_kinds.some((kind) => kind !== "relay")) {
        blockers.push("relay_route_missing_direct_attempt");
      }
      if (relay.blockers?.length) {
        blockers.push("relay_route_lease_blocked");
      }
    }
    blockers.push(...relayTransportProofBlockers(evidence));
    blockers.push(...(await relayTransportProofStoreBlockers(evidence, ownerKey)));
  }
  if (evidence.route_kind !== "relay" && evidence.payload_transited_musu_infra) {
    blockers.push("direct_route_claims_infra_transit");
  }
  if (evidence.handshake_ms == null) {
    blockers.push("missing_handshake_timing");
  }

  blockers.push(...relayFallbackPayloadTransportBlockers(evidence));
  blockers.push(...(await relayPayloadDeliveryProofBlockers(evidence, ownerKey)));
  blockers.push(...(await relayLeaseStoreBlockers(evidence, ownerKey)));
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
  const principal = p2pControlPrincipal(req);

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

  const blockers = await releaseBlockers(parsed.data, principal.owner_key);
  const receivedAt = new Date().toISOString();
  const evidenceId = createRouteEvidenceId();
  try {
    await appendRouteEvidenceRecord({
      id: evidenceId,
      owner_key: principal.owner_key,
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
      owner_scoped: true,
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
  const principal = p2pControlPrincipal(req);

  const params = req.nextUrl.searchParams;
  const query: RouteEvidenceQuery = {
    owner_key: principal.owner_key,
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
      owner_scoped: true,
      count: records.length,
      records: records.map(({ owner_key: _ownerKey, ...record }) => record),
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
