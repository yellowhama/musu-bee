import type { CommandContext } from "./types";
import { makeId } from "./utils";

export function createWikiHandler(ctx: CommandContext) {
  return async (text: string): Promise<boolean> => {
    const { appendChatMessage, channel, setIsAgentTyping } = ctx;

    // /learn <content> → save to wiki
    if (text.startsWith("/learn ")) {
      const content = text.slice(7).trim();
      if (!content) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      setIsAgentTyping(true);
      try {
        const res = await fetch("/api/wiki", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, scope: "global" }),
        });
        const data = (await res.json()) as { ok?: boolean; page?: { title?: string; id?: string }; error?: string };
        appendChatMessage({
          id: makeId(), channelId: channel, sender: "System", senderKind: "system",
          text: data.ok
            ? `Saved to wiki: "${data.page?.title ?? data.page?.id}"`
            : `Wiki save failed: ${data.error ?? "unknown error"}`,
          timestamp: new Date(),
        });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Wiki save failed: network error", timestamp: new Date() });
      } finally {
        setIsAgentTyping(false);
      }
      return true;
    }

    // @wiki <query> → search wiki and show results
    if (text.startsWith("@wiki ")) {
      const query = text.slice(6).trim();
      if (!query) return false;
      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      setIsAgentTyping(true);
      try {
        const res = await fetch(`/api/wiki?q=${encodeURIComponent(query)}&scope=global`);
        const data = (await res.json()) as { pages?: Array<{ title?: string; summary?: string; key_points?: string[] }> };
        const pages = data.pages ?? [];
        const reply =
          pages.length === 0
            ? `No wiki results for "${query}".`
            : pages
                .map((p, i) => {
                  const kps = (p.key_points ?? []).slice(0, 3).map((kp) => `  • ${kp}`).join("\n");
                  return `**${i + 1}. ${p.title ?? "—"}**\n${p.summary ?? ""}\n${kps}`;
                })
                .join("\n\n");
        appendChatMessage({ id: makeId(), channelId: channel, sender: "Wiki", senderKind: "ai", text: reply, timestamp: new Date() });
      } catch {
        appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: "Wiki query failed: network error", timestamp: new Date() });
      } finally {
        setIsAgentTyping(false);
      }
      return true;
    }

    return false;
  };
}
