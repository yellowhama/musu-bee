import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fileURLToPath } from "url";
import { getBridgeUrl } from "@/lib/bridge-config";
import { getBridgeToken } from "@/lib/bridge-token";
import { appendControlAudit, createTraceId } from "@/lib/control-audit";
import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  ROOM_WORK_ORDER_STATUSES,
  claimRoomWorkOrders,
  createRoomWorkOrder,
  markRoomWorkOrderDelivery,
  publicRoomWorkOrder,
  queryRoomWorkOrders,
  type RoomWorkOrderStatus,
  upsertRoomWorkOrder,
} from "@/lib/roomWorkOrderStore";

export const dynamic = "force-dynamic";

const MAX_CONTEXT_VALUE_CHARS = 160;

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

function normalizeWorkspaceUri(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("file:")) return trimmed;
  try {
    return fileURLToPath(trimmed);
  } catch {
    return undefined;
  }
}

function normalizeContextValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Array.from(trimmed).slice(0, MAX_CONTEXT_VALUE_CHARS).join("");
}

function normalizePathContextValue(value: string): string | undefined {
  return normalizeContextValue(value);
}

function generatedWorkOrderId(): string {
  return `wo-${randomUUID()}`;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { roomId } = await context.params;
  const room_id = normalizePathContextValue(roomId);
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const principal = p2pControlPrincipal(req);
  const traceId = createTraceId();

  let body: {
    instruction?: unknown;
    channel?: unknown;
    sender_id?: unknown;
    target_node?: unknown;
    adapter_type?: unknown;
    workspace_uri?: unknown;
    company_id?: unknown;
    project_id?: unknown;
    work_order_id?: unknown;
    source_agent_id?: unknown;
    permission_envelope?: unknown;
    delivery_mode?: unknown;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    await appendControlAudit({
      event: "rooms.work_orders",
      actor_id: principal.owner_key,
      actor_email: null,
      owner_key: principal.owner_key,
      node: "local",
      command: "room.work_order",
      result: "rejected",
      http_status: 400,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      origin: "musu.pro",
      room_id,
      reason: "invalid_json",
    });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    await appendControlAudit({
      event: "rooms.work_orders",
      actor_id: principal.owner_key,
      actor_email: null,
      owner_key: principal.owner_key,
      node: "local",
      command: "room.work_order",
      result: "rejected",
      http_status: 400,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      origin: "musu.pro",
      room_id,
      reason: "instruction required",
    });
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }

  const work_order_id = normalizeContextValue(body.work_order_id) ?? generatedWorkOrderId();
  const target_node = normalizeContextValue(body.target_node);
  const company_id = normalizeContextValue(body.company_id);
  const project_id = normalizeContextValue(body.project_id);
  const source_agent_id = normalizeContextValue(body.source_agent_id);
  const delivery_mode = normalizeContextValue(body.delivery_mode);
  const bridgeUrl = getBridgeUrl().replace(/\/+$/, "");
  const token = await getBridgeToken();
  const cwd = normalizeWorkspaceUri(body.workspace_uri);
  const outboundPickupRequired = delivery_mode === "desktop_outbound_pickup";
  const upstreamBody = {
    channel: normalizeContextValue(body.channel) ?? "company-room",
    sender_id: normalizeContextValue(body.sender_id) ?? "musu.pro-room",
    text: instruction,
    target_node: target_node && target_node !== "local"
      ? target_node
      : undefined,
    adapter_type: normalizeContextValue(body.adapter_type),
    cwd,
    company_id,
    project_id,
    room_id,
    work_order_id,
    origin: "musu.pro",
  };

  if (outboundPickupRequired) {
    try {
      const order = createRoomWorkOrder({
        owner_key: principal.owner_key,
        room_id,
        instruction,
        work_order_id,
        company_id,
        project_id,
        target_node,
        source_agent_id,
        sender_id: upstreamBody.sender_id,
        channel: upstreamBody.channel,
        adapter_type: upstreamBody.adapter_type,
        workspace_uri: normalizeContextValue(body.workspace_uri),
        cwd,
        permission_envelope: body.permission_envelope,
        trace_id: traceId,
        origin: "musu.pro",
        delivery_mode: "desktop_outbound_pickup",
        status: "queued",
      });
      await upsertRoomWorkOrder(order);
      await appendControlAudit({
        event: "rooms.work_orders",
        actor_id: principal.owner_key,
        actor_email: null,
        owner_key: principal.owner_key,
        node: order.target_node ?? "local",
        command: "room.work_order",
        result: "queued",
        http_status: 202,
        trace_id: traceId,
        created_at: new Date().toISOString(),
        origin: "musu.pro",
        room_id,
        work_order_id: order.work_order_id,
        company_id,
        project_id,
        target_node: order.target_node ?? "local",
      });
      return NextResponse.json(
        {
          ok: true,
          room_id,
          work_order_id: order.work_order_id,
          origin: "musu.pro",
          owner_scoped: true,
          delivery_mode: "desktop_outbound_pickup",
          requires_desktop_outbound_pickup: true,
          work_order: publicRoomWorkOrder(order),
          bridge: null,
        },
        { status: 202 }
      );
    } catch (err) {
      await appendControlAudit({
        event: "rooms.work_orders",
        actor_id: principal.owner_key,
        actor_email: null,
        owner_key: principal.owner_key,
        node: upstreamBody.target_node ?? "local",
        command: "room.work_order",
        result: "store_error",
        http_status: 503,
        trace_id: traceId,
        created_at: new Date().toISOString(),
        origin: "musu.pro",
        room_id,
        work_order_id,
        company_id,
        project_id,
        target_node: upstreamBody.target_node ?? "local",
        reason: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "room_work_order_store_failed", detail: err instanceof Error ? err.message : String(err) },
        { status: 503 }
      );
    }
  }

  try {
    const upstream = await fetch(`${bridgeUrl}/api/tasks/delegate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify(upstreamBody),
      cache: "no-store",
    });

    let payload: unknown = null;
    try {
      payload = await upstream.json();
    } catch {
      payload = { error: "non_json_bridge_response" };
    }

    await appendControlAudit({
      event: "rooms.work_orders",
      actor_id: principal.owner_key,
      actor_email: null,
      owner_key: principal.owner_key,
      node: upstreamBody.target_node ?? "local",
      command: "room.work_order",
      result: upstream.ok ? "accepted" : "bridge_error",
      http_status: upstream.status,
      bridge_status: upstream.status,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      origin: "musu.pro",
      room_id,
      work_order_id,
      company_id,
      project_id,
      target_node: upstreamBody.target_node ?? "local",
    });

    return NextResponse.json(
      {
        room_id,
        work_order_id,
        origin: "musu.pro",
        owner_scoped: true,
        bridge: payload,
      },
      { status: upstream.status }
    );
  } catch (err) {
    await appendControlAudit({
      event: "rooms.work_orders",
      actor_id: principal.owner_key,
      actor_email: null,
      owner_key: principal.owner_key,
      node: upstreamBody.target_node ?? "local",
      command: "room.work_order",
      result: "bridge_error",
      http_status: 503,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      origin: "musu.pro",
      room_id,
      work_order_id,
      company_id,
      project_id,
      target_node: upstreamBody.target_node ?? "local",
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "bridge_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(parsed, 100);
}

function parseWorkOrderStatus(value: string | null): RoomWorkOrderStatus | undefined {
  return ROOM_WORK_ORDER_STATUSES.includes(value as RoomWorkOrderStatus)
    ? (value as RoomWorkOrderStatus)
    : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function parseDeliveryStatus(value: unknown): "queued" | "accepted" | "failed" | undefined {
  if (value === "queued" || value === "accepted" || value === "failed") {
    return value;
  }
  return undefined;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { roomId } = await context.params;
  const room_id = normalizePathContextValue(roomId);
  if (!room_id) {
    return NextResponse.json({ ok: false, error: "room_id required" }, { status: 400 });
  }

  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  const search = req.nextUrl.searchParams;
  try {
    const workOrders = await queryRoomWorkOrders(room_id, {
      owner_key: p2pControlPrincipal(req).owner_key,
      limit: parseLimit(search.get("limit")),
      company_id: normalizeContextValue(search.get("company_id")),
      project_id: normalizeContextValue(search.get("project_id")),
      target_node: normalizeContextValue(search.get("target_node")),
      source_agent_id: normalizeContextValue(search.get("source_agent_id")),
      work_order_id: normalizeContextValue(search.get("work_order_id")),
      status: parseWorkOrderStatus(search.get("status")),
      include_expired: parseBoolean(search.get("include_expired")) ?? false,
    });
    return NextResponse.json({
      schema: "musu.room_work_order_inbox.v1",
      ok: true,
      room_id,
      owner_scoped: true,
      order: "newest_first",
      count: workOrders.length,
      work_orders: workOrders.map(publicRoomWorkOrder),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "room_work_order_query_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { roomId } = await context.params;
  const room_id = normalizePathContextValue(roomId);
  if (!room_id) {
    return NextResponse.json({ ok: false, error: "room_id required" }, { status: 400 });
  }

  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const principal = p2pControlPrincipal(req);
  const traceId = createTraceId();

  let body: {
    schema?: unknown;
    target_node_id?: unknown;
    target_node?: unknown;
    claimant_node_id?: unknown;
    company_id?: unknown;
    project_id?: unknown;
    source_agent_id?: unknown;
    work_order_id?: unknown;
    limit?: unknown;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.schema === "musu.room_work_order_delivery.v1") {
    const target_node = normalizeContextValue(body.target_node_id) ?? normalizeContextValue(body.target_node);
    const work_order_id = normalizeContextValue(body.work_order_id);
    const status = parseDeliveryStatus((body as { status?: unknown }).status);
    if (!target_node) {
      return NextResponse.json({ ok: false, error: "target_node_id required" }, { status: 400 });
    }
    if (!work_order_id) {
      return NextResponse.json({ ok: false, error: "work_order_id required" }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ ok: false, error: "invalid_room_work_order_delivery_status" }, { status: 400 });
    }

    try {
      const order = await markRoomWorkOrderDelivery({
        owner_key: principal.owner_key,
        room_id,
        target_node,
        work_order_id,
        status,
        bridge_task_id: normalizeContextValue((body as { bridge_task_id?: unknown }).bridge_task_id),
        bridge_status: normalizeContextValue((body as { bridge_status?: unknown }).bridge_status),
        error: normalizeContextValue((body as { error?: unknown }).error),
      });
      if (!order) {
        return NextResponse.json(
          { ok: false, error: "room_work_order_not_found", owner_scoped: true },
          { status: 404 }
        );
      }
      await appendControlAudit({
        event: "rooms.work_orders",
        actor_id: principal.owner_key,
        actor_email: null,
        owner_key: principal.owner_key,
        node: target_node,
        command: "room.work_order.delivery",
        result: status === "queued" ? "requeued" : status,
        http_status: 202,
        trace_id: traceId,
        created_at: new Date().toISOString(),
        origin: "musu.pro",
        room_id,
        work_order_id,
        target_node,
        reason: normalizeContextValue((body as { error?: unknown }).error),
      });
      return NextResponse.json(
        {
          schema: "musu.room_work_order_delivery.v1",
          ok: true,
          room_id,
          owner_scoped: true,
          accepted: status === "accepted",
          requeued: status === "queued",
          failed: status === "failed",
          work_order: publicRoomWorkOrder(order),
        },
        { status: 202 }
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      return NextResponse.json(
        {
          ok: false,
          error: detail === "room_work_order_delivery_requires_claim"
            ? detail
            : "room_work_order_delivery_failed",
          detail,
          owner_scoped: true,
        },
        { status: detail === "room_work_order_delivery_requires_claim" ? 409 : 503 }
      );
    }
  }

  if (body.schema !== "musu.room_work_order_claim.v1") {
    return NextResponse.json(
      { ok: false, error: "invalid_room_work_order_patch_schema" },
      { status: 400 }
    );
  }

  const target_node = normalizeContextValue(body.target_node_id) ?? normalizeContextValue(body.target_node);
  if (!target_node) {
    return NextResponse.json({ ok: false, error: "target_node_id required" }, { status: 400 });
  }

  const limit = typeof body.limit === "number" && Number.isFinite(body.limit)
    ? Math.max(1, Math.min(Math.trunc(body.limit), 100))
    : undefined;

  try {
    const claimed = await claimRoomWorkOrders({
      owner_key: principal.owner_key,
      room_id,
      target_node,
      claimant_node_id: normalizeContextValue(body.claimant_node_id) ?? target_node,
      company_id: normalizeContextValue(body.company_id),
      project_id: normalizeContextValue(body.project_id),
      source_agent_id: normalizeContextValue(body.source_agent_id),
      work_order_id: normalizeContextValue(body.work_order_id),
      limit,
    });
    await appendControlAudit({
      event: "rooms.work_orders",
      actor_id: principal.owner_key,
      actor_email: null,
      owner_key: principal.owner_key,
      node: target_node,
      command: "room.work_order.claim",
      result: claimed.length > 0 ? "claimed" : "claim_empty",
      http_status: 202,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      origin: "musu.pro",
      room_id,
      work_order_id: normalizeContextValue(body.work_order_id),
      company_id: normalizeContextValue(body.company_id),
      project_id: normalizeContextValue(body.project_id),
      target_node,
    });
    return NextResponse.json(
      {
        schema: "musu.room_work_order_claim.v1",
        ok: true,
        room_id,
        owner_scoped: true,
        claimed: claimed.length > 0,
        count: claimed.length,
        target_node,
        work_orders: claimed.map(publicRoomWorkOrder),
      },
      { status: 202 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "room_work_order_claim_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 }
    );
  }
}
