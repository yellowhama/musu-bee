import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
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
  lease_id: z.string().min(1),
  session_id: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
}).passthrough();

function uniqueBlockers(blockers: string[]): string[] {
  return Array.from(new Set(blockers));
}

function relayConnectStatus(method: string, blockers = relayTransportPreflightBlockers()) {
  return {
    schema: "musu.relay_connect.v1",
    ok: blockers.length === 0,
    method,
    relay_connect_path: RELAY_CONNECT_PATH,
    relay_transport_kind: RELAY_TRANSPORT_KIND,
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
