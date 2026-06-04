import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fileURLToPath } from "url";
import { getBridgeUrl } from "@/lib/bridge-config";
import { getBridgeToken } from "@/lib/bridge-token";
import { authorizeP2pControl } from "@/lib/p2pControlAuth";

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
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }

  const work_order_id = normalizeContextValue(body.work_order_id) ?? generatedWorkOrderId();
  const target_node = normalizeContextValue(body.target_node);
  const bridgeUrl = getBridgeUrl().replace(/\/+$/, "");
  const token = await getBridgeToken();
  const upstreamBody = {
    channel: normalizeContextValue(body.channel) ?? "company-room",
    sender_id: normalizeContextValue(body.sender_id) ?? "musu.pro-room",
    text: instruction,
    target_node: target_node && target_node !== "local"
      ? target_node
      : undefined,
    adapter_type: normalizeContextValue(body.adapter_type),
    cwd: normalizeWorkspaceUri(body.workspace_uri),
    company_id: normalizeContextValue(body.company_id),
    project_id: normalizeContextValue(body.project_id),
    room_id,
    work_order_id,
    origin: "musu.pro",
  };

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
    return NextResponse.json(
      { error: "bridge_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}
