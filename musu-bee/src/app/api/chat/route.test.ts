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
  "MUSU_CHAT_REQUEST_TIMEOUT_MS",
  "MUSU_CHAT_RATE_LIMIT_PER_MINUTE",
  "MUSU_TRUST_PROXY_HEADERS",
  "MUSU_TRUSTED_CLIENT_IP_HEADER",
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
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ role?: string; content?: string }>;
        };
        const systemMessage = payload.messages?.[0];
        assert.equal(systemMessage?.role, "system");
        assert.equal(typeof systemMessage?.content, "string");
        assert.ok((systemMessage?.content ?? "").trim().length > 0);
        assert.match(systemMessage?.content ?? "", /Role Contract:/);
        assert.match(systemMessage?.content ?? "", /Guardrails:/);
        assert.match(systemMessage?.content ?? "", /Output Shape Constraints:/);
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

test("chat route returns sanitized 502 when both backends fail", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "http://port.example.test/chat") {
        return new Response(
          JSON.stringify({
            error: "dial tcp 10.0.0.8:11434: connect: connection refused",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (url === "http://llm.example.test/v1/models") {
        return new Response(JSON.stringify({ data: [{ id: "qwen-test" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "http://llm.example.test/v1/chat/completions") {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Traceback: internal.service:9700 failed; secret-token=abc123",
            },
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const mod = await loadChatModule(`sanitized-502-${Date.now()}`);
    resetChatRateLimitForTests();

    const res = await mod.POST(makeJsonRequest({ message: "ping" }));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.deepEqual(body, {
      error: "chat backend unavailable",
      code: "chat_backend_unavailable",
    });

    const bodyText = JSON.stringify(body);
    assert.equal(bodyText.includes("internal.service"), false);
    assert.equal(bodyText.includes("secret-token"), false);
    assert.equal(bodyText.includes("connection refused"), false);
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

test("chat route enforces single hard timeout budget when musu-port hangs", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";
    process.env.MUSU_CHAT_REQUEST_TIMEOUT_MS = "120";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);

      if (url === "http://port.example.test/chat") {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          throw new Error("expected abort signal for timeout-enforced fetch");
        }
        return await new Promise<Response>((_, reject) => {
          const rejectAsAbort = () => {
            reject(new DOMException("aborted", "AbortError"));
          };
          if (signal.aborted) {
            rejectAsAbort();
            return;
          }
          signal.addEventListener("abort", rejectAsAbort, { once: true });
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const mod = await loadChatModule(`single-budget-hang-${Date.now()}`);
    resetChatRateLimitForTests();

    const startedAt = Date.now();
    const res = await mod.POST(makeJsonRequest({ message: "ping" }));
    const elapsedMs = Date.now() - startedAt;

    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), {
      error: "chat backend unavailable",
      code: "chat_backend_unavailable",
    });
    assert.deepEqual(calls, ["http://port.example.test/chat"]);
    assert.ok(
      elapsedMs < 260,
      `expected single-budget timeout under 260ms, got ${elapsedMs}ms`
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("chat route keeps fallback chain within one hard timeout window", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";
    process.env.MUSU_CHAT_REQUEST_TIMEOUT_MS = "120";

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
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          throw new Error("expected abort signal for timeout-enforced fetch");
        }
        return await new Promise<Response>((_, reject) => {
          const rejectAsAbort = () => {
            reject(new DOMException("aborted", "AbortError"));
          };
          if (signal.aborted) {
            rejectAsAbort();
            return;
          }
          signal.addEventListener("abort", rejectAsAbort, { once: true });
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const mod = await loadChatModule(`single-budget-fallback-${Date.now()}`);
    resetChatRateLimitForTests();

    const startedAt = Date.now();
    const res = await mod.POST(makeJsonRequest({ message: "ping" }));
    const elapsedMs = Date.now() - startedAt;

    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), {
      error: "chat backend unavailable",
      code: "chat_backend_unavailable",
    });
    assert.deepEqual(calls, [
      "http://port.example.test/chat",
      "http://llm.example.test/v1/models",
      "http://llm.example.test/v1/chat/completions",
    ]);
    assert.ok(
      elapsedMs < 260,
      `expected fallback timeout under 260ms, got ${elapsedMs}ms`
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("chat route returns stable 400 for invalid JSON body", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "50";

    globalThis.fetch = (async () => {
      throw new Error("upstream fetch should not be called for invalid JSON");
    }) as typeof fetch;

    const mod = await loadChatModule(`invalid-json-${Date.now()}`);
    resetChatRateLimitForTests();

    const req = new NextRequest("http://example.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });

    const res = await mod.POST(req);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: "invalid request body",
      code: "invalid_request_body",
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("chat route ignores spoofed forwarded headers when trust boundary is disabled", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "1";
    process.env.MUSU_TRUST_PROXY_HEADERS = "false";

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

    const mod = await loadChatModule(`spoofed-forwarded-${Date.now()}`);
    resetChatRateLimitForTests();

    const res1 = await mod.POST(
      makeJsonRequest(
        { message: "one" },
        { "x-forwarded-for": "198.51.100.22" }
      )
    );
    assert.equal(res1.status, 200);
    assert.deepEqual(await res1.json(), { text: "port reply" });

    const res2 = await mod.POST(
      makeJsonRequest(
        { message: "two" },
        { "x-forwarded-for": "203.0.113.10" }
      )
    );
    assert.equal(res2.status, 429);
    assert.deepEqual(await res2.json(), {
      error: "rate limit exceeded. try again shortly.",
    });

    assert.equal(
      calls.filter((url) => url === "http://port.example.test/chat").length,
      1
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("chat route enforces per-client rate limit with trusted header identity", async () => {
  const env = snapshotEnv(CHAT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    process.env.MUSU_PORT_URL = "http://port.example.test";
    process.env.MUSU_LLM_URL = "http://llm.example.test";
    process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "1";
    process.env.MUSU_TRUST_PROXY_HEADERS = "true";
    process.env.MUSU_TRUSTED_CLIENT_IP_HEADER = "x-real-ip";

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

    const firstClientHeaders = {
      "x-real-ip": "198.51.100.22",
      "x-forwarded-for": "203.0.113.44",
    };
    const secondClientHeaders = {
      "x-real-ip": "198.51.100.99",
      "x-forwarded-for": "203.0.113.45",
    };

    const res1 = await mod.POST(
      makeJsonRequest({ message: "one" }, firstClientHeaders)
    );
    assert.equal(res1.status, 200);
    assert.deepEqual(await res1.json(), { text: "port reply" });

    const res2 = await mod.POST(
      makeJsonRequest({ message: "two" }, secondClientHeaders)
    );
    assert.equal(res2.status, 200);
    assert.deepEqual(await res2.json(), { text: "port reply" });

    const res3 = await mod.POST(
      makeJsonRequest({ message: "three" }, firstClientHeaders)
    );
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
