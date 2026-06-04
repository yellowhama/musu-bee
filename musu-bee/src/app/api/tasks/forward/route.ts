import { NextRequest, NextResponse } from "next/server";
import { fileURLToPath } from "url";
import { getBridgeUrl } from "@/lib/bridge-config";
import { getBridgeToken } from "@/lib/bridge-token";

export const dynamic = "force-dynamic";

const MAX_CONTEXT_VALUE_CHARS = 160;

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

function defaultControlPlaneOrigin(req: NextRequest): string {
  try {
    const hostname = new URL(req.url).hostname.toLowerCase();
    if (hostname === "musu.pro" || hostname.endsWith(".musu.pro")) {
      return "musu.pro";
    }
  } catch {
    // Keep the local dashboard contract explicit if URL parsing ever fails.
  }
  return "local_dashboard";
}

export async function POST(req: NextRequest) {
  let body: {
    instruction?: unknown;
    channel?: unknown;
    sender_id?: unknown;
    target_node?: unknown;
    adapter_type?: unknown;
    workspace_uri?: unknown;
    company_id?: unknown;
    project_id?: unknown;
    room_id?: unknown;
    work_order_id?: unknown;
    origin?: unknown;
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

  const bridgeUrl = getBridgeUrl().replace(/\/+$/, "");
  const token = await getBridgeToken();
  const upstreamBody = {
    channel: typeof body.channel === "string" ? body.channel : "dashboard-agent",
    sender_id: typeof body.sender_id === "string" ? body.sender_id : "dashboard",
    text: instruction,
    target_node: typeof body.target_node === "string" && body.target_node !== "local"
      ? body.target_node
      : undefined,
    adapter_type: typeof body.adapter_type === "string" ? body.adapter_type : undefined,
    cwd: normalizeWorkspaceUri(body.workspace_uri),
    company_id: normalizeContextValue(body.company_id),
    project_id: normalizeContextValue(body.project_id),
    room_id: normalizeContextValue(body.room_id),
    work_order_id: normalizeContextValue(body.work_order_id),
    origin: normalizeContextValue(body.origin) ?? defaultControlPlaneOrigin(req),
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

    return NextResponse.json(payload, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: "bridge_unavailable", detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
