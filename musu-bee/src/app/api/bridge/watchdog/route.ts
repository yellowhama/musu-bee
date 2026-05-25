import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { appendControlAudit, createTraceId } from "@/lib/control-audit";
import { getUserFromRequest } from "@/lib/auth-server";

const BRIDGE_URL =
  getBridgeUrl();

const WATCHDOG_COMMANDS = new Set(["bridge:start", "bridge:stop", "bridge:restart", "agents:cleanup"]);

function nodeParam(req: NextRequest): string | null {
  const node = req.nextUrl.searchParams.get("node");
  if (!node || node.includes("/") || node.includes("..")) {
    return null;
  }
  return node;
}

async function forwardBridge(path: string, init: RequestInit): Promise<{ response: NextResponse; status: number }> {
  const target = new URL(`/api/${path.replace(/^\/+/, "")}`, BRIDGE_URL);
  const token = process.env.MUSU_BRIDGE_TOKEN ?? "";

  try {
    const res = await fetch(target.toString(), {
      ...init,
      headers: buildBridgeHeaders(token),
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON bridge output is still useful for operators.
    }
    return { response: NextResponse.json(body, { status: res.status }), status: res.status };
  } catch {
    return {
      response: NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 }),
      status: 503,
    };
  }
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const node = nodeParam(req);
  if (!node) {
    return NextResponse.json({ error: "node is required" }, { status: 400 });
  }
  const { response } = await forwardBridge(`watchdog/${encodeURIComponent(node)}/status`, { method: "GET" });
  return response;
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const node = nodeParam(req);
  const command = req.nextUrl.searchParams.get("cmd");
  const traceId = createTraceId();

  if (!node) {
    return NextResponse.json({ error: "node is required" }, { status: 400 });
  }
  if (!command || !WATCHDOG_COMMANDS.has(command)) {
    await appendControlAudit({
      event: "watchdog.command",
      actor_id: user.id,
      actor_email: user.email ?? null,
      node,
      command: command ?? "",
      result: "rejected",
      http_status: 400,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: "invalid watchdog command",
    });
    return NextResponse.json({ error: "invalid watchdog command" }, { status: 400 });
  }
  const { response, status } = await forwardBridge(`watchdog/${encodeURIComponent(node)}/${encodeURIComponent(command)}`, {
    method: "POST",
  });
  await appendControlAudit({
    event: "watchdog.command",
    actor_id: user.id,
    actor_email: user.email ?? null,
    node,
    command,
    result: status >= 200 && status < 300 ? "accepted" : "bridge_error",
    http_status: status,
    bridge_status: status,
    trace_id: traceId,
    created_at: new Date().toISOString(),
  });
  return response;
}
