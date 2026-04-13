import type { CommandContext } from "./types";
import { makeId } from "./utils";

export function createApprovalHandler(ctx: CommandContext) {
  return async (text: string): Promise<boolean> => {
    const { appendChatMessage, channel } = ctx;

    // /approve <id_prefix>
    if (text.startsWith("/approve ")) {
      const prefix = text.slice(9).trim();
      if (!prefix) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      try {
        const res = await fetch(`/api/tasks?id=${encodeURIComponent(prefix)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        });
        const data = (await res.json()) as { task?: { id: string; title: string }; error?: string };
        appendChatMessage({
          id: makeId(), channelId: channel, sender: "System", senderKind: "system",
          text: data.task ? `✅ Approved: **${data.task.title}** — now in progress` : `Approve failed: ${data.error ?? "task not found"}`,
          timestamp: new Date(),
        });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Approve failed: network error", timestamp: new Date() });
      }
      return true;
    }

    // /reject <id_prefix>
    if (text.startsWith("/reject ")) {
      const prefix = text.slice(8).trim();
      if (!prefix) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      try {
        const res = await fetch(`/api/tasks?id=${encodeURIComponent(prefix)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "blocked", result: "Rejected by user" }),
        });
        const data = (await res.json()) as { task?: { id: string; title: string }; error?: string };
        appendChatMessage({
          id: makeId(), channelId: channel, sender: "System", senderKind: "system",
          text: data.task ? `❌ Rejected: **${data.task.title}**` : `Reject failed: ${data.error ?? "task not found"}`,
          timestamp: new Date(),
        });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Reject failed: network error", timestamp: new Date() });
      }
      return true;
    }

    return false;
  };
}
