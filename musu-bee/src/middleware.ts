import { type NextRequest, NextResponse } from "next/server";

const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Server-side auth gate for /app routes.
 *
 * When AUTH_ENABLED=true and Supabase is configured, checks for a Supabase
 * session cookie. Unauthenticated requests are redirected to /auth/login.
 *
 * Note: This only checks cookie presence. Full JWT verification requires
 * @supabase/ssr — add that package to upgrade to cryptographic validation.
 */
export function middleware(request: NextRequest) {
  if (!authEnabled || !supabaseConfigured) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  // Supabase stores session in cookies named sb-<project-ref>-auth-token or sb-access-token
  const cookies = request.cookies;
  const hasSession = [...cookies.getAll()].some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
