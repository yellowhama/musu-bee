import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { checkChatRateLimit } from "@/lib/chatRateLimit";
import { buildMusuCliPrompt, buildMusuSystemPrompt } from "@/lib/musuSystemPrompt";
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

const MUSU_PORT_URL = (process.env.MUSU_PORT_URL ?? "http://127.0.0.1:11434").replace(
  /\/+$/,
  ""
);
const MUSU_LLM_URL = (process.env.MUSU_LLM_URL ?? "http://127.0.0.1:11434").replace(
  /\/+$/,
  ""
);
const MUSU_LLM_MODEL = process.env.MUSU_LLM_MODEL;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_MESSAGE_CHARS = 4_000;
const CHAT_BACKEND_UNAVAILABLE_RESPONSE = {
  error: "chat backend unavailable",
  code: "chat_backend_unavailable",
};

function getMaxMessageChars(): number {
  const configured = Number(
    process.env.MUSU_CHAT_MAX_MESSAGE_CHARS ?? DEFAULT_MAX_MESSAGE_CHARS
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_MAX_MESSAGE_CHARS;
  }
  return Math.max(1, Math.floor(configured));
}

function getRequestTimeoutMs(): number {
  const configured = Number(
    process.env.MUSU_CHAT_REQUEST_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }
  return Math.max(1, Math.floor(configured));
}

type PortResponse = {
  text?: string;
  message?: { content?: string };
  choices?: Array<{ text?: string; message?: { content?: string } }>;
  error?: string | { message?: string };
};
type OpenAIModelsResponse = {
  data?: Array<{ id?: string }>;
  models?: Array<{ id?: string; model?: string; name?: string }>;
};
type OpenAIChatResponse = {
  error?: { message?: string };
  text?: string;
  message?: { content?: string };
  choices?: Array<{ text?: string; message?: { content?: string } }>;
};

type ChatAttempt =
  | { ok: true; text: string }
  | { ok: false; error: string };

class RequestDeadlineExceededError extends Error {
  constructor(stage: string) {
    super(`request deadline exceeded during ${stage}`);
    this.name = "RequestDeadlineExceededError";
  }
}

function getRemainingBudgetMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

async function fetchWithRemainingBudget(
  input: string,
  init: RequestInit,
  deadlineAt: number,
  stage: string
): Promise<Response> {
  const timeoutMs = getRemainingBudgetMs(deadlineAt);
  if (timeoutMs <= 0) {
    throw new RequestDeadlineExceededError(stage);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RequestDeadlineExceededError(stage);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}


function extractResponseText(payload: PortResponse | OpenAIChatResponse): string | null {
  const candidates = [
    payload.text,
    payload.message?.content,
    payload.choices?.[0]?.message?.content,
    payload.choices?.[0]?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function extractResponseError(payload: PortResponse): string | null {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }
  return null;
}

async function tryMusuPort(message: string, deadlineAt: number): Promise<ChatAttempt> {
  try {
    const res = await fetchWithRemainingBudget(
      `${MUSU_PORT_URL}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
      deadlineAt,
      "musu-port /chat"
    );

    let data: PortResponse = {};
    try {
      data = (await res.json()) as PortResponse;
    } catch {
      data = {};
    }

    const text = extractResponseText(data);
    if (res.ok && text) {
      return { ok: true, text };
    }

    if (!res.ok && [400, 404, 405, 422].includes(res.status)) {
      const openAiAttempt = await tryOpenAiCompatible(MUSU_PORT_URL, message, deadlineAt);
      if (openAiAttempt.ok) {
        return openAiAttempt;
      }
      return {
        ok: false,
        error: `musu-port error ${res.status}; openai-compatible fallback: ${openAiAttempt.error}`,
      };
    }

    if (res.ok) {
      return { ok: false, error: "musu-port response missing text content" };
    }

    return {
      ok: false,
      error: extractResponseError(data) ?? `musu-port error ${res.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `musu-port request failed: ${message}` };
  }
}

async function discoverModelId(baseUrl: string, deadlineAt: number): Promise<string> {
  if (MUSU_LLM_MODEL) return MUSU_LLM_MODEL;

  const res = await fetchWithRemainingBudget(
    `${baseUrl}/v1/models`,
    { method: "GET" },
    deadlineAt,
    `${baseUrl}/v1/models`
  );
  const data = (await res.json()) as OpenAIModelsResponse;
  const firstModelId =
    data.data?.[0]?.id ??
    data.models?.[0]?.id ??
    data.models?.[0]?.model ??
    data.models?.[0]?.name;
  if (!firstModelId) {
    throw new Error("fallback model discovery returned no model IDs");
  }
  return firstModelId;
}

async function tryOpenAiCompatible(
  baseUrl: string,
  message: string,
  deadlineAt: number,
  systemContext?: string
): Promise<ChatAttempt> {
  try {
    const model = await discoverModelId(baseUrl, deadlineAt);
    const systemPrompt = buildMusuSystemPrompt(systemContext);
    const res = await fetchWithRemainingBudget(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
        }),
      },
      deadlineAt,
      `${baseUrl}/v1/chat/completions`
    );
    const data = (await res.json()) as OpenAIChatResponse;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error?.message ?? `openai-compatible error ${res.status}`,
      };
    }
    const text = extractResponseText(data);
    if (!text) {
      return { ok: false, error: "openai-compatible response missing text" };
    }
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `openai-compatible request failed: ${message}` };
  }
}

async function tryLlmFallback(message: string, deadlineAt: number, systemContext?: string): Promise<ChatAttempt> {
  try {
    const model = await discoverModelId(MUSU_LLM_URL, deadlineAt);
    const systemPrompt = buildMusuSystemPrompt(systemContext);
    const res = await fetchWithRemainingBudget(
      `${MUSU_LLM_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
        }),
      },
      deadlineAt,
      `${MUSU_LLM_URL}/v1/chat/completions`
    );

    const data = (await res.json()) as OpenAIChatResponse;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error?.message ?? `llm fallback error ${res.status}`,
      };
    }

    const text = extractResponseText(data);
    if (!text) {
      return { ok: false, error: "llm fallback response missing text" };
    }
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `llm fallback request failed: ${message}` };
  }
}

async function tryAiCli(
  message: string,
  systemContext?: string
): Promise<ChatAttempt> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    // Prefix wiki context into the message if present
    const fullMessage = buildMusuCliPrompt(message, systemContext);

    let settled = false;
    function settle(result: ChatAttempt) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    if (!MUSU_AI_CLI) {
      resolve({ ok: false, error: "AI CLI not configured (set MUSU_AI_CLI)" });
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      settle({ ok: false, error: "AI CLI timeout" });
    }, MUSU_AI_CLI_TIMEOUT_MS);

    const child = spawn(MUSU_AI_CLI, [...MUSU_AI_CLI_ARGS, fullMessage], {
      env: { ...process.env },
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      const text = stdout.trim();
      if (code === 0 && text) {
        settle({ ok: true, text });
      } else {
        settle({
          ok: false,
          error: `AI CLI exited ${code}: ${(stderr || stdout).slice(0, 300)}`,
        });
      }
    });
    child.on("error", (err) => {
      settle({ ok: false, error: `AI CLI spawn error: ${err.message}` });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    let message: unknown;
    try {
      const body = (await req.json()) as { message?: unknown };
      message = body.message;
    } catch (err) {
      console.warn("[api/chat] invalid JSON request body", { err });
      return NextResponse.json(
        { error: "invalid request body", code: "invalid_request_body" },
        { status: 400 }
      );
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const maxMessageChars = getMaxMessageChars();
    if (message.length > maxMessageChars) {
      return NextResponse.json(
        {
          error: "message too long",
          code: "message_too_long",
          maxChars: maxMessageChars,
          actualChars: message.length,
        },
        { status: 413 }
      );
    }

    const rateLimit = checkChatRateLimit(req);
    if (rateLimit.limited) {
      return NextResponse.json(
        { error: "rate limit exceeded. try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const requestTimeoutMs = getRequestTimeoutMs();
    const deadlineAt = Date.now() + requestTimeoutMs;

    // Query wiki for relevant context before calling LLM
    let wikiContext: string | undefined;
    try {
      const scope = req.headers.get("x-musu-scope") ?? "global";
      const wikiPages = queryWiki(message, scope, 3);
      if (wikiPages.length > 0) {
        wikiContext =
          "## Relevant Knowledge\n" +
          wikiPages
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
      // wiki unavailable — proceed without it
    }

    const portAttempt = await tryMusuPort(message, deadlineAt);
    if (portAttempt.ok) {
      return NextResponse.json({ text: portAttempt.text });
    }

    if (getRemainingBudgetMs(deadlineAt) <= 0) {
      console.error("[api/chat] backend unavailable", {
        requestTimeoutMs,
        remainingBudgetMs: 0,
        portError: portAttempt.error,
        llmFallbackError: "skipped: request deadline exhausted",
      });
      return NextResponse.json(CHAT_BACKEND_UNAVAILABLE_RESPONSE, { status: 502 });
    }

    const llmAttempt = await tryLlmFallback(message, deadlineAt, wikiContext);
    if (llmAttempt.ok) {
      return NextResponse.json({ text: llmAttempt.text });
    }

    // Final fallback: local AI CLI (claude, codex, gemini, etc.)
    const cliAttempt = await tryAiCli(message, wikiContext);
    if (cliAttempt.ok) {
      return NextResponse.json({ text: cliAttempt.text });
    }

    console.error("[api/chat] all backends unavailable", {
      requestTimeoutMs,
      portError: portAttempt.error,
      llmFallbackError: llmAttempt.error,
      cliError: cliAttempt.error,
    });
    return NextResponse.json(
      CHAT_BACKEND_UNAVAILABLE_RESPONSE,
      { status: 502 }
    );
  } catch (err) {
    console.error("[api/chat] unexpected handler failure", { err });
    return NextResponse.json(CHAT_BACKEND_UNAVAILABLE_RESPONSE, { status: 502 });
  }
}
