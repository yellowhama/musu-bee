import { NextRequest, NextResponse } from "next/server";
import { checkChatRateLimit } from "@/lib/chatRateLimit";

const MUSU_PORT_URL = (process.env.MUSU_PORT_URL ?? "http://127.0.0.1:11434").replace(
  /\/+$/,
  ""
);
const MUSU_LLM_URL = (process.env.MUSU_LLM_URL ?? "http://127.0.0.1:11434").replace(
  /\/+$/,
  ""
);
const MUSU_LLM_MODEL = process.env.MUSU_LLM_MODEL;
const REQUEST_TIMEOUT_MS = 30_000;

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

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
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

async function tryMusuPort(message: string): Promise<ChatAttempt> {
  try {
    const res = await fetchWithTimeout(
      `${MUSU_PORT_URL}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
      REQUEST_TIMEOUT_MS
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
      const openAiAttempt = await tryOpenAiCompatible(MUSU_PORT_URL, message);
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

async function discoverModelId(baseUrl = MUSU_LLM_URL): Promise<string> {
  if (MUSU_LLM_MODEL) return MUSU_LLM_MODEL;

  const res = await fetchWithTimeout(
    `${baseUrl}/v1/models`,
    { method: "GET" },
    REQUEST_TIMEOUT_MS
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
  message: string
): Promise<ChatAttempt> {
  try {
    const model = await discoverModelId(baseUrl);
    const res = await fetchWithTimeout(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: message }],
        }),
      },
      REQUEST_TIMEOUT_MS
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

async function tryLlmFallback(message: string): Promise<ChatAttempt> {
  try {
    const model = await discoverModelId(MUSU_LLM_URL);
    const res = await fetchWithTimeout(
      `${MUSU_LLM_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: message }],
        }),
      },
      REQUEST_TIMEOUT_MS
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

export async function POST(req: NextRequest) {
  try {
    const { message } = (await req.json()) as { message: string };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
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

    const portAttempt = await tryMusuPort(message);
    if (portAttempt.ok) {
      return NextResponse.json({ text: portAttempt.text });
    }

    const llmAttempt = await tryLlmFallback(message);
    if (llmAttempt.ok) {
      return NextResponse.json({ text: llmAttempt.text });
    }

    return NextResponse.json(
      {
        error: `chat backend unavailable: ${portAttempt.error}; fallback: ${llmAttempt.error}`,
      },
      { status: 502 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
