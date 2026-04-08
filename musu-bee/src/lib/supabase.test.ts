import assert from "node:assert/strict";
import test from "node:test";

test("supabase client module stays import-safe without env vars", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const moduleUrl = new URL(`./supabase.ts?case=${Date.now()}`, import.meta.url).href;
    const supabaseModule = await import(moduleUrl);

    assert.equal(supabaseModule.isSupabaseConfigured(), false);
    assert.ok(supabaseModule.getSupabaseClient());
  } finally {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  }
});
