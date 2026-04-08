import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WAITLIST_SET_KEY = "musu:waitlist:emails";
const DEV_WAITLIST_EMAILS = new Set<string>();

type KvClient = {
  sadd(key: string, value: string): Promise<unknown>;
};

let kvClientOverride: KvClient | null = null;

export function __setKvClientForTest(kv: KvClient | null) {
  kvClientOverride = kv;
}

function parseEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function normalizeFrom(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/landing";
  }
  return value;
}

function buildRedirectUrl(from: string, reqUrl: string, params: Record<string, string>) {
  const url = new URL(from, reqUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL) && Boolean(process.env.KV_REST_API_TOKEN);
}

async function persistWaitlistEmail(email: string) {
  if (!isKvConfigured()) {
    // In Vercel/production, this must fail loudly so we don't show false-positive success.
    if (process.env.NODE_ENV === "production") {
      throw new Error("waitlist_kv_not_configured");
    }

    // In local dev, keep the UX functional without requiring KV credentials.
    DEV_WAITLIST_EMAILS.add(email);
    return;
  }

  const kvClient = kvClientOverride ?? (await import("@vercel/kv")).kv;
  await kvClient.sadd(WAITLIST_SET_KEY, email);
}

export async function POST(req: NextRequest) {
  const from = normalizeFrom(req.nextUrl.searchParams.get("from"));
  const wantsJson = req.headers.get("accept")?.includes("application/json") ?? false;

  const formData = await req.formData();
  const email = parseEmail(formData.get("email"));

  if (!EMAIL_RE.test(email)) {
    if (wantsJson) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    return NextResponse.redirect(
      buildRedirectUrl(from, req.url, { waitlist: "invalid_email" }),
      303,
    );
  }

  try {
    await persistWaitlistEmail(email);
  } catch (error) {
    const code =
      error instanceof Error && error.message === "waitlist_kv_not_configured"
        ? "waitlist_kv_not_configured"
        : "waitlist_persist_failed";
    if (wantsJson) {
      return NextResponse.json({ error: code }, { status: 503 });
    }
    return NextResponse.redirect(buildRedirectUrl(from, req.url, { waitlist: "error" }), 303);
  }

  if (wantsJson) {
    return NextResponse.json({ ok: true, email });
  }

  return NextResponse.redirect(
    buildRedirectUrl(from, req.url, { waitlist: "ok", email }),
    303
  );
}
