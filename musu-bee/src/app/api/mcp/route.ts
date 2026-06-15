import { NextRequest, NextResponse } from "next/server";
import { authorizeP2pControl } from "@/lib/p2pControlAuth";
import { TOOLS } from "./tools";
import { handleGetDevices } from "./handlers/devices";
import { handleGetTasks, handleCreateTask, handleUpdateTask } from "./handlers/tasks";
import { handleSendMessage } from "./handlers/messaging";
import { handleGetServiceHealth } from "./handlers/health";
import { handleListChannels } from "./handlers/channels";
import { handleSearchWiki } from "./handlers/wiki";
import { handleGetNetworkRunbook } from "./handlers/network";
import {
  handleGetConnectorPolicy,
  handleGetConnectorProofPlan,
  handleListConnectors,
  handleRunConnectorHealthCheck,
} from "./handlers/connectors";

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

function isJsonRpcId(value: unknown): value is string | number | null {
  return value === null || typeof value === "string" || typeof value === "number";
}

function isObjectParams(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Only read-only discovery is safe without auth. Every other method either
// changes state or (musu_run_command / connector health checks) drives a
// privileged action on the worker using the server's own bridge token, so it
// MUST be authenticated. Anything not in this set falls through to the
// authorizeP2pControl gate below.
const ANONYMOUS_METHODS = new Set<string>(["tools/list"]);

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
    case "musu_run_command": {
      const { handleRunCommand } = await import("./handlers/runner");
      return rpcResult(req.id, await handleRunCommand(params));
    }
    case "musu_get_service_health":
      return rpcResult(req.id, await handleGetServiceHealth());
    case "musu_list_channels":
      return rpcResult(req.id, handleListChannels());
    case "musu_get_network_runbook":
      return rpcResult(req.id, handleGetNetworkRunbook());
    case "musu_get_connector_policy":
      return rpcResult(req.id, handleGetConnectorPolicy(params));
    case "musu_list_connectors":
      return rpcResult(req.id, handleListConnectors(params));
    case "musu_get_connector_proof_plan":
      return rpcResult(req.id, handleGetConnectorProofPlan(params));
    case "musu_run_connector_health_check":
      return rpcResult(req.id, await handleRunConnectorHealthCheck(params));
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
  const hasId = Object.prototype.hasOwnProperty.call(rpc, "id");
  const invalidId = hasId && !isJsonRpcId(rpc.id);
  if (
    rpc.jsonrpc !== "2.0" ||
    typeof rpc.method !== "string" ||
    invalidId ||
    (Object.prototype.hasOwnProperty.call(rpc, "params") && !isObjectParams(rpc.params))
  ) {
    return NextResponse.json(rpcError(invalidId ? null : rpc.id ?? null, -32600, "Invalid Request"), { status: 400 });
  }

  // Authenticate every method except read-only discovery. musu_run_command and
  // the connector health checks execute privileged worker actions with the
  // server's bridge token, so an unauthenticated /api/mcp would be remote code
  // execution. The Next middleware does not gate /api, so we gate here.
  if (!ANONYMOUS_METHODS.has(rpc.method)) {
    const failedAuth = authorizeP2pControl(req);
    if (failedAuth) {
      const status = failedAuth.status;
      const code = status === 503 ? -32001 : -32002;
      const message =
        status === 503 ? "p2p control auth not configured" : "unauthorized";
      return NextResponse.json(rpcError(rpc.id ?? null, code, message), { status });
    }
  }

  const response = await dispatch(rpc);
  return NextResponse.json(response);
}
