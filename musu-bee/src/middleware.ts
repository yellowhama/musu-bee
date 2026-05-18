import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Auth is always enabled when Supabase is configured
const authEnabled = true;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Server-side auth gate for operator routes.
 *
 * Validates Supabase JWT from cookies. Expired or invalid tokens
 * get redirected to /login. Cookie presence alone is not enough.
 */
export async function middleware(request: NextRequest) {
  if (!authEnabled || !supabaseConfigured) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // V23.4 T2-C — /dashboard → /fleet 301 redirect, with chat carve-out.
  // Per wiki/434 §2.7 Edit 1 (Critic C-T2C-8 insertion point).
  // OQ3: keep /dashboard/company/{id}/chat/* on /dashboard path (interactive
  //      ops surface; fleet is read-only browse).
  // Auditor A-11: word-boundary `\b` so /dashboards (plural) won't match.
  if (
    pathname.match(/^\/dashboard\b/) &&
    !pathname.match(/^\/dashboard\/company\/[^/]+\/chat/)
  ) {
    return NextResponse.redirect(
      new URL(pathname.replace(/^\/dashboard/, "/fleet"), request.url),
      301,
    );
  }

  // V23.4 T2-C — /dashboard dropped from auth-guard negation list per
  // wiki/434 §2.7 Edit 2 (Auditor OQ-A2). The redirect block above already
  // returns for /dashboard paths, so this clause never sees them. Matcher
  // at the bottom of this file (§2.7 Edit 3) MUST keep /dashboard so the
  // middleware fires and the redirect block runs.
  if (
    !pathname.startsWith("/app") &&
    !pathname.startsWith("/workspace")
  ) {
    return NextResponse.next();
  }

  // Embedded mode (from musu.pro iframe) — skip auth
  // Security: CSP frame-ancestors restricts embedding to musu.pro only
  // Direct URL access with ?embed=1 is allowed but harmless (read-only, no session)
  if (request.nextUrl.searchParams.get("embed") === "1") {
    return NextResponse.next();
  }

  // Extract access token from Supabase cookie
  const cookies = request.cookies;
  const sessionCookie = [...cookies.getAll()].find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!sessionCookie) {
    return redirectToLogin(request, pathname);
  }

  // Parse the cookie value — Supabase stores JSON with access_token
  let accessToken: string | null = null;
  try {
    const parsed = JSON.parse(sessionCookie.value);
    // Supabase cookie formats: direct token string or {access_token, ...} object
    if (typeof parsed === "string") {
      accessToken = parsed;
    } else if (parsed?.access_token) {
      accessToken = parsed.access_token;
    } else if (Array.isArray(parsed) && parsed[0]) {
      // Some Supabase versions store as array chunks
      const joined = parsed.join("");
      const inner = JSON.parse(joined);
      accessToken = inner?.access_token || null;
    }
  } catch {
    // Cookie might be the raw JWT itself
    if (sessionCookie.value.split(".").length === 3) {
      accessToken = sessionCookie.value;
    }
  }

  if (!accessToken) {
    return redirectToLogin(request, pathname);
  }

  // Validate token with Supabase (getUser makes a server call to verify)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    // Token expired or invalid — clear cookie and redirect
    const response = redirectToLogin(request, pathname);
    response.cookies.delete(sessionCookie.name);
    return response;
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*", "/dashboard/:path*", "/workspace/:path*"],
};
