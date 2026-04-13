import { NextRequest, NextResponse } from "next/server";
import { TOOLS } from "./tools";
import { handleGetDevices } from "./handlers/devices";
import { handleGetTasks, handleCreateTask, handleUpdateTask } from "./handlers/tasks";
import { handleSendMessage } from "./handlers/messaging";
import { handleRunCommand } from "./handlers/runner";
import { handleGetServiceHealth } from "./handlers/health";
import { handleListChannels } from "./handlers/channels";
import { handleSearchWiki } from "./handlers/wiki";

// ── JSON-RPC 2.0 types ───────────────────────────────────────────────────────

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

async function dispatch(req: JsonRpcRequest): Promise<unknown> {
  const params = req.params ?? {};
  switch (req.method) {
    case "tools/list":
      return rpcResult(req.id, { tools: TOOLS });
    case "musu_get_devices":
      return rpcResult(req.id, await handleGetDevices());
    case "musu_get_tasks":
      return rpcResult(req.id, handleGetTasks(params));
    case "musu_create_task":
      return rpcResult(req.id, handleCreateTask(params));
    case "musu_update_task":
      return rpcResult(req.id, handleUpdateTask(params));
    case "musu_send_message":
      return rpcResult(req.id, await handleSendMessage(params));
    case "musu_search_wiki":
      return rpcResult(req.id, handleSearchWiki(params));
    case "musu_run_command":
      return rpcResult(req.id, await handleRunCommand(params));
    case "musu_get_service_health":
      return rpcResult(req.id, await handleGetServiceHealth());
    case "musu_list_channels":
      return rpcResult(req.id, handleListChannels());
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    name: "MUSU MCP Server",
    version: "1.0.0",
    protocol: "json-rpc-2.0",
    endpoint: "/api/mcp",
    tools: TOOLS,
    discovery: "/.well-known/mcp.json",
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(rpcError(null, -32600, "Invalid Request"), { status: 400 });
  }

  const rpc = body as JsonRpcRequest;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return NextResponse.json(rpcError(rpc.id ?? null, -32600, "Invalid Request"), { status: 400 });
  }

  const response = await dispatch(rpc);
  return NextResponse.json(response);
}
