import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WAITLIST_SET_KEY = "musu:waitlist:emails";

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

async function persistWaitlistEmail(email: string) {
  const hasKvEnv =
    Boolean(process.env.KV_REST_API_URL) &&
    Boolean(process.env.KV_REST_API_TOKEN);

  if (!hasKvEnv) {
    return;
  }

  const { kv } = await import("@vercel/kv");
  await kv.sadd(WAITLIST_SET_KEY, email);
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
    return NextResponse.redirect(new URL(`${from}?waitlist=error`, req.url), 303);
  }

  try {
    await persistWaitlistEmail(email);
  } catch {
    if (wantsJson) {
      return NextResponse.json({ error: "waitlist_persist_failed" }, { status: 503 });
    }
    return NextResponse.redirect(new URL(`${from}?waitlist=error`, req.url), 303);
  }

  if (wantsJson) {
    return NextResponse.json({ ok: true, email });
  }

  return NextResponse.redirect(
    new URL(`${from}?waitlist=ok&email=${encodeURIComponent(email)}`, req.url),
    303
  );
}
