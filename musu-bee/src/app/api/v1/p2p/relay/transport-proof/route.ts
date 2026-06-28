import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  authorizeP2pControl,
  p2pControlPrincipal,
  p2pSourceNodeAuthBindingFields,
  p2pSourceNodeAuthMismatch,
} from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
  appendRelayTransportProof,
  createRelayTransportProof,
  p2pRelayTransportProofStoreStatus,
  queryRelayTransportProofs,
} from "@/lib/p2pRelayTransportProofStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RELEASE_GRADE_RELAY_TRANSPORT_KINDS = new Set(["quic_relay_tunnel"]);
const RELEASE_GRADE_PEER_IDENTITY_METHODS = new Set(["quic_tls_cert_fingerprint"]);

const RelayTransportProofRequestSchema = z.object({
  schema: z.literal("musu.relay_transport_proof.v1"),
  session_id: z.string().min(1),
  lease_id: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  transport_kind: z.string().min(1),
  relay_url: z.string().min(1),
  tunnel_id: z.string().min(1),
  handshake_ms: z.number().int().nonnegative(),
  payload_bytes_transited: z.number().int().positive(),
  payload_transited_musu_infra: z.boolean(),
  peer_identity_verified: z.boolean(),
  peer_identity_method: z.string().min(1),
  peer_public_key: z.string().min(1),
  encryption: z.string().min(1),
  transport_verified_by: z.string().min(1),
  opened_at: z.string().min(1),
  closed_at: z.string().min(1).nullable().optional(),
}).strict();

type RelayTransportProofRequest = z.infer<typeof RelayTransportProofRequestSchema>;

const FORBIDDEN_RELAY_TRANSPORT_PROOF_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
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

function publicRecord<T extends { owner_key: string }>(record: T): Omit<T, "owner_key"> {
  const { owner_key: _ownerKey, ...publicProof } = record;
  return publicProof;
}

function forbiddenPayloadByteFields(json: unknown): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return [];
  }
  return FORBIDDEN_RELAY_TRANSPORT_PROOF_BYTE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(json, field)
  );
}

function proofContentBlockers(proof: RelayTransportProofRequest): string[] {
  const blockers: string[] = [];
  if (!proof.relay_url.trim().startsWith("wss://")) {
    blockers.push("relay_transport_proof_relay_url_not_wss");
  }
  if (!RELEASE_GRADE_RELAY_TRANSPORT_KINDS.has(proof.transport_kind.trim())) {
    blockers.push("relay_transport_proof_kind_not_release_grade");
  }
  if (!proof.payload_transited_musu_infra) {
    blockers.push("relay_transport_proof_no_infra_transit");
  }
  if (!proof.peer_identity_verified) {
    blockers.push("relay_transport_proof_peer_identity_unverified");
  }
  if (!RELEASE_GRADE_PEER_IDENTITY_METHODS.has(proof.peer_identity_method.trim())) {
    blockers.push("relay_transport_proof_peer_identity_method_not_release_grade");
  }
  if (!proof.peer_public_key.trim().startsWith("sha256:")) {
    blockers.push("relay_transport_proof_peer_public_key_not_fingerprint");
  }
  if (proof.encryption.trim().toLowerCase() !== "quic_tls_1_3") {
    blockers.push("relay_transport_proof_not_quic_tls");
  }
  if (proof.transport_verified_by.trim() !== "musu_quic_tls_transport") {
    blockers.push("relay_transport_proof_not_verified");
  }
  const openedAt = parseIsoTimestamp(proof.opened_at);
  const closedAt = parseIsoTimestamp(proof.closed_at);
  if (openedAt === null) {
    blockers.push("relay_transport_proof_opened_at_invalid");
  }
  if (proof.closed_at?.trim() && closedAt === null) {
    blockers.push("relay_transport_proof_closed_at_invalid");
  }
  if (openedAt !== null && closedAt !== null && closedAt < openedAt) {
    blockers.push("relay_transport_proof_timestamp_order_invalid");
  }
  return blockers;
}

async function leaseBindingBlockers(
  proof: RelayTransportProofRequest,
  ownerKey: string
): Promise<string[]> {
  try {
    const leases = await queryRelayLeases({
      owner_key: ownerKey,
      limit: 50,
      session_id: proof.session_id,
      source_node_id: proof.source_node_id,
      target_node_id: proof.target_node_id,
    });
    const lease = leases.find((candidate) => candidate.lease_id === proof.lease_id);
    if (!lease) {
      return ["relay_transport_proof_lease_not_found"];
    }
    if (lease.relay_url.trim() !== proof.relay_url.trim()) {
      return ["relay_transport_proof_relay_url_mismatch"];
    }
    return [];
  } catch (error) {
    return [
      `relay_transport_proof_lease_store_unavailable:${
        error instanceof Error ? error.message : "unknown"
      }`,
    ];
  }
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

  const forbiddenFields = forbiddenPayloadByteFields(json);
  if (forbiddenFields.length > 0) {
    const storeStatus = p2pRelayTransportProofStoreStatus();
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        stored: false,
        owner_scoped: true,
        release_grade: false,
        error: "relay_transport_proof_payload_bytes_not_accepted",
        forbidden_fields: forbiddenFields,
        relay_transport_proof_store_configured: storeStatus.configured,
        relay_transport_proof_store_backend: storeStatus.backend,
        relay_transport_proof_store_release_grade: storeStatus.release_grade,
        next_steps: [
          "send only release relay transport proof metadata to this endpoint",
          "do not send raw payload bytes to the proof recorder",
          "record payload_bytes_transited and payload_sha256/delivery proof from the actual relay tunnel path",
        ],
      },
      { status: 400 }
    );
  }

  const parsed = RelayTransportProofRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_relay_transport_proof",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const sourceNodeAuthMismatch = p2pSourceNodeAuthMismatch(
    principal,
    parsed.data.source_node_id
  );
  if (sourceNodeAuthMismatch) {
    const storeStatus = p2pRelayTransportProofStoreStatus();
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        stored: false,
        owner_scoped: true,
        release_grade: false,
        ...p2pSourceNodeAuthBindingFields(principal),
        error: sourceNodeAuthMismatch.error,
        bound_source_node_id: sourceNodeAuthMismatch.bound_source_node_id,
        declared_source_node_id: parsed.data.source_node_id,
        relay_transport_proof_store_configured: storeStatus.configured,
        relay_transport_proof_store_backend: storeStatus.backend,
        relay_transport_proof_store_release_grade: storeStatus.release_grade,
      },
      { status: 403 }
    );
  }

  const storeStatus = p2pRelayTransportProofStoreStatus();
  const blockers = [
    ...proofContentBlockers(parsed.data),
    ...(await leaseBindingBlockers(parsed.data, principal.owner_key)),
  ];
  if (!storeStatus.release_grade) {
    blockers.push("relay_transport_proof_store_backend_not_release_grade");
  }

  if (blockers.some((blocker) => blocker === "relay_transport_proof_lease_not_found")) {
    return NextResponse.json(
      {
        ok: true,
        accepted: false,
        stored: false,
        owner_scoped: true,
        release_grade: false,
        ...p2pSourceNodeAuthBindingFields(principal),
        ...{
          relay_transport_proof_store_configured: storeStatus.configured,
          relay_transport_proof_store_backend: storeStatus.backend,
          relay_transport_proof_store_release_grade: storeStatus.release_grade,
        },
        blockers,
      },
      { status: 409 }
    );
  }

  const proof = createRelayTransportProof({
    owner_key: principal.owner_key,
    session_id: parsed.data.session_id,
    lease_id: parsed.data.lease_id,
    source_node_id: parsed.data.source_node_id,
    target_node_id: parsed.data.target_node_id,
    relay_url: parsed.data.relay_url,
    tunnel_id: parsed.data.tunnel_id,
    transport_kind: parsed.data.transport_kind,
    handshake_ms: parsed.data.handshake_ms,
    payload_bytes_transited: parsed.data.payload_bytes_transited,
    payload_transited_musu_infra: parsed.data.payload_transited_musu_infra,
    peer_identity_verified: parsed.data.peer_identity_verified,
    peer_identity_method: parsed.data.peer_identity_method,
    peer_public_key: parsed.data.peer_public_key,
    encryption: parsed.data.encryption,
    transport_verified_by: parsed.data.transport_verified_by,
    opened_at: parsed.data.opened_at,
    closed_at: parsed.data.closed_at,
  });

  try {
    await appendRelayTransportProof(proof);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "relay_transport_proof_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
        relay_transport_proof_store_configured: storeStatus.configured,
        relay_transport_proof_store_backend: storeStatus.backend,
        relay_transport_proof_store_release_grade: storeStatus.release_grade,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      stored: true,
      owner_scoped: true,
      release_grade: blockers.length === 0 && proof.release_grade && storeStatus.release_grade,
      ...p2pSourceNodeAuthBindingFields(principal),
      relay_transport_proof_store_configured: storeStatus.configured,
      relay_transport_proof_store_backend: storeStatus.backend,
      relay_transport_proof_store_release_grade: storeStatus.release_grade,
      blockers,
      proof: publicRecord(proof),
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
  const storeStatus = p2pRelayTransportProofStoreStatus();

  try {
    const proofs = await queryRelayTransportProofs({
      owner_key: principal.owner_key,
      limit: parseLimit(params.get("limit")),
      session_id: params.get("session_id") ?? undefined,
      lease_id: params.get("lease_id") ?? undefined,
      source_node_id: params.get("source_node_id") ?? undefined,
      target_node_id: params.get("target_node_id") ?? undefined,
      tunnel_id: params.get("tunnel_id") ?? undefined,
    });
    return NextResponse.json({
      schema: "musu.p2p_relay_transport_proofs.v1",
      ok: true,
      owner_scoped: true,
      ...p2pSourceNodeAuthBindingFields(principal),
      relay_transport_proof_store_configured: storeStatus.configured,
      relay_transport_proof_store_backend: storeStatus.backend,
      relay_transport_proof_store_release_grade: storeStatus.release_grade,
      count: proofs.length,
      proofs: proofs.map(publicRecord),
    });
  } catch (error) {
    return NextResponse.json(
      {
        schema: "musu.p2p_relay_transport_proofs.v1",
        ok: false,
        error: "relay_transport_proof_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
        relay_transport_proof_store_configured: storeStatus.configured,
        relay_transport_proof_store_backend: storeStatus.backend,
        relay_transport_proof_store_release_grade: storeStatus.release_grade,
      },
      { status: 503 }
    );
  }
}
