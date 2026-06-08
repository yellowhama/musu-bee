"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import OAuthButtons from "@/components/OAuthButtons";
import { MusuLogo } from "@/components/brand/MusuLogo";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const authConfigured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setDone(true);
      // After email confirmation, user will be redirected to the app
      setTimeout(() => router.push("/workspace"), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "We could not process the sign-up request.");
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
            fontSize: 24,
            fontWeight: 800,
            color: "var(--fg1)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
            letterSpacing: "-0.02em",
          }}
        >
          <MusuLogo size="header" />
          MUSU
        </Link>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              Check your inbox
            </div>
            <div style={{ color: "var(--fg2)", fontSize: 14 }}>
              We sent a confirmation link to {email}.
              <br />
              Confirm your email, then sign in.
            </div>
          </div>
        ) : (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                marginBottom: 8,
                letterSpacing: "-0.02em",
              }}
            >
              Create account
            </h1>
            <p style={{ fontSize: 14, color: "var(--fg3)", marginBottom: 28 }}>
              Start free
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
                Authentication is not configured yet. Sign-up will work once the deployment environment variables are ready.
              </div>
            )}

            <OAuthButtons next="/workspace" />

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
                  Password (minimum 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
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
                {loading ? "Creating account..." : "Create account"}
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
              Already have an account?{" "}
              <Link
                href="/auth/login"
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
