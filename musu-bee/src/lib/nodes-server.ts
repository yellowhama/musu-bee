import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { RegistryNode } from "./types/node";

interface NodeConfig {
  name: string;
  tailscale_ip: string;
  url?: string;
  roles?: string[];
  gpu?: string;
}

interface NodesConfig {
  mesh: {
    nodes: NodeConfig[];
  };
}

const NODE_HEALTH_TIMEOUT_MS = 3_000;

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
          if (currentNode) {
            config.mesh.nodes.push(currentNode);
            currentNode = null;
          }
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

async function probeNodeHealth(node: NodeConfig): Promise<{
  checkedAt: string;
  ok: boolean;
  source: string;
  error?: string;
}> {
  const baseUrl = (node.url || `http://${node.tailscale_ip}:8070`).replace(/\/+$/, "");
  const checkedAt = new Date().toISOString();

  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(NODE_HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });

    return {
      checkedAt,
      ok: res.ok,
      source: `${baseUrl}/health`,
      error: res.ok ? undefined : `status_${res.status}`,
    };
  } catch (error) {
    return {
      checkedAt,
      ok: false,
      source: `${baseUrl}/health`,
      error: error instanceof Error ? error.message : "health_probe_failed",
    };
  }
}

export async function listNodes(): Promise<RegistryNode[]> {
  try {
    const config = await readNodesConfig();

    return Promise.all(
      config.mesh.nodes.map(async (node) => {
        const health = await probeNodeHealth(node);

        return {
          id: `local-${node.name}`,
          user_id: "local-user",
          node_name: node.name,
          public_url: node.url || `http://${node.tailscale_ip}:8070`,
          last_seen: health.ok ? health.checkedAt : null,
          health_status: health.ok ? "online" : "offline",
          meta: {
            health_checked_at: health.checkedAt,
            health_source: health.source,
            health_error: health.error,
          },
          gpu: node.gpu,
          roles: node.roles,
        } satisfies RegistryNode;
      })
    );
  } catch (error) {
    console.error("Failed to list nodes in server component:", error);
    return [];
  }
}
