import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { queryRelayLeases } from "@/lib/p2pRelayLeaseStore";
import {
  appendRelayPayload,
  claimRelayPayloads,
  createRelayPayload,
  markRelayPayloadDelivered,
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

const PayloadClaimRequestSchema = z.object({
  schema: z.literal("musu.relay_payload_claim.v1"),
  target_node_id: z.string().min(1),
  claimant_node_id: z.string().min(1).optional(),
  limit: z.number().int().positive().max(20).optional(),
  session_id: z.string().min(1).optional(),
  lease_id: z.string().min(1).optional(),
  source_node_id: z.string().min(1).optional(),
  tunnel_id: z.string().min(1).optional(),
  include_payload: z.boolean().optional(),
}).passthrough();

const PayloadDeliveryRequestSchema = z.object({
  schema: z.literal("musu.relay_payload_delivery.v1"),
  payload_id: z.string().min(1),
  target_node_id: z.string().min(1),
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

export async function PATCH(req: NextRequest) {
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

  const schema = json && typeof json === "object" ? (json as { schema?: unknown }).schema : undefined;
  if (schema === "musu.relay_payload_claim.v1") {
    const parsed = PayloadClaimRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_relay_payload_claim_request",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    try {
      const payloads = await claimRelayPayloads({
        owner_key: principal.owner_key,
        target_node_id: parsed.data.target_node_id,
        claimant_node_id: parsed.data.claimant_node_id,
        limit: parsed.data.limit,
        session_id: parsed.data.session_id,
        lease_id: parsed.data.lease_id,
        source_node_id: parsed.data.source_node_id,
        tunnel_id: parsed.data.tunnel_id,
        status: "queued",
      });
      return NextResponse.json(
        {
          schema: "musu.p2p_relay_payload_claim.v1",
          ok: true,
          owner_scoped: true,
          accepted: true,
          claimed: true,
          relay_payload_queue_endpoint_wired: true,
          relay_default_data_path: false,
          release_grade: false,
          ...relayPayloadStoreFields(),
          count: payloads.length,
          payloads: payloads.map((payload) =>
            publicPayload(payload, parsed.data.include_payload === true)
          ),
        },
        { status: 202 }
      );
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error && error.message
              ? error.message
              : "relay_payload_claim_failed",
          owner_scoped: true,
          ...relayPayloadStoreFields(),
        },
        { status: 503 }
      );
    }
  }

  if (schema === "musu.relay_payload_delivery.v1") {
    const parsed = PayloadDeliveryRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_relay_payload_delivery_request",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    try {
      const payload = await markRelayPayloadDelivered({
        owner_key: principal.owner_key,
        payload_id: parsed.data.payload_id,
        target_node_id: parsed.data.target_node_id,
      });
      if (!payload) {
        return NextResponse.json(
          {
            ok: false,
            error: "relay_payload_not_found",
            owner_scoped: true,
            ...relayPayloadStoreFields(),
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          schema: "musu.p2p_relay_payload_delivery.v1",
          ok: true,
          owner_scoped: true,
          accepted: true,
          delivered: true,
          relay_default_data_path: false,
          release_grade: false,
          ...relayPayloadStoreFields(),
          payload: publicPayload(payload, false),
        },
        { status: 202 }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message ? error.message : "relay_payload_delivery_failed";
      return NextResponse.json(
        {
          ok: false,
          error: errorMessage,
          owner_scoped: true,
          ...relayPayloadStoreFields(),
        },
        { status: errorMessage === "relay_payload_delivery_requires_claim" ? 409 : 503 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "invalid_relay_payload_patch_schema" },
    { status: 400 }
  );
}
