import { NextRequest, NextResponse } from "next/server";

import { authorizeP2pControl } from "@/lib/p2pControlAuth";
import {
  RELEASE_GRADE_TRANSPORT_REQUIRED,
  RELAY_POLICY,
  RELAY_TRANSPORT_KIND,
  relayConnectPath,
  relayConnectEndpointWired,
  relayLeaseStoreFields,
  relayPayloadEndpointWired,
  relayPayloadQueueEndpointWired,
  relayTransportPreflightBlockers,
  relayTransportWired,
  relayUrl,
} from "@/lib/p2pRelayPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  const blockers = relayTransportPreflightBlockers();
  const url = relayUrl();
  return NextResponse.json({
    schema: "musu.p2p_relay_transport.v1",
    ok: blockers.length === 0,
    owner_scoped: true,
    relay_control_plane_wired: true,
    relay_transport_descriptor_wired: true,
    relay_transport_wired: relayTransportWired(),
    relay_connect_endpoint_wired: relayConnectEndpointWired(),
    relay_payload_endpoint_wired: relayPayloadEndpointWired(),
    relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
    relay_default_data_path: false,
    relay_url: url,
    relay_connect_path: relayConnectPath(url),
    relay_transport_kind: RELAY_TRANSPORT_KIND,
    release_grade_transport_required: RELEASE_GRADE_TRANSPORT_REQUIRED,
    payload_transit_requires_lease: true,
    policy: RELAY_POLICY,
    ...relayLeaseStoreFields(),
    blockers,
  });
}
