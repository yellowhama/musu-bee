import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MUSU — AI가 팀으로 일하는 업무 메신저",
  description:
    "여러 대 컴퓨터의 AI가 팀으로 일한다. 채팅창 열고 말만 하면 된다.",
};

const features = [
  {
    icon: "💬",
    title: "말만 하면 된다",
    desc: "설정 파일 없음. 터미널 없음. 채팅창에 일 시키면 AI가 알아서 한다.",
  },
  {
    icon: "🖥",
    title: "여러 기기가 하나의 팀",
    desc: "집 PC, 노트북, 서버 — 여러 대가 하나의 AI 팀으로 연결된다.",
  },
  {
    icon: "⚡",
    title: "파트장 AI가 조율",
    desc: "일을 시키면 파트장이 작업을 쪼개고 기기에 분배하고 결과를 모아 보고한다.",
  },
];

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e7eb",
        fontFamily: "'Inter', 'Apple SD Gothic Neo', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid #1f1f1f",
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>
          MUSU
        </span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/auth/login"
            style={{
              color: "#9ca3af",
              textDecoration: "none",
              fontSize: 14,
              padding: "6px 14px",
            }}
          >
            로그인
          </Link>
          <Link
            href="/auth/signup"
            style={{
              background: "#7c3aed",
              color: "#fff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              padding: "8px 18px",
              borderRadius: 8,
            }}
          >
            무료로 시작
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "80px 24px 60px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#7c3aed",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          AI 업무 메신저
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 64px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: 24,
            maxWidth: 720,
          }}
        >
          여러 대 컴퓨터의 AI가<br />팀으로 일한다
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "#9ca3af",
            lineHeight: 1.6,
            maxWidth: 480,
            marginBottom: 40,
          }}
        >
          채팅창 열고 말만 하면 된다.<br />
          AI들이 알아서 일을 나눠서 처리하고 결과를 가져온다.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href="/auth/signup"
            style={{
              background: "#7c3aed",
              color: "#fff",
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 700,
              padding: "14px 32px",
              borderRadius: 10,
              display: "inline-block",
            }}
          >
            Try MUSU — 무료
          </Link>
          <Link
            href="/"
            style={{
              background: "#1a1a1a",
              color: "#e5e7eb",
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 600,
              padding: "14px 32px",
              borderRadius: 10,
              border: "1px solid #2d2d2d",
              display: "inline-block",
            }}
          >
            데모 보기
          </Link>
        </div>

        {/* Features */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 80,
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: 900,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: "#111111",
                border: "1px solid #1f1f1f",
                borderRadius: 12,
                padding: "28px 24px",
                flex: "1 1 240px",
                maxWidth: 280,
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "#f3f4f6",
                }}
              >
                {f.title}
              </div>
              <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Pricing teaser */}
        <div
          style={{
            marginTop: 80,
            padding: "32px 40px",
            background: "#111111",
            border: "1px solid #1f1f1f",
            borderRadius: 16,
            maxWidth: 480,
            width: "100%",
          }}
        >
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            가격
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "#f3f4f6",
              marginBottom: 4,
            }}
          >
            무료로 시작
          </div>
          <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20 }}>
            기기 1대 · AI 채팅 · 하루 100개 메시지
          </div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>
            Pro: ₩29,000/월 — 기기 3대 · 무제한 메시지
          </div>
          <Link
            href="/auth/signup"
            style={{
              display: "block",
              background: "#7c3aed",
              color: "#fff",
              textDecoration: "none",
              fontSize: 15,
              fontWeight: 700,
              padding: "12px 24px",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            무료로 시작하기
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "20px 32px",
          borderTop: "1px solid #1f1f1f",
          textAlign: "center",
          fontSize: 12,
          color: "#4b5563",
        }}
      >
        © 2026 MUSU · musu.pro
      </footer>
    </div>
  );
}
