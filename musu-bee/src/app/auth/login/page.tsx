"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
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

      router.push("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "로그인 요청을 처리하지 못했습니다.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'Apple SD Gothic Neo', sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#111111",
          border: "1px solid #1f1f1f",
          borderRadius: 16,
          padding: "40px 36px",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <Link
          href="/landing"
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#f3f4f6",
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
          로그인
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
          계속하려면 로그인하세요
        </p>

        {!authConfigured && (
          <div
            style={{
              background: "#1f2937",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#cbd5e1",
              marginBottom: 16,
            }}
          >
            인증 설정이 아직 완료되지 않았습니다. 배포 환경 변수가 준비되면 로그인할 수 있습니다.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                color: "#9ca3af",
                marginBottom: 6,
              }}
            >
              이메일
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                background: "#1a1a1a",
                border: "1px solid #2d2d2d",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#f3f4f6",
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
                color: "#9ca3af",
                marginBottom: 6,
              }}
            >
              비밀번호
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                background: "#1a1a1a",
                border: "1px solid #2d2d2d",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#f3f4f6",
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
              background: loading ? "#5b21b6" : "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: 14,
            color: "#6b7280",
          }}
        >
          계정이 없으신가요?{" "}
          <Link
            href="/auth/signup"
            style={{ color: "#7c3aed", textDecoration: "none" }}
          >
            무료로 시작
          </Link>
        </div>
      </div>
    </div>
  );
}
