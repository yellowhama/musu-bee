import assert from "node:assert/strict";
import test from "node:test";

type GetHandler = () => Promise<Response>;

const TRACKED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_ENV",
  // Server-only secrets that must never appear in the response. Tracked
  // here so the test can deliberately set them and assert they don't leak.
  "SUPABASE_SERVICE_ROLE_KEY",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
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

function clearEnv(keys: string[]) {
  for (const key of keys) {
    delete process.env[key];
  }
}

async function loadGetHandler(cacheBust: string): Promise<GetHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { GET: GetHandler };
  return mod.GET;
}

function expectedPublicMetadata(appUrl = "https://musu.pro") {
  return {
    schema: "musu.public_config.v1",
    releaseVersion: "1.15.0-rc.1",
    publicReleaseMetadata: "MUSU public release metadata: 1.15.0-rc.1",
    supportEmail: "musu@musu.pro",
    privacyUrl: `${appUrl}/privacy`,
    supportUrl: `${appUrl}/support`,
  };
}

test("public-config returns every allowed key when all are set", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-abc";
    process.env.NEXT_PUBLIC_APP_URL = "https://musu.pro";
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "live_pdl_123";
    process.env.NEXT_PUBLIC_PADDLE_ENV = "production";

    const GET = await loadGetHandler("happy");
    const res = await GET();
    const body = (await res.json()) as Record<string, string>;

    assert.equal(res.status, 200);
    assert.deepEqual(body, {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-abc",
      appUrl: "https://musu.pro",
      paddleClientToken: "live_pdl_123",
      paddleEnv: "production",
      ...expectedPublicMetadata(),
    });
  } finally {
    restoreEnv(env);
  }
});

test("public-config never includes server-only secrets even when they are set", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-abc";
    // The values that must absolutely not leak — fake but obviously sensitive.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk-live-SUPER-SECRET";
    process.env.PADDLE_API_KEY = "pdl_apikey_DO_NOT_LEAK";
    process.env.PADDLE_WEBHOOK_SECRET = "whsec_LEAKED_BAD";
    process.env.ANTHROPIC_API_KEY = "sk-ant-LEAKED_VERY_BAD";

    const GET = await loadGetHandler("no-leak");
    const res = await GET();
    const body = (await res.json()) as Record<string, string>;
    const serialized = JSON.stringify(body);

    // Direct shape check — only allowed public config and public metadata keys appear.
    const expectedPublicKeys = new Set([
      "schema",
      "supabaseUrl",
      "supabaseAnonKey",
      "releaseVersion",
      "publicReleaseMetadata",
      "supportEmail",
      "privacyUrl",
      "supportUrl",
    ]);
    assert.deepEqual(new Set(Object.keys(body)), expectedPublicKeys);

    // Belt-and-suspenders — even if a later refactor adds the wrong key
    // by name, the actual secret values must not appear anywhere in the
    // serialized response.
    for (const secret of [
      "SUPER-SECRET",
      "DO_NOT_LEAK",
      "LEAKED_BAD",
      "LEAKED_VERY_BAD",
    ]) {
      assert.ok(
        !serialized.includes(secret),
        `secret value "${secret}" leaked into response: ${serialized}`,
      );
    }
  } finally {
    restoreEnv(env);
  }
});

test("public-config omits keys whose env value is unset", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    // SUPABASE_ANON_KEY intentionally unset.
    process.env.NEXT_PUBLIC_APP_URL = "https://musu.pro";

    const GET = await loadGetHandler("missing-anon");
    const res = await GET();
    const body = (await res.json()) as Record<string, string>;

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(body).sort(), [
      "appUrl",
      "privacyUrl",
      "publicReleaseMetadata",
      "releaseVersion",
      "schema",
      "supabaseUrl",
      "supportEmail",
      "supportUrl",
    ]);
    assert.equal(body.supabaseAnonKey, undefined);
    assert.deepEqual(
      {
        schema: body.schema,
        releaseVersion: body.releaseVersion,
        publicReleaseMetadata: body.publicReleaseMetadata,
        supportEmail: body.supportEmail,
        privacyUrl: body.privacyUrl,
        supportUrl: body.supportUrl,
      },
      expectedPublicMetadata(),
    );
  } finally {
    restoreEnv(env);
  }
});

test("public-config still returns release/support metadata when no public env is set", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);

    const GET = await loadGetHandler("all-empty");
    const res = await GET();
    const body = (await res.json()) as Record<string, string>;

    assert.equal(res.status, 200);
    assert.deepEqual(body, expectedPublicMetadata());
  } finally {
    restoreEnv(env);
  }
});

test("public-config sets a 5-minute public Cache-Control header", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    const GET = await loadGetHandler("cache-header");
    const res = await GET();

    assert.equal(
      res.headers.get("Cache-Control"),
      "public, max-age=300",
    );
  } finally {
    restoreEnv(env);
  }
});

test("public-config trims whitespace from env values", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "  https://example.supabase.co  ";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "   ";  // whitespace-only → omitted

    const GET = await loadGetHandler("trim");
    const res = await GET();
    const body = (await res.json()) as Record<string, string>;

    assert.equal(body.supabaseUrl, "https://example.supabase.co");
    assert.equal(body.privacyUrl, "https://musu.pro/privacy");
    // Whitespace-only treated as empty.
    assert.equal(body.supabaseAnonKey, undefined);
  } finally {
    restoreEnv(env);
  }
});

test("public-config falls back when NEXT_PUBLIC_APP_URL is invalid", async () => {
  const env = snapshotEnv(TRACKED_ENV_KEYS);
  try {
    clearEnv(TRACKED_ENV_KEYS);
    process.env.NEXT_PUBLIC_APP_URL = "not a url";

    const GET = await loadGetHandler("invalid-app-url");
    const res = await GET();
    const body = (await res.json()) as Record<string, string>;

    assert.equal(res.status, 200);
    assert.equal(body.appUrl, "https://musu.pro");
    assert.equal(body.privacyUrl, "https://musu.pro/privacy");
    assert.equal(body.supportUrl, "https://musu.pro/support");
  } finally {
    restoreEnv(env);
  }
});
