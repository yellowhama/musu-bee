import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

interface NodeConfig {
  name: string;
  tailscale_ip: string;
  url?: string;
}

interface NodesConfig {
  mesh: {
    nodes: NodeConfig[];
  };
}

function bridgeRoutePayload(input: {
  channel: string;
  sender_id: string;
  text: string;
  node?: string;
  adapter_override?: string;
  cost_optimized?: boolean;
}) {
  const targetNode = input.node?.trim();
  const adapterType = input.adapter_override?.trim();
  return {
    channel: input.channel,
    sender_id: input.sender_id,
    text: input.text.trim(),
    ...(targetNode && targetNode !== "local" ? { target_node: targetNode } : {}),
    ...(adapterType
      ? {
          adapter_type: adapterType,
          // Kept for legacy bridges that still read the Python-era field.
          adapter_override: adapterType,
        }
      : {}),
    cost_optimized: input.cost_optimized,
  };
}

async function readNodesConfig(): Promise<NodesConfig> {
  try {
    const configPath = join(homedir(), ".musu", "nodes.toml");
    const content = await readFile(configPath, "utf-8");

    const config: NodesConfig = { mesh: { nodes: [] } };
    const lines = content.split("\n");
    let currentNode: NodeConfig | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("[[mesh.nodes]]")) {
        if (currentNode) config.mesh.nodes.push(currentNode);
        currentNode = { name: "", tailscale_ip: "" };
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
        }
      }
    }

    if (currentNode) config.mesh.nodes.push(currentNode);
    return config;
  } catch {
    return { mesh: { nodes: [] } };
  }
}

/** Parse delegation chain from agent response text.
 *  Detects patterns like "→ CTO", "CTO에게 위임", "delegating to engineer", etc.
 *  Returns e.g. ["CEO", "CTO"] or null if no delegation detected.
 */
function parseDelegationChain(
  sourceChannel: string,
  responseText: string,
): string[] | null {
  const lower = responseText.toLowerCase();
  const knownAgents = ["cto", "engineer", "qa", "cos", "worker", "vp"];

  // ASCII patterns run on lowercased text
  const asciiPatterns = [
    /→\s*(\w+)/g,
    /delegat(?:e|ing|ed)\s+to\s+(\w+)/gi,
    /assign(?:ing|ed)?\s+to\s+(\w+)/gi,
  ];
  // Korean patterns use named capture on original text (Korean chars aren't in \w)
  const koreanPatterns = [
    /(cto|engineer|qa|cos|worker|vp)에게\s+(?:위임|할당)/gi,
    /(cto|engineer|qa|cos|worker|vp)(?:가|이)\s+담당/gi,
  ];

  const found: string[] = [];
  for (const pattern of asciiPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      const name = match[1]?.toLowerCase();
      if (name && knownAgents.includes(name) && !found.includes(name)) {
        found.push(name);
      }
    }
  }
  for (const pattern of koreanPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(responseText)) !== null) {
      const name = match[1]?.toLowerCase();
      if (name && knownAgents.includes(name) && !found.includes(name)) {
        found.push(name);
      }
    }
  }

  if (found.length === 0) return null;
  return [sourceChannel.toUpperCase(), ...found.map((n) => n.toUpperCase())];
}

function localBridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

/** Validate that a URL is an allowed musu-bridge endpoint (http/https, no path traversal). */
function validateBridgeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin; // strip any path/query — only origin is used
  } catch {
    return null;
  }
}

const MUSU_BRIDGE_REMOTE_URL = process.env.MUSU_BRIDGE_REMOTE_URL
  ? validateBridgeUrl(process.env.MUSU_BRIDGE_REMOTE_URL)
  : null;

const AGENT_ROUTE_TIMEOUT_MS = 300_000; // 5 min — matches claude_local default
const AGENT_ROUTE_POLL_INTERVAL_MS = 500;
const TERMINAL_TASK_STATUSES = new Set(["done", "failed", "cancelled"]);

type BridgeTaskStatus = {
  task_id?: string;
  status?: string;
  output?: string | null;
  error?: string | null;
  exit_code?: number | null;
  duration_sec?: number | null;
  route_proof?: unknown;
};

export async function POST(req: NextRequest) {
  let body: {
    channel?: string;
    sender_id?: string;
    text?: string;
    node?: string;
    adapter_override?: string;
    cost_optimized?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { channel, sender_id = "local-user", text, node, adapter_override, cost_optimized } = body;

  if (!channel || !text?.trim()) {
    return NextResponse.json(
      { error: "channel and text are required" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_ROUTE_TIMEOUT_MS);

  // Determine target URL based on selected node
  let targetUrl = localBridgeUrl();

  if (node && node !== "local") {
    // If a specific node is selected, read nodes.toml and find the node's URL
    const nodesConfig = await readNodesConfig();
    const selectedNode = nodesConfig.mesh.nodes.find(n => n.name === node);

    const selectedNodeUrl = selectedNode?.url ? validateBridgeUrl(selectedNode.url) : null;
    if (selectedNodeUrl) {
      // Use the node's configured URL (e.g., https://musu.pro)
      targetUrl = selectedNodeUrl;
    } else if (node === "remote" && MUSU_BRIDGE_REMOTE_URL) {
      // Fallback to MUSU_BRIDGE_REMOTE_URL for legacy "remote" node
      targetUrl = MUSU_BRIDGE_REMOTE_URL;
    }
  }

  try {
    const delegate = await fetch(`${targetUrl}/api/tasks/delegate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildBridgeHeaders(await getBridgeToken()),
      },
      body: JSON.stringify({
        ...bridgeRoutePayload({
          channel,
          sender_id,
          text,
          node,
          adapter_override,
          cost_optimized,
        }),
        allow_duplicate: true,
      }),
      signal: controller.signal,
    });

    if (!delegate.ok) {
      // V23.5 H-2: parse JSON error envelope from bridge if available
      // (uniform DB-write errors surface {error, detail, site}); preserve
      // "bridge_error" string as fallback for non-JSON / legacy responses.
      // Auditor A1 (master plan §5 R4): existing consumers that match
      // data.error === "bridge_error" keep working because the bridge sends
      // exactly that string from V23.5 H-2 onward; opaque upstream errors
      // still degrade to the same literal.
      let errorPayload: {
        error: string;
        detail?: string;
        site?: string;
      } = { error: "bridge_error" };
      try {
        const data = (await delegate.json()) as {
          error?: unknown;
          detail?: unknown;
          site?: unknown;
        };
        if (typeof data?.error === "string" && data.error.length > 0) {
          errorPayload = { error: data.error };
          if (typeof data.detail === "string") {
            errorPayload.detail = data.detail;
          }
          if (typeof data.site === "string") {
            errorPayload.site = data.site;
          }
        }
      } catch {
        // Bridge returned non-JSON (e.g. proxy error, gateway timeout HTML).
        // Keep the bridge_error fallback so consumer matchers stay stable.
      }
      clearTimeout(timer);
      return NextResponse.json(errorPayload, { status: delegate.status });
    }

    const delegated = (await delegate.json()) as {
      task_id?: string;
      status?: string;
    };

    const taskId = delegated.task_id?.trim();
    if (!taskId) {
      clearTimeout(timer);
      return NextResponse.json({ error: "bridge_task_id_missing" }, { status: 502 });
    }

    let data: BridgeTaskStatus | null = null;

    while (!controller.signal.aborted) {
      const statusRes = await fetch(`${targetUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: buildBridgeHeaders(await getBridgeToken()),
        signal: controller.signal,
      });

      if (!statusRes.ok) {
        clearTimeout(timer);
        return NextResponse.json(
          { error: "bridge_task_status_unavailable", task_id: taskId },
          { status: statusRes.status }
        );
      }

      data = (await statusRes.json()) as BridgeTaskStatus;
      const status = data?.status?.trim() ?? "";
      if (TERMINAL_TASK_STATUSES.has(status)) break;

      await new Promise((resolve) => setTimeout(resolve, AGENT_ROUTE_POLL_INTERVAL_MS));
    }

    clearTimeout(timer);

    if (!data || controller.signal.aborted) {
      return NextResponse.json({ error: "agent_timeout", task_id: taskId }, { status: 504 });
    }

    const task = data;

    if (task.status === "failed" || task.status === "cancelled" || task.error) {
      return NextResponse.json(
        {
          error: task.error || `task_${task.status}`,
          task_id: taskId,
          exit_code: task.exit_code ?? null,
        },
        { status: 502 }
      );
    }

    const responseText = task.output ?? "";
    const chain = parseDelegationChain(channel, responseText);

    return NextResponse.json({
      response: responseText,
      agent_id: taskId,
      agent_name: channel,
      adapter_type: adapter_override ?? "",
      task_id: taskId,
      status: task.status ?? "",
      duration_sec: task.duration_sec ?? undefined,
      route_proof: task.route_proof ?? undefined,
      chain,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "agent_timeout" }, { status: 504 });
    }
    console.error("[agent-route] bridge unavailable:", err);
    return NextResponse.json(
      { error: "bridge_unavailable" },
      { status: 503 },
    );
  }
}
