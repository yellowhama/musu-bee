import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://placeholder.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";
const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_CONFIGURED = Boolean(PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY);

let cachedSupabaseClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return SUPABASE_CONFIGURED;
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }

  const supabaseUrl = PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseAnonKey = PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

  cachedSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return cachedSupabaseClient;
}

export function getPublicAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://musu.pro";
}

export function getOAuthRedirectUrl(next = "/app"): string {
  const base = getPublicAppUrl().replace(/\/+$/, "");
  const url = new URL("/auth/callback", base);
  url.searchParams.set("next", next);
  return url.toString();
}
