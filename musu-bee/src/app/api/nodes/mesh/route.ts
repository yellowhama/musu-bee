import { NextResponse } from "next/server";
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
    self?: string;
    worker_port?: number;
    health_interval_sec?: number;
    nodes: NodeConfig[];
  };
}

async function readNodesConfig(): Promise<NodesConfig> {
  try {
    const configPath = join(homedir(), ".musu", "nodes.toml");
    const content = await readFile(configPath, "utf-8");

    // Simple TOML parser for our specific structure
    const config: NodesConfig = {
      mesh: {
        nodes: [],
      },
    };

    const lines = content.split("\n");
    let currentNode: NodeConfig | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("[")) {
        if (trimmed === "[[mesh.nodes]]") {
          if (currentNode) {
            config.mesh.nodes.push(currentNode);
          }
          currentNode = {
            name: "",
            tailscale_ip: "",
          };
        } else if (trimmed === "[mesh]") {
          // ignore
        } else {
          // Some other section like [[mesh.agent_assignments]], stop parsing node properties
          if (currentNode) {
            config.mesh.nodes.push(currentNode);
            currentNode = null;
          }
        }
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
        } else if (trimmed.startsWith("url =")) {
          const match = trimmed.match(/url\s*=\s*"([^"]+)"/);
          if (match) currentNode.url = match[1];
        } else if (trimmed.startsWith("gpu =")) {
          const match = trimmed.match(/gpu\s*=\s*"([^"]+)"/);
          if (match) currentNode.gpu = match[1];
        } else if (trimmed.startsWith("roles =")) {
          const match = trimmed.match(/roles\s*=\s*\[([^\]]+)\]/);
          if (match) {
            currentNode.roles = match[1]
              .split(",")
              .map((r) => r.trim().replace(/"/g, ""));
          }
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

async function fetchNodeHealth(
  node: NodeConfig,
  workerPort: number
): Promise<any> {
  const workerUrl = `http://${node.tailscale_ip}:${workerPort}`;
  const bridgeUrl = `http://${node.tailscale_ip}:8070`;

  try {
    // Try portd first, fallback to bridge for health check
    let healthRes = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!healthRes?.ok) {
      healthRes = await fetch(`${bridgeUrl}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    }
    const capRes = await fetch(`${workerUrl}/capabilities`, { signal: AbortSignal.timeout(5000) }).catch(() => null);

    const health = healthRes?.ok ? await healthRes.json() : {};
    const capabilities = capRes?.ok ? await capRes.json() : {};

    return {
      name: node.name,
      tailscale_ip: node.tailscale_ip,
      worker_url: workerUrl,
      roles: node.roles || [],
      gpu: node.gpu || "",
      status: healthRes.ok ? "online" : "degraded",
      health,
      capabilities,
    };
  } catch (error: any) {
    return {
      name: node.name,
      tailscale_ip: node.tailscale_ip,
      worker_url: workerUrl,
      roles: node.roles || [],
      gpu: node.gpu || "",
      status: "offline",
      error: error.message,
    };
  }
}

export async function GET() {
  try {
    const config = await readNodesConfig();
    const workerPort = 1355; // Force new musu-portd port, ignore legacy worker_port in nodes.toml

    const nodesWithHealth = await Promise.all(
      config.mesh.nodes.map((node) => fetchNodeHealth(node, workerPort))
    );

    return NextResponse.json({
      nodes: nodesWithHealth,
      worker_port: workerPort,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to fetch nodes",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
