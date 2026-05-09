import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { checkChatRateLimit } from "@/lib/chatRateLimit";
import { buildMusuCliPrompt } from "@/lib/musuSystemPrompt";
import { queryWiki } from "@/lib/wiki";

// Set MUSU_AI_CLI to your AI CLI binary (claude, codex, gemini, etc.)
// Leave unset to disable the CLI fallback entirely.
const MUSU_AI_CLI = process.env.MUSU_AI_CLI ?? process.env.CLAUDE_CLI_PATH;
// Args passed before the prompt. Defaults to --print (Claude Code style).
// Override with MUSU_AI_CLI_ARGS for other CLIs, e.g. "-p" for Gemini.
const MUSU_AI_CLI_ARGS = (process.env.MUSU_AI_CLI_ARGS ?? "--print")
  .split(" ")
  .filter(Boolean);
const MUSU_AI_CLI_TIMEOUT_MS = 120_000;

function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const message = searchParams.get("message");

  if (!message || !message.trim()) {
    return new Response(sseData({ error: "message required" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const rateLimit = checkChatRateLimit(req);
  if (rateLimit.limited) {
    return new Response(sseData({ error: "rate limit exceeded" }), {
      status: 429,
      headers: {
        "Content-Type": "text/event-stream",
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    });
  }

  // Build wiki context
  let systemContext: string | undefined;
  try {
    const scope = req.headers.get("x-musu-scope") ?? "global";
    const pages = queryWiki(message, scope, 3);
    if (pages.length > 0) {
      systemContext =
        "## Relevant Knowledge\n" +
        pages
          .map((p) => {
            const lines = [`### ${p.title}`, p.summary ?? ""];
            if (p.key_points?.length) {
              lines.push(...p.key_points.map((kp) => `- ${kp}`));
            }
            return lines.join("\n");
          })
          .join("\n\n");
    }
  } catch {
    // wiki unavailable — proceed without context
  }

  const fullMessage = buildMusuCliPrompt(message, systemContext);

  const stream = new ReadableStream({
    start(controller) {
      let settled = false;

      function enqueue(payload: Record<string, unknown>) {
        try {
          controller.enqueue(new TextEncoder().encode(sseData(payload)));
        } catch {
          // controller may be closed
        }
      }

      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        enqueue({ done: true });
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      if (!MUSU_AI_CLI) {
        enqueue({ error: "AI CLI not configured (set MUSU_AI_CLI)" });
        finish();
        return;
      }

      const timer = setTimeout(() => {
        child.kill();
        enqueue({ error: "AI CLI timeout" });
        finish();
      }, MUSU_AI_CLI_TIMEOUT_MS);

      const child = spawn(MUSU_AI_CLI, [...MUSU_AI_CLI_ARGS, fullMessage], {
        env: { ...process.env },
      });

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text) enqueue({ token: text });
      });

      child.on("close", (code) => {
        if (code !== 0) {
          enqueue({ error: `AI CLI exited ${code}` });
        }
        finish();
      });

      child.on("error", (err) => {
        enqueue({ error: `AI CLI spawn error: ${err.message}` });
        finish();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
