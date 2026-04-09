import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/waitlist/route";

const KV_OVERRIDE_KEY = "__MUSU_WAITLIST_KV_CLIENT__";

function makeFormRequest(url: string, email: string, headers?: Record<string, string>) {
  const formData = new FormData();
  formData.set("email", email);
  return new NextRequest(url, { method: "POST", body: formData, headers });
}

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

test("waitlist invalid email returns json error (accept: application/json)", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing", "not-an-email", {
      accept: "application/json",
    });
    const res = await POST(req);

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_email" });
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist invalid email redirects with waitlist=invalid_email (html flow)", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing", "not-an-email");
    const res = await POST(req);

    assert.equal(res.status, 303);
    const location = res.headers.get("location");
    assert.ok(location);

    const redirectUrl = new URL(location, "http://example.test");
    assert.equal(redirectUrl.pathname, "/landing");
    assert.equal(redirectUrl.searchParams.get("waitlist"), "invalid_email");
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist redirect normalization blocks open redirects", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    const req = makeFormRequest(
      "http://example.test/api/waitlist?from=https://evil.example/phish",
      "not-an-email",
    );
    const res = await POST(req);

    assert.equal(res.status, 303);
    const location = res.headers.get("location");
    assert.ok(location);

    const redirectUrl = new URL(location, "http://example.test");
    assert.equal(redirectUrl.origin, "http://example.test");
    assert.equal(redirectUrl.pathname, "/landing");
    assert.equal(redirectUrl.searchParams.get("waitlist"), "invalid_email");
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist persistence fails loudly in production when KV is not configured", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    (process.env as any).NODE_ENV = "production";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing", "qa@example.com", {
      accept: "application/json",
    });
    const res = await POST(req);

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "waitlist_kv_not_configured" });
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist persistence failure surfaces as 503 (KV configured but write fails)", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);

  try {
    (process.env as any).NODE_ENV = "production";
    process.env.KV_REST_API_URL = "https://kv.example.invalid";
    process.env.KV_REST_API_TOKEN = "kv-token";

    (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY] = {
      sadd: async () => {
        throw new Error("simulated kv failure");
      },
    };

    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing", "qa@example.com", {
      accept: "application/json",
    });
    const res = await POST(req);

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "waitlist_persist_failed" });
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist preserves existing from query params", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing?x=1", "not-an-email");
    const res = await POST(req);

    assert.equal(res.status, 303);
    const location = res.headers.get("location");
    assert.ok(location);

    const redirectUrl = new URL(location, "http://example.test");
    assert.equal(redirectUrl.pathname, "/landing");
    assert.equal(redirectUrl.searchParams.get("x"), "1");
    assert.equal(redirectUrl.searchParams.get("waitlist"), "invalid_email");
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist succeeds in dev mode without KV configured (local fallback)", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    (process.env as any).NODE_ENV = "development";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing", "qa@example.com", {
      accept: "application/json",
    });
    const res = await POST(req);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, email: "qa@example.com" });
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});

test("waitlist html success redirects without echoing the submitted email in the url", async () => {
  const env = snapshotEnv(["NODE_ENV", "KV_REST_API_URL", "KV_REST_API_TOKEN"]);
  delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];

  try {
    (process.env as any).NODE_ENV = "development";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    const req = makeFormRequest("http://example.test/api/waitlist?from=/landing", "qa@example.com");
    const res = await POST(req);

    assert.equal(res.status, 303);
    const location = res.headers.get("location");
    assert.ok(location);

    const redirectUrl = new URL(location, "http://example.test");
    assert.equal(redirectUrl.pathname, "/landing");
    assert.equal(redirectUrl.searchParams.get("waitlist"), "ok");
    assert.equal(redirectUrl.searchParams.get("email"), null);
  } finally {
    restoreEnv(env);
    delete (globalThis as unknown as Record<string, unknown>)[KV_OVERRIDE_KEY];
  }
});
