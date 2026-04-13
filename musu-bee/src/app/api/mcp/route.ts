import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, updateTask, getTaskByIdPrefix } from "@/lib/tasks";
import { queryWiki } from "@/lib/wiki";
import type { TaskStatus } from "@/lib/tasks";

const MUSU_PORT_URL = (process.env.MUSU_PORT_URL ?? "http://localhost:1355").trim().replace(/\/+$/, "");
const MUSU_BRIDGE_URL = (process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070").trim().replace(/\/+$/, "");

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "musu_get_devices",
    description: "Get the list of connected MUSU devices with their current CPU, GPU, and RAM utilisation.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "musu_get_tasks",
    description: "List tasks from the MUSU task queue. Optionally filter by scope or status.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "Workspace scope (default: global)" },
        status: {
          type: "array",
          items: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"] },
          description: "Filter by one or more statuses",
        },
        limit: { type: "number", description: "Max number of tasks to return (default: 20)" },
      },
      required: [],
    },
  },
  {
    name: "musu_create_task",
    description: "Create a new task in the MUSU task queue.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        scope: { type: "string", description: "Workspace scope (default: global)" },
        channel: { type: "string", description: "Channel this task belongs to" },
        body: { type: "string", description: "Task body / description" },
        assigned_device: { type: "string", description: "Device ID to assign this task to" },
      },
      required: ["title"],
    },
  },
  {
    name: "musu_update_task",
    description: "Update the status or result of an existing MUSU task. Accepts a task ID prefix.",
    inputSchema: {
      type: "object",
      properties: {
        id_prefix: { type: "string", description: "Task ID or prefix (e.g. 'task-m3k2')" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "review", "done", "blocked"],
          description: "New status",
        },
        result: { type: "string", description: "Result text to attach to the task" },
      },
      required: ["id_prefix"],
    },
  },
  {
    name: "musu_send_message",
    description: "Send a message to a MUSU channel via musu-port WebSocket bridge.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name (e.g. 'general', 'ceo')" },
        text: { type: "string", description: "Message content" },
        sender: { type: "string", description: "Sender display name (default: 'MCP')" },
      },
      required: ["channel", "text"],
    },
  },
  {
    name: "musu_search_wiki",
    description: "Full-text search the MUSU wiki knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        scope: { type: "string", description: "Workspace scope (default: global)" },
        limit: { type: "number", description: "Max results to return (default: 5)" },
      },
      required: ["query"],
    },
  },
];

// ── Tool handlers ───────────────────────────────────────────────────────────

async function handleGetDevices(): Promise<unknown> {
  try {
    const res = await fetch(`${MUSU_PORT_URL}/status`, { next: { revalidate: 0 } });
    if (!res.ok) return { error: `musu_port_http_${res.status}`, devices: [] };
    const data = (await res.json()) as Record<string, unknown>;
    return {
      devices: [
        {
          device_id: data.device_id ?? "local",
          cpu: data.cpu,
          gpu: data.gpu ?? null,
          ram: data.ram,
          status: data.status ?? "ok",
          recommended_for: data.recommended_for ?? [],
        },
      ],
    };
  } catch {
    return { error: "musu_port_unreachable", devices: [] };
  }
}

function handleGetTasks(params: Record<string, unknown>): unknown {
  const scope = typeof params.scope === "string" ? params.scope : undefined;
  const rawStatus = params.status;
  const status = Array.isArray(rawStatus)
    ? (rawStatus as TaskStatus[])
    : typeof rawStatus === "string"
      ? [rawStatus as TaskStatus]
      : undefined;
  const limit = typeof params.limit === "number" ? params.limit : 20;
  const tasks = listTasks({ scope, status, limit });
  return { tasks, count: tasks.length };
}

function handleCreateTask(params: Record<string, unknown>): unknown {
  if (typeof params.title !== "string" || !params.title.trim()) {
    return { error: "title_required" };
  }
  const task = createTask({
    title: params.title,
    scope: typeof params.scope === "string" ? params.scope : undefined,
    channel: typeof params.channel === "string" ? params.channel : undefined,
    body: typeof params.body === "string" ? params.body : undefined,
    assigned_device: typeof params.assigned_device === "string" ? params.assigned_device : undefined,
  });
  return { task };
}

function handleUpdateTask(params: Record<string, unknown>): unknown {
  if (typeof params.id_prefix !== "string" || !params.id_prefix.trim()) {
    return { error: "id_prefix_required" };
  }
  const existing = getTaskByIdPrefix(params.id_prefix);
  if (!existing) return { error: "task_not_found", id_prefix: params.id_prefix };
  const updated = updateTask(existing.id, {
    status: typeof params.status === "string" ? (params.status as TaskStatus) : undefined,
    result: typeof params.result === "string" ? params.result : undefined,
  });
  return { task: updated };
}

async function handleSendMessage(params: Record<string, unknown>): Promise<unknown> {
  if (typeof params.channel !== "string" || typeof params.text !== "string") {
    return { error: "channel_and_text_required" };
  }
  const sender = typeof params.sender === "string" ? params.sender : "mcp";
  try {
    // Route through musu-bridge /api/route (supports channel→agent mapping)
    const res = await fetch(`${MUSU_BRIDGE_URL}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: params.channel,
        sender_id: sender,
        text: params.text,
      }),
    });
    if (!res.ok) return { error: `musu_bridge_http_${res.status}`, sent: false };
    const data = (await res.json()) as Record<string, unknown>;
    return { sent: true, channel: params.channel, response: data };
  } catch {
    return { error: "bridge_unavailable", sent: false };
  }
}

function handleSearchWiki(params: Record<string, unknown>): unknown {
  if (typeof params.query !== "string") return { error: "query_required", results: [] };
  try {
    const results = queryWiki(
      params.query,
      typeof params.scope === "string" ? params.scope : "global",
      typeof params.limit === "number" ? params.limit : 5,
    );
    return { results, count: results.length };
  } catch {
    return { error: "wiki_unavailable", results: [] };
  }
}

// ── JSON-RPC 2.0 dispatch ───────────────────────────────────────────────────

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
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

// ── Route handlers ──────────────────────────────────────────────────────────

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
