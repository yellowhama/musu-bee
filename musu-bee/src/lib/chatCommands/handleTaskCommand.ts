import type { CommandContext } from "./types";
import { makeId } from "./utils";

export function createTaskHandler(ctx: CommandContext) {
  return async (text: string): Promise<boolean> => {
    const { appendChatMessage, channel } = ctx;

    // /task <title> → create task + auto-assign to best device
    if (text.startsWith("/task ")) {
      const title = text.slice(6).trim();
      if (!title) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, channel, scope: "global" }),
        });
        const data = (await res.json()) as { task?: { id: string; title: string }; error?: string };
        if (!data.task) {
          appendChatMessage({
            id: makeId(), channelId: channel, sender: "System", senderKind: "system",
            text: `Task creation failed: ${data.error ?? "unknown"}`,
            timestamp: new Date(),
          });
          return true;
        }

        // Auto-assign: call /api/route to get best device
        let assignedDevice: string | null = null;
        try {
          const routeRes = await fetch("/api/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resource_requirement: "general" }),
          });
          if (routeRes.ok) {
            const routing = (await routeRes.json()) as { selected_host?: string; reason_code?: string };
            assignedDevice = routing.selected_host ?? null;
            if (assignedDevice) {
              await fetch(`/api/tasks?id=${encodeURIComponent(data.task.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assigned_device: assignedDevice }),
              });
            }
          }
        } catch {
          // routing failed — task still created, just unassigned
        }

        const deviceNote = assignedDevice ? ` → **${assignedDevice}**` : "";
        appendChatMessage({
          id: makeId(), channelId: channel, sender: "System", senderKind: "system",
          text: `✓ Task created: **${data.task.title}** \`${data.task.id}\`${deviceNote}`,
          timestamp: new Date(),
        });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Task creation failed: network error", timestamp: new Date() });
      }
      return true;
    }

    // /tasks → list active tasks
    if (text === "/tasks") {
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      try {
        const res = await fetch("/api/tasks?scope=global&status=todo,in_progress,review");
        const data = (await res.json()) as { tasks?: Array<{ id: string; title: string; status: string }> };
        const tasks = data.tasks ?? [];
        const reply = tasks.length === 0
          ? "No active tasks."
          : tasks.map((t) => `\`${t.id.slice(0, 12)}\` **[${t.status}]** ${t.title}`).join("\n");
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: reply, timestamp: new Date() });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Failed to fetch tasks.", timestamp: new Date() });
      }
      return true;
    }

    // /done <id_prefix> → mark done
    if (text.startsWith("/done ")) {
      const prefix = text.slice(6).trim();
      if (!prefix) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      try {
        const res = await fetch(`/api/tasks?id=${encodeURIComponent(prefix)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
        const data = (await res.json()) as { task?: { id: string; title: string }; error?: string };
        appendChatMessage({
          id: makeId(), channelId: channel, sender: "System", senderKind: "system",
          text: data.task ? `✓ Done: **${data.task.title}**` : `Failed: ${data.error ?? "task not found"}`,
          timestamp: new Date(),
        });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Failed to update task.", timestamp: new Date() });
      }
      return true;
    }

    // /block <id_prefix> → mark blocked
    if (text.startsWith("/block ")) {
      const prefix = text.slice(7).trim();
      if (!prefix) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      try {
        const res = await fetch(`/api/tasks?id=${encodeURIComponent(prefix)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "blocked" }),
        });
        const data = (await res.json()) as { task?: { id: string; title: string }; error?: string };
        appendChatMessage({
          id: makeId(), channelId: channel, sender: "System", senderKind: "system",
          text: data.task ? `⚠ Blocked: **${data.task.title}**` : `Failed: ${data.error ?? "task not found"}`,
          timestamp: new Date(),
        });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Failed to update task.", timestamp: new Date() });
      }
      return true;
    }

    return false;
  };
}
