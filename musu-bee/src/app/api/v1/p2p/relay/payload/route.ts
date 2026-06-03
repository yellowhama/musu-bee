import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
  appendRelayPayload,
  createRelayPayload,
  p2pRelayPayloadStoreStatus,
  queryRelayPayloads,
} from "@/lib/p2pRelayPayloadStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PayloadRequestSchema = z.object({
  schema: z.literal("musu.relay_payload_envelope.v1"),
  session_id: z.string().min(1),
  lease_id: z.string().min(1),
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  tunnel_id: z.string().min(1),
  payload_kind: z.string().min(1),
  payload_base64: z.string().min(1),
  payload_sha256: z.string().min(1).optional(),
}).passthrough();

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : undefined;
}

function parseStatus(value: string | null): "queued" | "claimed" | "delivered" | undefined {
  if (value === "queued" || value === "claimed" || value === "delivered") {
    return value;
  }
  return undefined;
}

function publicPayload<T extends { owner_key: string; payload_base64: string }>(
  payload: T,
  includePayload: boolean
): Omit<T, "owner_key"> | Omit<T, "owner_key" | "payload_base64"> {
  const { owner_key: _ownerKey, payload_base64: payloadBase64, ...publicRecord } = payload;
  if (includePayload) {
    return { ...publicRecord, payload_base64: payloadBase64 };
  }
  return publicRecord;
}

function relayPayloadStoreFields() {
  const status = p2pRelayPayloadStoreStatus();
  return {
    relay_payload_store_configured: status.configured,
    relay_payload_store_backend: status.backend,
    relay_payload_store_release_grade: status.release_grade,
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

  const parsed = PayloadRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_relay_payload_request",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  let relayUrl: string | undefined;
  try {
    const leases = await queryRelayLeases({
      owner_key: principal.owner_key,
      limit: 50,
      session_id: parsed.data.session_id,
      source_node_id: parsed.data.source_node_id,
      target_node_id: parsed.data.target_node_id,
    });
    relayUrl = leases.find((lease) => lease.lease_id === parsed.data.lease_id)?.relay_url;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "relay_payload_lease_store_unavailable",
        detail: error instanceof Error ? error.message : "unknown",
        ...relayPayloadStoreFields(),
      },
      { status: 503 }
    );
  }

  if (!relayUrl) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        stored: false,
        error: "relay_payload_lease_not_found",
        owner_scoped: true,
      },
      { status: 409 }
    );
  }

  let payload;
  try {
    payload = createRelayPayload({
      owner_key: principal.owner_key,
      session_id: parsed.data.session_id,
      lease_id: parsed.data.lease_id,
      source_node_id: parsed.data.source_node_id,
      target_node_id: parsed.data.target_node_id,
      relay_url: relayUrl,
      tunnel_id: parsed.data.tunnel_id,
      payload_kind: parsed.data.payload_kind,
      payload_base64: parsed.data.payload_base64,
      payload_sha256: parsed.data.payload_sha256,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        stored: false,
        error: error instanceof Error ? error.message : "relay_payload_invalid",
      },
      { status: 400 }
    );
  }

  try {
    await appendRelayPayload(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "relay_payload_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
        ...relayPayloadStoreFields(),
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
      relay_payload_queue_endpoint_wired: true,
      relay_default_data_path: false,
      payload_transit_requires_lease: true,
      release_grade: false,
      release_grade_blockers: ["relay_payload_queue_not_quic_tls_transport"],
      ...relayPayloadStoreFields(),
      payload: publicPayload(payload, false),
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
  const includePayload = params.get("include_payload") === "1";

  try {
    const payloads = await queryRelayPayloads({
      owner_key: principal.owner_key,
      limit: parseLimit(params.get("limit")),
      session_id: params.get("session_id") ?? undefined,
      lease_id: params.get("lease_id") ?? undefined,
      source_node_id: params.get("source_node_id") ?? undefined,
      target_node_id: params.get("target_node_id") ?? undefined,
      tunnel_id: params.get("tunnel_id") ?? undefined,
      status: parseStatus(params.get("status")),
    });
    return NextResponse.json({
      schema: "musu.p2p_relay_payloads.v1",
      ok: true,
      owner_scoped: true,
      relay_payload_queue_endpoint_wired: true,
      relay_default_data_path: false,
      release_grade: false,
      ...relayPayloadStoreFields(),
      count: payloads.length,
      payloads: payloads.map((payload) => publicPayload(payload, includePayload)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "relay_payload_query_failed",
        detail: error instanceof Error ? error.message : "unknown",
        ...relayPayloadStoreFields(),
      },
      { status: 503 }
    );
  }
}
