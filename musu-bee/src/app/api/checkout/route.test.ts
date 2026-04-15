import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

type CheckoutPostHandler = (req: NextRequest) => Promise<Response>;

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
  return new NextRequest("http://example.test/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadPostHandler(cacheBust: string): Promise<CheckoutPostHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { POST: CheckoutPostHandler };
  return mod.POST;
}

const CHECKOUT_ENV_KEYS = [
  "PADDLE_API_KEY",
  "PADDLE_API_BASE_URL",
  "PADDLE_PRICE_ID_PRO",
  "PADDLE_PRICE_ID_TEAM",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_PADDLE_ENV",
];

test("checkout route rejects invalid tier", async () => {
  const env = snapshotEnv(CHECKOUT_ENV_KEYS);

  try {
    process.env.PADDLE_API_KEY = "pdl_test_key";
    process.env.PADDLE_PRICE_ID_PRO = "pri_pro_test";
    process.env.PADDLE_PRICE_ID_TEAM = "pri_team_test";
    const POST = await loadPostHandler(`invalid-tier-${Date.now()}`);

    const res = await POST(makeJsonRequest({ tier: "enterprise" }));

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid tier" });
  } finally {
    restoreEnv(env);
  }
});

test("checkout route fails loudly when Paddle API key is missing", async () => {
  const env = snapshotEnv(CHECKOUT_ENV_KEYS);

  try {
    delete process.env.PADDLE_API_KEY;
    process.env.PADDLE_PRICE_ID_PRO = "pri_pro_test";
    process.env.PADDLE_PRICE_ID_TEAM = "pri_team_test";
    const POST = await loadPostHandler(`missing-key-${Date.now()}`);

    const res = await POST(makeJsonRequest({ tier: "pro" }));

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "PADDLE_API_KEY env var not set" });
  } finally {
    restoreEnv(env);
  }
});

test("checkout route fails loudly when requested tier price id is missing", async () => {
  const env = snapshotEnv(CHECKOUT_ENV_KEYS);

  try {
    process.env.PADDLE_API_KEY = "pdl_test_key";
    delete process.env.PADDLE_PRICE_ID_PRO;
    process.env.PADDLE_PRICE_ID_TEAM = "pri_team_test";
    const POST = await loadPostHandler(`missing-price-${Date.now()}`);

    const res = await POST(makeJsonRequest({ tier: "pro" }));

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      error: "PADDLE_PRICE_ID_PRO env var not set",
    });
  } finally {
    restoreEnv(env);
  }
});

test("checkout route returns Paddle redirect payload on success", async () => {
  const env = snapshotEnv(CHECKOUT_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: unknown }> = [];

  try {
    process.env.PADDLE_API_KEY = "pdl_test_key";
    process.env.PADDLE_API_BASE_URL = "https://sandbox-api.mock-paddle.test";
    process.env.PADDLE_PRICE_ID_PRO = "pri_pro_test";
    process.env.PADDLE_PRICE_ID_TEAM = "pri_team_test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({
        url: String(input),
        method: String(init?.method ?? "GET"),
        body,
      });

      return new Response(
        JSON.stringify({
          data: {
            id: "txn_mock_1",
            checkout: { url: "https://checkout.paddle.test/txn_mock_1" },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    const POST = await loadPostHandler(`success-${Date.now()}`);
    const res = await POST(makeJsonRequest({ tier: "pro" }));

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      provider: "paddle",
      transactionId: "txn_mock_1",
      url: "https://checkout.paddle.test/txn_mock_1",
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://sandbox-api.mock-paddle.test/transactions"
    );
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, {
      items: [{ price_id: "pri_pro_test", quantity: 1 }],
      custom_data: { tier: "pro" },
      checkout: {
        success_url: "http://localhost:3001/pricing?success=1&tier=pro",
        cancel_url: "http://localhost:3001/pricing?cancelled=1",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});
