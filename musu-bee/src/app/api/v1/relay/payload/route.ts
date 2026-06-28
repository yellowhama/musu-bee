import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  authorizeP2pControl,
  p2pControlPrincipal,
  p2pSourceNodeAuthBindingFields,
  p2pSourceNodeAuthMismatch,
  type P2pControlPrincipal,
} from "@/lib/p2pControlAuth";
import {
  publicReleaseRelayLease,
  releaseRelayLeaseBlockers,
} from "@/lib/p2pReleaseRelayLeaseValidation";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
  appendRelayTransportProof,
  createRelayTransportProof,
  p2pRelayTransportProofStoreStatus,
} from "@/lib/p2pRelayTransportProofStore";
import {
  RELEASE_GRADE_RELAY_TRANSPORT_KIND,
  RELEASE_GRADE_TRANSPORT_REQUIRED,
  RELAY_PAYLOAD_PATH,
  RELAY_POLICY,
  RELAY_TRANSPORT_KIND,
  relayLeaseStoreFields,
  relayPayloadEndpointWired,
  relayPayloadQueueEndpointWired,
  relayTunnelRuntimeImplemented,
  relayTransportPreflightBlockers,
  relayTransportWired,
} from "@/lib/p2pRelayPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ReleasePayloadPreflightRequestSchema = z.object({
  schema: z.union([
    z.literal("musu.relay_payload_preflight_request.v1"),
    z.literal("musu.relay_payload_release_request.v1"),
  ]).optional(),
  lease_id: z.string().min(1).max(128),
  session_id: z.string().min(1).max(128),
  source_node_id: z.string().min(1).max(128),
  target_node_id: z.string().min(1).max(128),
  tunnel_id: z.string().min(1).max(128),
  payload_kind: z.literal("forwarded_task_envelope"),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  relay_transport_proof: z.object({
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
  }).strict().optional(),
  delivery_proof: z.object({
    schema: z.literal("musu.relay_payload_delivery_proof.v1"),
    payload_id: z.string().min(1),
    session_id: z.string().min(1),
    lease_id: z.string().min(1),
    source_node_id: z.string().min(1),
    target_node_id: z.string().min(1),
    relay_url: z.string().min(1),
    tunnel_id: z.string().min(1),
    payload_kind: z.literal("forwarded_task_envelope"),
    transport_kind: z.literal("quic_relay_tunnel"),
    relay_default_data_path: z.literal(false),
    release_grade: z.literal(true),
    payload_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    payload_bytes: z.number().int().positive(),
    claimed_by: z.string().min(1),
    claimed_at: z.string().min(1),
    created_at: z.string().min(1),
    delivered_at: z.string().min(1),
  }).strict().optional(),
}).strict();

type ReleasePayloadRequest = z.infer<typeof ReleasePayloadPreflightRequestSchema>;
type ReleaseRelayLease = Awaited<ReturnType<typeof queryRelayLeases>>[number];

const RELEASE_GRADE_PEER_IDENTITY_METHODS = new Set(["quic_tls_cert_fingerprint"]);

const FORBIDDEN_RELEASE_PAYLOAD_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function uniqueBlockers(blockers: string[]): string[] {
  return Array.from(new Set(blockers));
}

function forbiddenPayloadByteFields(json: unknown): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return [];
  }
  return FORBIDDEN_RELEASE_PAYLOAD_BYTE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(json, field)
  );
}

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function releaseProofContentBlockers(request: ReleasePayloadRequest): string[] {
  const proof = request.relay_transport_proof;
  const delivery = request.delivery_proof;
  const blockers: string[] = [];
  if (!proof) {
    blockers.push("release_relay_transport_proof_missing");
  }
  if (!delivery) {
    blockers.push("release_relay_payload_delivery_proof_missing");
  }
  if (!proof || !delivery) {
    return blockers;
  }

  if (!proof.relay_url.trim().startsWith("wss://")) {
    blockers.push("relay_transport_proof_relay_url_not_wss");
  }
  if (proof.transport_kind.trim() !== RELEASE_GRADE_RELAY_TRANSPORT_KIND) {
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
  if (proof.encryption.trim().toLowerCase() !== RELEASE_GRADE_TRANSPORT_REQUIRED) {
    blockers.push("relay_transport_proof_not_quic_tls");
  }
  if (proof.transport_verified_by.trim() !== "musu_quic_tls_transport") {
    blockers.push("relay_transport_proof_not_verified");
  }

  const proofOpenedAt = parseIsoTimestamp(proof.opened_at);
  const proofClosedAt = parseIsoTimestamp(proof.closed_at);
  if (proofOpenedAt === null) {
    blockers.push("relay_transport_proof_opened_at_invalid");
  }
  if (proof.closed_at?.trim() && proofClosedAt === null) {
    blockers.push("relay_transport_proof_closed_at_invalid");
  }
  if (proofOpenedAt !== null && proofClosedAt !== null && proofClosedAt < proofOpenedAt) {
    blockers.push("relay_transport_proof_timestamp_order_invalid");
  }

  const deliveryCreatedAt = parseIsoTimestamp(delivery.created_at);
  const deliveryClaimedAt = parseIsoTimestamp(delivery.claimed_at);
  const deliveryDeliveredAt = parseIsoTimestamp(delivery.delivered_at);
  if (deliveryCreatedAt === null) {
    blockers.push("release_payload_delivery_created_at_invalid");
  }
  if (deliveryClaimedAt === null) {
    blockers.push("release_payload_delivery_claimed_at_invalid");
  }
  if (deliveryDeliveredAt === null) {
    blockers.push("release_payload_delivery_delivered_at_invalid");
  }
  if (
    deliveryClaimedAt !== null &&
    deliveryDeliveredAt !== null &&
    deliveryDeliveredAt < deliveryClaimedAt
  ) {
    blockers.push("release_payload_delivery_timestamp_order_invalid");
  }
  return blockers;
}

function releaseProofBindingBlockers(
  request: ReleasePayloadRequest,
  lease: ReleaseRelayLease
): string[] {
  const proof = request.relay_transport_proof;
  const delivery = request.delivery_proof;
  if (!proof || !delivery) {
    return [];
  }

  const blockers: string[] = [];
  const proofFields: Array<keyof Pick<
    ReleasePayloadRequest,
    "session_id" | "lease_id" | "source_node_id" | "target_node_id" | "tunnel_id"
  >> = ["session_id", "lease_id", "source_node_id", "target_node_id", "tunnel_id"];
  for (const field of proofFields) {
    if (proof[field] !== request[field]) {
      blockers.push(`relay_transport_proof_${field}_mismatch`);
    }
    if (delivery[field] !== request[field]) {
      blockers.push(`release_payload_delivery_${field}_mismatch`);
    }
  }
  if (proof.relay_url.trim() !== lease.relay_url.trim()) {
    blockers.push("relay_transport_proof_relay_url_mismatch");
  }
  if (delivery.relay_url.trim() !== lease.relay_url.trim()) {
    blockers.push("release_payload_delivery_relay_url_mismatch");
  }
  if (delivery.payload_kind !== request.payload_kind) {
    blockers.push("release_payload_delivery_kind_mismatch");
  }
  if (delivery.payload_sha256.toLowerCase() !== request.payload_sha256.toLowerCase()) {
    blockers.push("release_payload_delivery_sha256_mismatch");
  }
  if (delivery.payload_bytes !== proof.payload_bytes_transited) {
    blockers.push("release_payload_delivery_bytes_mismatch");
  }
  return blockers;
}

function releasePayloadPreflightStatus(
  method: string,
  blockers = relayTransportPreflightBlockers(),
  principal?: P2pControlPrincipal
) {
  return {
    schema: "musu.relay_payload_preflight.v1",
    ok: false,
    method,
    release_payload_endpoint_path: RELAY_PAYLOAD_PATH,
    release_payload_endpoint_preflight_wired: true,
    relay_payload_endpoint_wired: relayPayloadEndpointWired(),
    relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
    relay_transport_wired: relayTransportWired(),
    relay_tunnel_runtime_implemented: relayTunnelRuntimeImplemented(),
    relay_transport_kind: RELAY_TRANSPORT_KIND,
    release_grade_relay_transport_kind: RELEASE_GRADE_RELAY_TRANSPORT_KIND,
    release_grade_transport_required: RELEASE_GRADE_TRANSPORT_REQUIRED,
    relay_default_data_path: false,
    payload_transit_requires_lease: true,
    owner_scoped: true,
    ...(principal ? p2pSourceNodeAuthBindingFields(principal) : {}),
    release_grade: false,
    ...relayLeaseStoreFields(),
    policy: RELAY_POLICY,
    blockers,
  };
}

function releasePayloadBlocked(
  method: string,
  principal?: P2pControlPrincipal,
  extra: Record<string, unknown> = {}
) {
  const blockers = uniqueBlockers(relayTransportPreflightBlockers());
  return NextResponse.json(
    {
      ...releasePayloadPreflightStatus(method, blockers, principal),
      ok: false,
      release_payload_accepted: false,
      payload_stored: false,
      payload_transported: false,
      error: blockers.includes("relay_payload_endpoint_not_wired")
        ? "relay_payload_endpoint_not_wired"
        : "relay_transport_not_wired",
      ...extra,
      next_steps: [
        "keep the release payload endpoint separate from the non-release-grade store-forward queue",
        "implement a real relay tunnel payload transport before accepting payload bytes here",
        "emit release-grade quic_tls_1_3 relay transport proof from the actual payload path",
        "record relay payload delivery proof only after bytes transit MUSU relay infrastructure",
      ],
    },
    { status: 409 }
  );
}

function releasePayloadBytesNotAccepted(
  method: string,
  forbiddenFields: string[],
  principal?: P2pControlPrincipal
) {
  return NextResponse.json(
    {
      ...releasePayloadPreflightStatus(method, undefined, principal),
      ok: false,
      release_payload_accepted: false,
      payload_stored: false,
      payload_transported: false,
      error: "release_payload_bytes_not_accepted",
      forbidden_fields: forbiddenFields,
      next_steps: [
        "send only relay lease metadata to the release payload preflight endpoint",
        "do not send payload bytes to /api/v1/relay/payload until the release tunnel transport is implemented",
        "keep preview store-forward payloads on /api/v1/p2p/relay/payload with release_grade=false",
      ],
    },
    { status: 400 }
  );
}

function releaseRelayLeaseNotPayloadReady(
  method: string,
  lease: Awaited<ReturnType<typeof queryRelayLeases>>[number],
  leaseBlockers: string[],
  principal?: P2pControlPrincipal
) {
  const blockers = uniqueBlockers([...relayTransportPreflightBlockers(), ...leaseBlockers]);
  return NextResponse.json(
    {
      ...releasePayloadPreflightStatus(method, blockers, principal),
      ok: false,
      release_payload_accepted: false,
      payload_stored: false,
      payload_transported: false,
      lease_verified: true,
      release_payload_lease_ready: false,
      error: "release_relay_lease_not_payload_ready",
      lease_blockers: leaseBlockers,
      lease: publicReleaseRelayLease(lease),
    },
    { status: 409 }
  );
}

async function releasePayloadProofAccepted(
  method: string,
  request: ReleasePayloadRequest,
  lease: ReleaseRelayLease,
  principal?: P2pControlPrincipal
) {
  const storeStatus = p2pRelayTransportProofStoreStatus();
  const proof = request.relay_transport_proof;
  const delivery = request.delivery_proof;
  const proofBlockers = uniqueBlockers([
    ...releaseProofContentBlockers(request),
    ...releaseProofBindingBlockers(request, lease),
  ]);
  const readinessBlockers = uniqueBlockers([
    ...proofBlockers,
    ...(storeStatus.release_grade ? [] : ["relay_transport_proof_store_backend_not_release_grade"]),
  ]);

  if (!proof || !delivery || proofBlockers.length > 0) {
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: true,
        release_payload_lease_ready: true,
        release_payload_proof_ready: false,
        error: proofBlockers.includes("release_relay_transport_proof_missing")
          ? "release_relay_transport_proof_missing"
          : proofBlockers.includes("release_relay_payload_delivery_proof_missing")
            ? "release_relay_payload_delivery_proof_missing"
            : "invalid_release_relay_payload_proof",
        proof_blockers: readinessBlockers,
        release_payload_metadata: {
          tunnel_id: request.tunnel_id,
          payload_kind: request.payload_kind,
          payload_sha256: request.payload_sha256,
        },
        relay_transport_proof_store_configured: storeStatus.configured,
        relay_transport_proof_store_backend: storeStatus.backend,
        relay_transport_proof_store_release_grade: storeStatus.release_grade,
        lease: publicReleaseRelayLease(lease),
      },
      { status: 409 }
    );
  }

  const storedProof = createRelayTransportProof({
    owner_key: lease.owner_key,
    session_id: proof.session_id,
    lease_id: proof.lease_id,
    source_node_id: proof.source_node_id,
    target_node_id: proof.target_node_id,
    relay_url: proof.relay_url,
    tunnel_id: proof.tunnel_id,
    transport_kind: proof.transport_kind,
    handshake_ms: proof.handshake_ms,
    payload_bytes_transited: proof.payload_bytes_transited,
    payload_transited_musu_infra: proof.payload_transited_musu_infra,
    peer_identity_verified: proof.peer_identity_verified,
    peer_identity_method: proof.peer_identity_method,
    peer_public_key: proof.peer_public_key,
    encryption: proof.encryption,
    transport_verified_by: proof.transport_verified_by,
    opened_at: proof.opened_at,
    closed_at: proof.closed_at,
  });

  try {
    await appendRelayTransportProof(storedProof);
  } catch (error) {
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: true,
        release_payload_lease_ready: true,
        release_payload_proof_ready: true,
        error: "relay_transport_proof_store_failed",
        store_error: error instanceof Error ? error.message : "unknown",
        relay_transport_proof_store_configured: storeStatus.configured,
        relay_transport_proof_store_backend: storeStatus.backend,
        relay_transport_proof_store_release_grade: storeStatus.release_grade,
      },
      { status: 503 }
    );
  }

  const { owner_key: _ownerKey, ...publicProof } = storedProof;
  return NextResponse.json(
    {
      ...releasePayloadPreflightStatus(method, undefined, principal),
      ok: true,
      release_payload_endpoint_wired: true,
      release_payload_contract: "musu.relay_payload_release.v1",
      release_payload_accepted: true,
      payload_stored: false,
      payload_transported: true,
      lease_verified: true,
      release_payload_lease_ready: true,
      release_payload_proof_ready: true,
      owner_scoped: true,
      release_grade: storedProof.release_grade && storeStatus.release_grade,
      proof_blockers: readinessBlockers,
      relay_transport_proof_store_configured: storeStatus.configured,
      relay_transport_proof_store_backend: storeStatus.backend,
      relay_transport_proof_store_release_grade: storeStatus.release_grade,
      release_payload_metadata: {
        tunnel_id: request.tunnel_id,
        payload_kind: request.payload_kind,
        payload_sha256: request.payload_sha256,
        payload_bytes_transited: proof.payload_bytes_transited,
      },
      relay_transport_proof: publicProof,
      delivery_proof: delivery,
      lease: publicReleaseRelayLease(lease),
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
  return NextResponse.json(releasePayloadPreflightStatus(req.method, undefined, principal));
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
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(req.method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: false,
        error: "invalid_json",
      },
      { status: 400 }
    );
  }

  const forbiddenFields = forbiddenPayloadByteFields(json);
  if (forbiddenFields.length > 0) {
    return releasePayloadBytesNotAccepted(req.method, forbiddenFields, principal);
  }

  const parsed = ReleasePayloadPreflightRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(req.method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: false,
        error: "invalid_relay_payload_preflight_request",
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
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(req.method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: false,
        error: sourceNodeAuthMismatch.error,
        bound_source_node_id: sourceNodeAuthMismatch.bound_source_node_id,
        declared_source_node_id: parsed.data.source_node_id,
      },
      { status: 403 }
    );
  }

  let leases;
  try {
    leases = await queryRelayLeases({
      owner_key: principal.owner_key,
      lease_id: parsed.data.lease_id,
      session_id: parsed.data.session_id,
      source_node_id: parsed.data.source_node_id,
      target_node_id: parsed.data.target_node_id,
      limit: 1,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(req.method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: false,
        error: "relay_payload_preflight_store_failed",
        store_error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }

  const lease = leases[0];
  if (!lease) {
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(req.method, undefined, principal),
        ok: false,
        release_payload_accepted: false,
        payload_stored: false,
        payload_transported: false,
        lease_verified: false,
        error: "relay_lease_not_found",
      },
      { status: 409 }
    );
  }

  const leaseBlockers = releaseRelayLeaseBlockers(lease);
  if (leaseBlockers.length > 0) {
    return releaseRelayLeaseNotPayloadReady(req.method, lease, leaseBlockers, principal);
  }

  if (
    parsed.data.schema === "musu.relay_payload_release_request.v1" ||
    parsed.data.relay_transport_proof ||
    parsed.data.delivery_proof
  ) {
    return releasePayloadProofAccepted(req.method, parsed.data, lease, principal);
  }

  return releasePayloadBlocked(req.method, principal, {
    lease_verified: true,
    release_payload_lease_ready: true,
    release_payload_metadata: {
      tunnel_id: parsed.data.tunnel_id,
      payload_kind: parsed.data.payload_kind,
      payload_sha256: parsed.data.payload_sha256,
    },
    lease: {
      ...publicReleaseRelayLease(lease),
    },
  });
}
