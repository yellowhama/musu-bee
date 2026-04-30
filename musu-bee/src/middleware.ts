import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Auth is always enabled when Supabase is configured
const authEnabled = true;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Server-side auth gate for /app routes.
 *
 * Validates Supabase JWT from cookies. Expired or invalid tokens
 * get redirected to /auth/login. Cookie presence alone is not enough.
 */
export async function middleware(request: NextRequest) {
  if (!authEnabled || !supabaseConfigured) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  // Embedded mode (from musu.pro iframe) — skip auth
  // musu.pro already authenticates the user before rendering the iframe
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
  loginUrl.pathname = "/auth/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*"],
};
