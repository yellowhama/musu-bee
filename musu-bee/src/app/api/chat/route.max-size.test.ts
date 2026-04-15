import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import { resetChatRateLimitForTests } from "@/lib/chatRateLimit";

type ChatPostHandler = (req: NextRequest) => Promise<Response>;
type ChatModule = { POST: ChatPostHandler };

const CHAT_ENV_KEYS = [
  "MUSU_PORT_URL",
  "MUSU_LLM_URL",
  "MUSU_LLM_MODEL",
  "MUSU_CHAT_RATE_LIMIT_PER_MINUTE",
  "MUSU_CHAT_MAX_MESSAGE_CHARS",
];

function snapshotEnv(keys: string[]) {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeJsonRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://example.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadChatModule(cacheBust: string): Promise<ChatModule> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as ChatModule;
}

test("chat route accepts message exactly at configured max length", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";
    process.env.MUSU_CHAT_MAX_MESSAGE_CHARS = "4";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);

      if (url === "http://port.example.test/chat") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { message?: string };
        assert.equal(body.message, "ping");
        return new Response(JSON.stringify({ text: "port reply" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const mod = await loadChatModule(`max-char-pass-${Date.now()}`);
    resetChatRateLimitForTests();

    const res = await mod.POST(makeJsonRequest({ message: "ping" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: "port reply" });
    assert.deepEqual(calls, ["http://port.example.test/chat"]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("chat route rejects oversized message with deterministic contract", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";
    process.env.MUSU_CHAT_MAX_MESSAGE_CHARS = "4";

    globalThis.fetch = (async () => {
      throw new Error("upstream fetch should not be called for oversized message");
    }) as typeof fetch;

    const mod = await loadChatModule(`max-char-reject-${Date.now()}`);
    resetChatRateLimitForTests();

    const res = await mod.POST(makeJsonRequest({ message: "hello" }));
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), {
      error: "message too long",
      code: "message_too_long",
      maxChars: 4,
      actualChars: 5,
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});
