import type { CommandContext } from "./types";
import { makeId } from "./utils";

/**
 * Handle /model [adapter_type] command.
 * Updates the session's active adapter override.
 */
export function createModelHandler(ctx: CommandContext, setAdapter: (adapter: string | null) => void) {
  return async (text: string) => {
    const parts = text.split(" ");
    if (parts.length < 2) {
      ctx.appendChatMessage({
        id: makeId(),
        channelId: ctx.channel,
        sender: "System",
        senderKind: "system",
        text: "Usage: /model [claude_local | gemini_local | codex_local | null]",
        timestamp: new Date(),
      });
      return;
    }

    const adapter = parts[1].toLowerCase();
    
    if (adapter === "null" || adapter === "none" || adapter === "default") {
      setAdapter(null);
      ctx.appendChatMessage({
        id: makeId(),
        channelId: ctx.channel,
        sender: "System",
        senderKind: "system",
        text: "Restored to agent default model.",
        timestamp: new Date(),
      });
    } else {
      // Validate adapter type roughly
      const valid = ["claude_local", "gemini_local", "codex_local", "hermes", "claude", "gemini", "codex"];
      let normalized = adapter;
      if (adapter === "claude") normalized = "claude_local";
      if (adapter === "gemini") normalized = "gemini_local";
      if (adapter === "codex") normalized = "codex_local";

      if (!valid.includes(normalized)) {
        ctx.appendChatMessage({
          id: makeId(),
          channelId: ctx.channel,
          sender: "System",
          senderKind: "system",
          text: `Unknown adapter type: ${adapter}. Choose from: claude, gemini, codex.`,
          timestamp: new Date(),
        });
        return;
      }

      setAdapter(normalized);
      ctx.appendChatMessage({
        id: makeId(),
        channelId: ctx.channel,
        sender: "System",
        senderKind: "system",
        text: `Model switched to ${normalized}. Applied to all messages in this session.`,
        timestamp: new Date(),
      });
    }
  };
}
