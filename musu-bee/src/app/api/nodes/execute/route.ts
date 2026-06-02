import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { appendControlAudit, createTraceId } from "@/lib/control-audit";
import { isAllowedNodeExecuteCommand, requireOperator } from "@/lib/operator-api-security";

interface NodeConfig {
  name: string;
  tailscale_ip: string;
  url?: string;
  roles?: string[];
  gpu?: string;
}

interface NodesConfig {
  mesh: {
    worker_port?: number;
    nodes: NodeConfig[];
  };
}

interface ExecuteBody {
  node_name?: unknown;
  command?: unknown;
  args?: unknown;
  cwd?: unknown;
  timeout_sec?: unknown;
}

interface ExecutePayload {
  command: string;
  args: string[];
  timeout_sec: number;
  env: Record<string, string>;
  cwd?: string;
}

async function readNodesConfig(): Promise<NodesConfig> {
  try {
    const configPath = join(homedir(), ".musu", "nodes.toml");
    const content = await readFile(configPath, "utf-8");

    const config: NodesConfig = {
      mesh: {
        nodes: [],
      },
    };

    const lines = content.split("\n");
    let currentNode: NodeConfig | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("[[mesh.nodes]]")) {
        if (currentNode) {
          config.mesh.nodes.push(currentNode);
        }
        currentNode = {
          name: "",
          tailscale_ip: "",
        };
        continue;
      }

      if (trimmed.startsWith("worker_port")) {
        const match = trimmed.match(/worker_port\s*=\s*(\d+)/);
        if (match) {
          config.mesh.worker_port = parseInt(match[1]);
        }
        continue;
      }

      if (currentNode) {
        if (trimmed.startsWith("name =")) {
          const match = trimmed.match(/name\s*=\s*"([^"]+)"/);
          if (match) currentNode.name = match[1];
        } else if (trimmed.startsWith("tailscale_ip =")) {
          const match = trimmed.match(/tailscale_ip\s*=\s*"([^"]+)"/);
          if (match) currentNode.tailscale_ip = match[1];
        }
      }
    }

    if (currentNode) {
      config.mesh.nodes.push(currentNode);
    }

    return config;
  } catch (error) {
    console.error("Failed to read nodes.toml:", error);
    return {
      mesh: {
        nodes: [],
      },
    };
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOperator(request);
  if ("response" in auth) {
    return auth.response;
  }

  const traceId = createTraceId();
  let nodeForAudit = "unknown";
  let commandForAudit = "";

  try {
    const body = (await request.json()) as ExecuteBody;
    const { node_name, command } = body;
    const args = Array.isArray(body.args)
      ? body.args.filter((arg): arg is string => typeof arg === "string")
      : [];
    const cwd = typeof body.cwd === "string" ? body.cwd : undefined;
    const timeout_sec =
      typeof body.timeout_sec === "number"
        ? Math.min(Math.max(Math.floor(body.timeout_sec), 1), 30)
        : 30;

    if (typeof node_name !== "string" || typeof command !== "string") {
      return NextResponse.json(
        {
          error: "Missing required fields: node_name, command",
        },
        { status: 400 }
      );
    }

    nodeForAudit = node_name;
    commandForAudit = command;

    if (!isAllowedNodeExecuteCommand(command, args)) {
      await appendControlAudit({
        event: "nodes.execute",
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        node: node_name,
        command,
        result: "rejected",
        http_status: 400,
        trace_id: traceId,
        created_at: new Date().toISOString(),
        reason: "command outside node execute allowlist",
      });
      return NextResponse.json({ error: "command is not allowlisted" }, { status: 400 });
    }

    const config = await readNodesConfig();
    const workerPort = config.mesh.worker_port || 9700;

    const targetNode = config.mesh.nodes.find((n) => n.name === node_name);

    if (!targetNode) {
      return NextResponse.json(
        {
          error: `Node '${node_name}' not found in nodes.toml`,
        },
        { status: 404 }
      );
    }

    if (!targetNode.tailscale_ip) {
      return NextResponse.json(
        {
          error: `Node '${node_name}' has no tailscale_ip configured`,
        },
        { status: 400 }
      );
    }

    const workerUrl = `http://${targetNode.tailscale_ip}:${workerPort}`;

    const payload: ExecutePayload = {
      command,
      args,
      timeout_sec,
      env: {},
    };

    if (cwd) {
      payload.cwd = cwd;
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const token = process.env.MUSU_WORKER_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const workerResponse = await fetch(`${workerUrl}/execute/process`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout((timeout_sec + 5) * 1000),
    });

    if (workerResponse.ok) {
      const result = await workerResponse.json();
      await appendControlAudit({
        event: "nodes.execute",
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        node: node_name,
        command,
        result: "accepted",
        http_status: 200,
        bridge_status: workerResponse.status,
        trace_id: traceId,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({
        node: node_name,
        result,
      });
    } else {
      const errorText = await workerResponse.text();
      await appendControlAudit({
        event: "nodes.execute",
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        node: node_name,
        command,
        result: "bridge_error",
        http_status: workerResponse.status,
        bridge_status: workerResponse.status,
        trace_id: traceId,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          error: "Remote execution failed",
          details: errorText,
        },
        { status: workerResponse.status }
      );
    }
  } catch (error: unknown) {
    await appendControlAudit({
      event: "nodes.execute",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: nodeForAudit,
      command: commandForAudit,
      result: "bridge_error",
      http_status: 500,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      {
        error: "Failed to execute remote process",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 }
    );
  }
}
