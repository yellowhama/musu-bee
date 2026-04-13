import type { CommandContext } from "./types";
import { makeId } from "./utils";

const WORKER_BASE =
  process.env.NEXT_PUBLIC_MUSU_WORKER_URL ?? "http://localhost:9700";

export function createRunHandler(ctx: CommandContext) {
  return async (text: string): Promise<boolean> => {
    const { appendChatMessage, channel, setIsAgentTyping } = ctx;

    if (!text.startsWith("/run ")) return false;

    // Parse: /run <cmd> [--device <id>]
    const rest = text.slice(5).trim();
    if (!rest) return false;

    let command = rest;
    let deviceOverride: string | null = null;
    const deviceFlag = rest.match(/\s--device\s+(\S+)$/);
    if (deviceFlag) {
      deviceOverride = deviceFlag[1];
      command = rest.slice(0, deviceFlag.index).trim();
    }

    appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
    setIsAgentTyping(true);

    const workerUrl = deviceOverride ? `http://${deviceOverride}:9700` : WORKER_BASE;

    try {
      const res = await fetch(`${workerUrl}/execute/cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: command, cli_type: "bash", timeout_sec: 60 }),
      });

      if (!res.ok) throw new Error(`worker HTTP ${res.status}`);

      const data = (await res.json()) as {
        stdout?: string;
        stderr?: string;
        exit_code?: number;
        success?: boolean;
      };

      const output = [data.stdout?.trim(), data.stderr?.trim()].filter(Boolean).join("\n");
      const exitNote = data.exit_code !== 0 ? ` (exit ${data.exit_code})` : "";
      const reply = output ? `\`\`\`\n${output}\n\`\`\`${exitNote}` : `(no output)${exitNote}`;

      appendChatMessage({
        id: makeId(), channelId: channel,
        sender: deviceOverride ?? "worker",
        senderKind: "ai",
        text: reply,
        timestamp: new Date(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "worker request failed";
      appendChatMessage({ id: makeId(), channelId: channel, sender: "System", senderKind: "system", text: `Run failed: ${msg}`, timestamp: new Date() });
    } finally {
      setIsAgentTyping(false);
    }
    return true;
  };
}
