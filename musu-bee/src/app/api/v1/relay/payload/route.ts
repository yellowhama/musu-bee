import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
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
  schema: z.literal("musu.relay_payload_preflight_request.v1").optional(),
  lease_id: z.string().min(1).max(128),
  session_id: z.string().min(1).max(128),
  source_node_id: z.string().min(1).max(128),
  target_node_id: z.string().min(1).max(128),
  tunnel_id: z.string().min(1).max(128),
  payload_kind: z.literal("forwarded_task_envelope"),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

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

function releasePayloadPreflightStatus(method: string, blockers = relayTransportPreflightBlockers()) {
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
    release_grade: false,
    ...relayLeaseStoreFields(),
    policy: RELAY_POLICY,
    blockers,
  };
}

function releasePayloadBlocked(method: string, extra: Record<string, unknown> = {}) {
  const blockers = uniqueBlockers(relayTransportPreflightBlockers());
  return NextResponse.json(
    {
      ...releasePayloadPreflightStatus(method, blockers),
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

function releasePayloadBytesNotAccepted(method: string, forbiddenFields: string[]) {
  return NextResponse.json(
    {
      ...releasePayloadPreflightStatus(method),
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

export async function GET(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  return NextResponse.json(releasePayloadPreflightStatus(req.method));
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
        ...releasePayloadPreflightStatus(req.method),
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
    return releasePayloadBytesNotAccepted(req.method, forbiddenFields);
  }

  const parsed = ReleasePayloadPreflightRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ...releasePayloadPreflightStatus(req.method),
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
        ...releasePayloadPreflightStatus(req.method),
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
        ...releasePayloadPreflightStatus(req.method),
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

  return releasePayloadBlocked(req.method, {
    lease_verified: true,
    release_payload_metadata: {
      tunnel_id: parsed.data.tunnel_id,
      payload_kind: parsed.data.payload_kind,
      payload_sha256: parsed.data.payload_sha256,
    },
    lease: {
      lease_id: lease.lease_id,
      session_id: lease.session_id,
      source_node_id: lease.source_node_id,
      target_node_id: lease.target_node_id,
      route_kind: lease.route_kind,
      expires_at: lease.expires_at,
    },
  });
}
