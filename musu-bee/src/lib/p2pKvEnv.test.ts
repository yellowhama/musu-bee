import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
  p2pKvEnvStatus,
  p2pKvRestApiToken,
  p2pKvRestApiUrl,
} from "./p2pKvEnv";

const ENV_KEYS = [
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
] as const;

async function withKvEnv(fn: () => Promise<void> | void): Promise<void> {
  const previous = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("detects Vercel KV credentials", async () => {
  await withKvEnv(() => {
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";

    assert.equal(hasP2pKvCredentials(), true);
    assert.equal(p2pKvRestApiUrl(), "https://kv.example");
    assert.equal(p2pKvRestApiToken(), "kv-token");
    assert.deepEqual(p2pKvEnvStatus(), {
      has_url: true,
      has_token: true,
      url_source: "vercel_kv",
      token_source: "vercel_kv",
    });
  });
});

test("uses Upstash REST credentials as KV aliases", async () => {
  await withKvEnv(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

    assert.equal(hasP2pKvCredentials(), true);
    assert.equal(p2pKvRestApiUrl(), "https://upstash.example");
    assert.equal(p2pKvRestApiToken(), "upstash-token");
    assert.deepEqual(p2pKvEnvStatus(), {
      has_url: true,
      has_token: true,
      url_source: "upstash_redis",
      token_source: "upstash_redis",
    });

    ensureP2pKvRestEnvAliases();

    assert.equal(process.env.KV_REST_API_URL, "https://upstash.example");
    assert.equal(process.env.KV_REST_API_TOKEN, "upstash-token");
  });
});

test("does not override explicit Vercel KV credentials", async () => {
  await withKvEnv(() => {
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

    ensureP2pKvRestEnvAliases();

    assert.equal(process.env.KV_REST_API_URL, "https://kv.example");
    assert.equal(process.env.KV_REST_API_TOKEN, "kv-token");
  });
});

test("reports missing partial credentials as incomplete", async () => {
  await withKvEnv(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";

    assert.equal(hasP2pKvCredentials(), false);
    assert.deepEqual(p2pKvEnvStatus(), {
      has_url: true,
      has_token: false,
      url_source: "upstash_redis",
      token_source: "missing",
    });
  });
});
