import { NextResponse } from "next/server";

/**
 * v18.B Phase 1 — Public config endpoint used by install.ps1 to bootstrap
 * a fresh musu-bee install with the same Supabase auth setup musu.pro uses.
 *
 * Every value emitted here is NEXT_PUBLIC_* by design — these are the same
 * strings that already get inlined into the browser bundle whenever musu.pro
 * serves a page. Exposing them as JSON adds zero new risk, just removes the
 * "go to Supabase dashboard, copy a key, paste it into .env.local" step that
 * used to gate fresh installs.
 *
 * Security model: a strict ALLOWED_KEYS allowlist gates everything. Adding
 * a new entry must be a deliberate code change. Server-only secrets
 * (SUPABASE_SERVICE_ROLE_KEY, PADDLE_API_KEY, ANTHROPIC_API_KEY,
 * PADDLE_WEBHOOK_SECRET) are not in this map and physically cannot leak
 * even if their name happens to start with NEXT_PUBLIC_ later by mistake.
 */
const ALLOWED_KEYS = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  appUrl: "NEXT_PUBLIC_APP_URL",
  paddleClientToken: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  paddleEnv: "NEXT_PUBLIC_PADDLE_ENV",
} as const;

export async function GET() {
  const body: Record<string, string> = {};
  for (const [outKey, envName] of Object.entries(ALLOWED_KEYS)) {
    const val = process.env[envName]?.trim();
    if (val) {
      body[outKey] = val;
    }
  }
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
