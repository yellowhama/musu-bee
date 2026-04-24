"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authConfigured = isSupabaseConfigured();
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const next = searchParams?.get("next");
    return next && next.startsWith("/") ? next : "/app";
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!authConfigured) {
        setError("Authentication is not configured yet.");
        return;
      }

      const urlError =
        searchParams?.get("error_description") ||
        searchParams?.get("error") ||
        searchParams?.get("message");
      if (urlError) {
        setError(urlError);
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const code = searchParams?.get("code");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!cancelled && data.session) {
          router.replace(nextPath);
          return;
        }

        if (!cancelled) {
          setError("Sign-in completed, but no session is available yet. Please try again.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not complete sign-in.");
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [authConfigured, nextPath, router, searchParams]);

  return <AuthCallbackView error={error} />;
}

function AuthCallbackView({ error }: { error: string | null }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 16,
          padding: "40px 36px",
          width: "100%",
          maxWidth: 440,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 14 }}>🐝</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
          Completing sign-in
        </h1>
        {!error ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg2)", lineHeight: 1.7 }}>
            Finishing your authentication flow and opening your workspace.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#fca5a5", lineHeight: 1.7 }}>
              {error}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/auth/login"
                style={{
                  color: "var(--fg1)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Back to sign in
              </Link>
              <Link
                href="/"
                style={{
                  color: "var(--fg2)",
                  textDecoration: "none",
                  fontSize: 14,
                  padding: "10px 14px",
                }}
              >
                Go home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackView error={null} />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
