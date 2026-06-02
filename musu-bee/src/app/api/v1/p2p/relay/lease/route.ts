import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  appendRelayLease,
  createRelayLease,
  p2pRelayLeaseStoreStatus,
  queryRelayLeases,
} from "@/lib/p2pRelayLeaseStore";
import type { RelayRouteKind } from "@/lib/p2pRelayLeaseStore";

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

function envEnabled(name: string): boolean {
  return process.env[name] === "1" || process.env[name]?.toLowerCase() === "true";
}

function relayUrl(): string {
  return process.env.MUSU_P2P_RELAY_URL?.trim() ?? "";
}

function hasConnectProEntitlement(): boolean {
  const entitlement = process.env.MUSU_P2P_RELAY_ENTITLEMENT?.trim().toLowerCase();
  return entitlement === "connect" || entitlement === "pro" || entitlement === "enterprise";
}

function relayTransportWired(): boolean {
  return envEnabled("MUSU_P2P_RELAY_TRANSPORT_WIRED");
}

function relayPolicyBlockers(input: {
  direct_path_failed: boolean;
  attempted_route_kinds: RelayRouteKind[];
}): string[] {
  const blockers: string[] = [];
  if (!envEnabled("MUSU_P2P_RELAY_ENABLED")) {
    blockers.push("relay_disabled");
  }
  if (!relayTransportWired()) {
    blockers.push("relay_transport_not_wired");
  }
  if (!relayUrl()) {
    blockers.push("relay_url_not_configured");
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

function publicLease<T extends { owner_key: string }>(lease: T): Omit<T, "owner_key"> {
  const { owner_key: _ownerKey, ...publicRecord } = lease;
  return publicRecord;
}

function relayLeaseStoreFields() {
  const status = p2pRelayLeaseStoreStatus();
  return {
    relay_lease_store_configured: status.configured,
    relay_lease_store_backend: status.backend,
    relay_lease_store_release_grade: status.release_grade,
  };
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
      relay_transport_wired: true,
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
        relay_default_data_path: false,
        ...relayLeaseStoreFields(),
      },
      { status: 503 }
    );
  }
}
