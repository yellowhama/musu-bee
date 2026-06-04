import { NextRequest, NextResponse } from "next/server";

import {
  RELEASE_GRADE_TRANSPORT_REQUIRED,
  RELAY_CONNECT_PATH,
  RELAY_POLICY,
  RELAY_TRANSPORT_KIND,
  relayConnectEndpointWired,
  relayPayloadEndpointWired,
  relayPayloadQueueEndpointWired,
  relayTransportPreflightBlockers,
  relayTransportWired,
} from "@/lib/p2pRelayPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function uniqueBlockers(blockers: string[]): string[] {
  return Array.from(new Set(blockers));
}

function relayConnectUnavailable(req: NextRequest) {
  const blockers = uniqueBlockers([
    "relay_payload_endpoint_not_wired",
    ...relayTransportPreflightBlockers(),
  ]);

  return NextResponse.json(
    {
      schema: "musu.relay_connect_unavailable.v1",
      ok: false,
      error: "relay_payload_transport_not_implemented",
      method: req.method,
      relay_connect_path: RELAY_CONNECT_PATH,
      relay_transport_kind: RELAY_TRANSPORT_KIND,
      release_grade_transport_required: RELEASE_GRADE_TRANSPORT_REQUIRED,
      relay_transport_wired: relayTransportWired(),
      relay_connect_endpoint_wired: relayConnectEndpointWired(),
      relay_payload_endpoint_wired: relayPayloadEndpointWired(),
      relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
      relay_default_data_path: false,
      payload_transit_requires_lease: true,
      policy: RELAY_POLICY,
      blockers,
      next_steps: [
        "implement the QUIC/TLS relay payload service before enabling relay payload transport",
        "require a short-lived owner-scoped relay lease before payload transit",
        "record release-grade relay route evidence only after real payload bytes transit MUSU infrastructure",
      ],
    },
    { status: 501 }
  );
}

export async function GET(req: NextRequest) {
  return relayConnectUnavailable(req);
}

export async function POST(req: NextRequest) {
  return relayConnectUnavailable(req);
}
