import type { CommandContext } from "./types";
import { makeId } from "./utils";

export function createRouteHandler(ctx: CommandContext) {
  return async (text: string): Promise<boolean> => {
    const { appendChatMessage, channel } = ctx;

    if (!text.startsWith("@route ")) return false;
    const task = text.slice(7).trim();
    if (!task) return false;

    appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });

    const lower = task.toLowerCase();
    const resource =
      lower.includes("gpu") || lower.includes("model") || lower.includes("llm") || lower.includes("추론")
        ? "gpu"
        : lower.includes("cpu") || lower.includes("compute") || lower.includes("빌드")
          ? "cpu"
          : "general";

    try {
      const [statusRes, routeRes] = await Promise.all([
        fetch("/api/device-status"),
        fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource_requirement: resource }),
        }),
      ]);

      const status = statusRes.ok
        ? (await statusRes.json()) as { cpu?: number; gpu?: number | null; ram?: number; device_id?: string; recommended_for?: string[] }
        : null;
      const routing = routeRes.ok
        ? (await routeRes.json()) as { selected_host?: string; reason_code?: string }
        : null;

      const host = routing?.selected_host ?? status?.device_id ?? "local";
      const reason = routing?.reason_code ?? "local_default";
      const gpuLine = status?.gpu != null ? ` | GPU ${status.gpu}%` : "";
      const reply =
        `**라우팅 결정**: \`${resource}\` 작업 → **${host}**\n` +
        `이유: \`${reason}\`\n` +
        (status ? `현재 상태: CPU ${status.cpu ?? "?"}%${gpuLine} | RAM ${status.ram ?? "?"}%` : "");

      appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: reply, timestamp: new Date() });
    } catch {
      appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Routing query failed: network error", timestamp: new Date() });
    }
    return true;
  };
}
