"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import OAuthButtons from "@/components/OAuthButtons";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/workspace";
  }
  return value;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = safeReturnPath(searchParams?.get("next") ?? searchParams?.get("redirect") ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const authConfigured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push(returnPath);
    } catch (error) {
      setError(error instanceof Error ? error.message : "We could not process the sign-in request.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'Apple SD Gothic Neo', sans-serif",
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
          maxWidth: 400,
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "var(--fg1)",
            textDecoration: "none",
            display: "block",
            marginBottom: 32,
            letterSpacing: "-0.02em",
          }}
        >
          MUSU
        </Link>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: 14, color: "var(--fg3)", marginBottom: 28 }}>
          Sign in to continue
        </p>

        {!authConfigured && (
          <div
            style={{
              background: "#1f2937",
              border: "1px solid var(--fg4)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#cbd5e1",
              marginBottom: 16,
            }}
          >
            Authentication is not configured yet. Sign-in will work once the deployment environment variables are ready.
          </div>
        )}

        <OAuthButtons next={returnPath} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "0 0 18px",
            color: "var(--fg4)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <div style={{ height: 1, flex: 1, background: "var(--border-subtle)" }} />
          <span>or use email</span>
          <div style={{ height: 1, flex: 1, background: "var(--border-subtle)" }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                color: "var(--fg2)",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                background: "var(--bg-card)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--fg1)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                color: "var(--fg2)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                background: "var(--bg-card)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--fg1)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#2d1515",
                border: "1px solid #7f1d1d",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: "#fca5a5",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "var(--accent-hover)" : "var(--accent)",
              color: "var(--fg-on-accent, #432c1c)",
              border: "none",
              borderRadius: 8,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: 14,
            color: "var(--fg3)",
          }}
        >
          Need an account?{" "}
          <Link
            href="/auth/signup"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Start free
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
