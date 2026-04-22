import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

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
  try {
    const body = await request.json();
    const { node_name, command, args = [], cwd, timeout_sec = 30 } = body;

    if (!node_name || !command) {
      return NextResponse.json(
        {
          error: "Missing required fields: node_name, command",
        },
        { status: 400 }
      );
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

    const payload: any = {
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
      return NextResponse.json({
        node: node_name,
        result,
      });
    } else {
      const errorText = await workerResponse.text();
      return NextResponse.json(
        {
          error: "Remote execution failed",
          details: errorText,
        },
        { status: workerResponse.status }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to execute remote process",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
