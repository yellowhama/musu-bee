import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { checkChatRateLimit } from "@/lib/chatRateLimit";
import { queryWiki } from "@/lib/wiki";

const CLAUDE_CLI_PATH =
  process.env.CLAUDE_CLI_PATH ?? "/home/hugh51/.local/bin/claude";
const CLAUDE_CLI_TIMEOUT_MS = 120_000;

const MUSU_SYSTEM_PROMPT = `You are the MUSU AI assistant — the interface to a multi-machine AI control plane.
MUSU coordinates AI work across the user's devices. Users talk to you to route tasks, check device status, and orchestrate work across their machines.
Key behaviors:
- Always respond in the same language the user writes in (Korean → Korean, English → English).
- When the user asks to run something, acknowledge which device it would go to (if known).
- You are NOT a general-purpose assistant. Stay focused on MUSU capabilities: device orchestration, agent coordination, task routing.
- Be concise. Operators don't want essays.`;

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

  const fullMessage = systemContext
    ? `${MUSU_SYSTEM_PROMPT}\n\n${systemContext}\n\nUser: ${message}`
    : message;

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

      const timer = setTimeout(() => {
        child.kill();
        enqueue({ error: "claude CLI timeout" });
        finish();
      }, CLAUDE_CLI_TIMEOUT_MS);

      const child = spawn(CLAUDE_CLI_PATH, ["--print", fullMessage], {
        env: { ...process.env },
      });

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text) enqueue({ token: text });
      });

      child.on("close", (code) => {
        if (code !== 0) {
          enqueue({ error: `claude CLI exited ${code}` });
        }
        finish();
      });

      child.on("error", (err) => {
        enqueue({ error: `claude CLI spawn error: ${err.message}` });
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
