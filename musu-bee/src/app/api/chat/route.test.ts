import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import { resetChatRateLimitForTests } from "@/lib/chatRateLimit";

type ChatPostHandler = (req: NextRequest) => Promise<Response>;
type ChatModule = {
  POST: ChatPostHandler;
};

const CHAT_ENV_KEYS = [
  "MUSU_PORT_URL",
  "MUSU_LLM_URL",
  "MUSU_LLM_MODEL",
  "MUSU_CHAT_RATE_LIMIT_PER_MINUTE",
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

function makeJsonRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://example.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function loadChatModule(cacheBust: string): Promise<ChatModule> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  return (await import(moduleUrl)) as ChatModule;
}

test("chat route falls back to LLM when musu-port is unavailable", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);

      if (url === "http://port.example.test/chat") {
        return new Response(JSON.stringify({ error: "backend down" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "http://llm.example.test/v1/models") {
        return new Response(JSON.stringify({ data: [{ id: "qwen-test" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "http://llm.example.test/v1/chat/completions") {
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "fallback reply" } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const mod = await loadChatModule(`fallback-${Date.now()}`);
    resetChatRateLimitForTests();

    const res = await mod.POST(
      makeJsonRequest(
        { message: "ping" },
        { "x-forwarded-for": "203.0.113.7" }
      )
    );

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: "fallback reply" });
    assert.deepEqual(calls, [
      "http://port.example.test/chat",
      "http://llm.example.test/v1/models",
      "http://llm.example.test/v1/chat/completions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("chat route enforces per-client rate limit", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "2";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "http://port.example.test/chat") {
        return new Response(JSON.stringify({ text: "port reply" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const mod = await loadChatModule(`rate-limit-${Date.now()}`);
    resetChatRateLimitForTests();

    const headers = { "x-forwarded-for": "198.51.100.22" };

    const res1 = await mod.POST(makeJsonRequest({ message: "one" }, headers));
    assert.equal(res1.status, 200);
    assert.deepEqual(await res1.json(), { text: "port reply" });

    const res2 = await mod.POST(makeJsonRequest({ message: "two" }, headers));
    assert.equal(res2.status, 200);
    assert.deepEqual(await res2.json(), { text: "port reply" });

    const res3 = await mod.POST(makeJsonRequest({ message: "three" }, headers));
    assert.equal(res3.status, 429);
    assert.deepEqual(await res3.json(), {
      error: "rate limit exceeded. try again shortly.",
    });
    assert.ok(res3.headers.get("Retry-After"));

    assert.equal(
      calls.filter((url) => url === "http://port.example.test/chat").length,
      2
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});
