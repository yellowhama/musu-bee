import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  appendRelayLease,
  createRelayLease,
  queryRelayLeases,
} from "@/lib/p2pRelayLeaseStore";
import type { RelayRouteKind } from "@/lib/p2pRelayLeaseStore";
import {
  envEnabled,
  hasConnectProEntitlement,
  relayConnectEndpointWired,
  relayLeaseStoreFields,
  relayPayloadEndpointWired,
  relayPayloadQueueEndpointWired,
  relayTunnelRuntimeImplemented,
  relayTransportKindReleaseGrade,
  relayTransportWired,
  relayUrl,
  relayUrlIsWss,
} from "@/lib/p2pRelayPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RouteKindSchema = z.enum(["lan", "tailscale", "direct_quic", "relay"]);

const RelayLeaseRequestSchema = z.object({
  session_id: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  requested_capability: z.string().min(1).nullable().optional(),
  attempted_route_kinds: z.array(RouteKindSchema).min(1),
  direct_path_failed: z.boolean(),
  failure_class: z.string().min(1).nullable().optional(),
}).passthrough();

/**
 * Two relay transports share this lease endpoint:
 *   (A) store-and-forward — payload is base64'd into the KV queue
 *       (/p2p/relay/payload) and the target polls it out. Fully implemented
 *       end-to-end (sender + queue + receiver poller). No QUIC needed.
 *   (B) release-grade QUIC tunnel — real-time bytes over WSS/QUIC. Not built;
 *       intentionally out of scope (the self-built tunnel direction was dropped).
 *
 * The blockers were previously merged: the (B) QUIC-readiness flags
 * (relay_transport_not_wired / relay_tunnel_runtime_not_implemented /
 * relay_transport_kind_not_release_grade / relay_payload_endpoint_not_wired)
 * gated (A)'s lease too, so a store-and-forward lease could NEVER be issued —
 * which is exactly why "두 머신이 relay로 안 붙음". Split them: (A) leases need
 * only the real preconditions below; the (B) checks move to a separate gate used
 * only when a caller actually requests the QUIC tunnel.
 *
 * This is the cross-machine path that works WITHOUT Tailscale: musu's own relay
 * queue carries the task when direct/tailnet reach fails.
 */
function storeAndForwardLeaseBlockers(input: {
  direct_path_failed: boolean;
  attempted_route_kinds: RelayRouteKind[];
}): string[] {
  const blockers: string[] = [];
  if (!envEnabled("MUSU_P2P_RELAY_ENABLED")) {
    blockers.push("relay_disabled");
  }
  // The payload QUEUE (not the QUIC tunnel) is what store-and-forward needs.
  if (!relayPayloadQueueEndpointWired()) {
    blockers.push("relay_payload_queue_endpoint_not_wired");
  }
  if (!relayUrl()) {
    blockers.push("relay_url_not_configured");
  }
  if (relayUrl() && !relayUrlIsWss()) {
    blockers.push("relay_url_not_wss");
  }
  if (!hasConnectProEntitlement()) {
    blockers.push("connect_pro_entitlement_required");
  }
  if (!input.direct_path_failed) {
    blockers.push("relay_requires_direct_path_failure");
  }
  if (!input.attempted_route_kinds.some((kind) => kind !== "relay")) {
    blockers.push("direct_route_attempt_required_before_relay");
  }
  return blockers;
}

/**
 * Additional preconditions for the release-grade (B) QUIC tunnel. Only checked
 * when a caller explicitly opts into the QUIC transport (not built yet, so this
 * still blocks — by design). Kept separate so it never gates store-and-forward.
 */
function releaseGradeTunnelBlockers(): string[] {
  const blockers: string[] = [];
  if (!relayTransportWired()) blockers.push("relay_transport_not_wired");
  if (!relayTunnelRuntimeImplemented())
    blockers.push("relay_tunnel_runtime_not_implemented");
  if (!relayTransportKindReleaseGrade())
    blockers.push("relay_transport_kind_not_release_grade");
  if (!relayPayloadEndpointWired())
    blockers.push("relay_payload_endpoint_not_wired");
  return blockers;
}

function relayPolicyBlockers(input: {
  direct_path_failed: boolean;
  attempted_route_kinds: RelayRouteKind[];
}): string[] {
  return storeAndForwardLeaseBlockers(input);
}

function publicLease<T extends { owner_key: string }>(lease: T): Omit<T, "owner_key"> {
  const { owner_key: _ownerKey, ...publicRecord } = lease;
  return publicRecord;
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

  const parsed = RelayLeaseRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_relay_lease_request",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const blockers = relayPolicyBlockers(parsed.data);
  if (blockers.length > 0) {
    return NextResponse.json(
      {
        ok: true,
        lease_issued: false,
        owner_scoped: true,
        relay_control_plane_wired: true,
        relay_transport_wired: relayTransportWired(),
        relay_tunnel_runtime_implemented: relayTunnelRuntimeImplemented(),
        relay_connect_endpoint_wired: relayConnectEndpointWired(),
        relay_payload_endpoint_wired: relayPayloadEndpointWired(),
        relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
        relay_default_data_path: false,
        ...relayLeaseStoreFields(),
        policy: "connect_pro_fallback_only",
        blockers,
      },
      { status: 409 }
    );
  }

  const lease = createRelayLease({
    owner_key: principal.owner_key,
    session_id: parsed.data.session_id,
    source_node_id: parsed.data.source_node_id,
    target_node_id: parsed.data.target_node_id,
    requested_capability: parsed.data.requested_capability,
    attempted_route_kinds: parsed.data.attempted_route_kinds,
    failure_class: parsed.data.failure_class,
    relay_url: relayUrl(),
  });

  try {
    await appendRelayLease(lease);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "relay_lease_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
        ...relayLeaseStoreFields(),
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      lease_issued: true,
      owner_scoped: true,
      relay_control_plane_wired: true,
      relay_transport_wired: relayTransportWired(),
      relay_tunnel_runtime_implemented: relayTunnelRuntimeImplemented(),
      relay_connect_endpoint_wired: relayConnectEndpointWired(),
      relay_payload_endpoint_wired: relayPayloadEndpointWired(),
      relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
      relay_default_data_path: false,
      ...relayLeaseStoreFields(),
      policy: "connect_pro_fallback_only",
      blockers: [],
      lease: publicLease(lease),
    },
    { status: 201 }
  );
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

export async function GET(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const principal = p2pControlPrincipal(req);
  const params = req.nextUrl.searchParams;

  try {
    const leases = await queryRelayLeases({
      owner_key: principal.owner_key,
      limit: parseLimit(params.get("limit")),
      session_id: params.get("session_id") ?? undefined,
      source_node_id: params.get("source_node_id") ?? undefined,
      target_node_id: params.get("target_node_id") ?? undefined,
    });
    return NextResponse.json({
      ok: true,
      owner_scoped: true,
      relay_control_plane_wired: true,
      relay_transport_wired: relayTransportWired(),
      relay_tunnel_runtime_implemented: relayTunnelRuntimeImplemented(),
      relay_connect_endpoint_wired: relayConnectEndpointWired(),
      relay_payload_endpoint_wired: relayPayloadEndpointWired(),
      relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
      relay_default_data_path: false,
      ...relayLeaseStoreFields(),
      count: leases.length,
      leases: leases.map(publicLease),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "relay_lease_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
        relay_control_plane_wired: true,
        relay_transport_wired: relayTransportWired(),
        relay_tunnel_runtime_implemented: relayTunnelRuntimeImplemented(),
        relay_connect_endpoint_wired: relayConnectEndpointWired(),
        relay_payload_endpoint_wired: relayPayloadEndpointWired(),
        relay_payload_queue_endpoint_wired: relayPayloadQueueEndpointWired(),
        relay_default_data_path: false,
        ...relayLeaseStoreFields(),
      },
      { status: 503 }
    );
  }
}
