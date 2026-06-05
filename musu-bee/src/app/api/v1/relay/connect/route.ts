import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
  RELEASE_GRADE_RELAY_TRANSPORT_KIND,
  RELEASE_GRADE_TRANSPORT_REQUIRED,
  RELAY_CONNECT_PATH,
  RELAY_POLICY,
  RELAY_TRANSPORT_KIND,
  relayLeaseStoreFields,
  relayConnectEndpointWired,
  relayPayloadEndpointWired,
  relayPayloadQueueEndpointWired,
  relayTransportPreflightBlockers,
  relayTransportWired,
} from "@/lib/p2pRelayPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RelayConnectRequestSchema = z.object({
  schema: z.literal("musu.relay_connect_request.v1").optional(),
  lease_id: z.string().min(1),
  session_id: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
}).strict();

const FORBIDDEN_RELAY_CONNECT_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function uniqueBlockers(blockers: string[]): string[] {
  return Array.from(new Set(blockers));
}

function forbiddenRelayConnectByteFields(json: unknown): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return [];
  }
  return FORBIDDEN_RELAY_CONNECT_BYTE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(json, field)
  );
}

function relayConnectStatus(method: string, blockers = relayTransportPreflightBlockers()) {
  return {
    schema: "musu.relay_connect.v1",
    ok: blockers.length === 0,
    method,
    relay_connect_path: RELAY_CONNECT_PATH,
    relay_transport_kind: RELAY_TRANSPORT_KIND,
    release_grade_relay_transport_kind: RELEASE_GRADE_RELAY_TRANSPORT_KIND,
    release_grade_transport_required: RELEASE_GRADE_TRANSPORT_REQUIRED,
    relay_transport_wired: relayTransportWired(),
    relay_connect_endpoint_wired: relayConnectEndpointWired(),
    relay_payload_endpoint_wired: relayPayloadEndpointWired(),
    relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
    relay_default_data_path: false,
    payload_transit_requires_lease: true,
    relay_control_plane_wired: true,
    owner_scoped: true,
    ...relayLeaseStoreFields(),
    policy: RELAY_POLICY,
    blockers,
  };
}

function relayConnectBlocked(method: string, extra: Record<string, unknown> = {}) {
  const blockers = uniqueBlockers(relayTransportPreflightBlockers());

  return NextResponse.json(
    {
      ...relayConnectStatus(method, blockers),
      ok: false,
      relay_connect_accepted: false,
      error: blockers.includes("relay_payload_endpoint_not_wired")
        ? "relay_payload_endpoint_not_wired"
        : "relay_transport_not_wired",
      ...extra,
      next_steps: [
        "keep the connect preflight endpoint separate from the non-release-grade store-forward queue",
        "add the release tunnel payload endpoint before enabling relay payload transport",
        "require a short-lived owner-scoped relay lease before payload transit",
        "record release-grade relay route evidence only after real payload bytes transit MUSU infrastructure",
      ],
    },
    { status: 409 }
  );
}

function relayConnectPayloadBytesNotAccepted(method: string, forbiddenFields: string[]) {
  return NextResponse.json(
    {
      ...relayConnectStatus(method),
      ok: false,
      relay_connect_accepted: false,
      payload_transported: false,
      error: "relay_connect_payload_bytes_not_accepted",
      forbidden_fields: forbiddenFields,
      next_steps: [
        "send only relay lease metadata to the release relay connect preflight endpoint",
        "do not send payload bytes to /api/v1/relay/connect",
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
  return NextResponse.json(relayConnectStatus(req.method));
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

  const forbiddenFields = forbiddenRelayConnectByteFields(json);
  if (forbiddenFields.length > 0) {
    return relayConnectPayloadBytesNotAccepted(req.method, forbiddenFields);
  }

  const parsed = RelayConnectRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_relay_connect_request",
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
        ...relayConnectStatus(req.method),
        ok: false,
        relay_connect_accepted: false,
        lease_verified: false,
        error: "relay_connect_store_failed",
        store_error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
  const lease = leases[0];
  if (!lease) {
    return NextResponse.json(
      {
        ...relayConnectStatus(req.method),
        ok: false,
        relay_connect_accepted: false,
        lease_verified: false,
        error: "relay_lease_not_found",
      },
      { status: 409 }
    );
  }

  return relayConnectBlocked(req.method, {
    lease_verified: true,
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
