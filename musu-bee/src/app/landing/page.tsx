import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MUSU Waitlist — 여러 대 내 컴퓨터의 AI들이 팀으로 일한다",
  description:
    "Your AIs, across all your machines, working as one team. You just chat.",
};

const features = [
  {
    icon: "🖥",
    title: "Multi-machine",
    desc: "집 PC, 노트북, 서버의 AI를 하나의 팀으로 묶어 작업을 분배한다.",
  },
  {
    icon: "💬",
    title: "One chat",
    desc: "채팅창에서 지시하면 끝. 복잡한 터미널 조작 없이 결과를 받는다.",
  },
  {
    icon: "🤝",
    title: "AI team",
    desc: "파트장 AI가 작업을 쪼개고 각 머신 AI를 조율해 하나로 보고한다.",
  },
];

type LandingPageProps = {
  searchParams: Promise<{
    waitlist?: string;
    email?: string;
  }>;
};

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const waitlistStatus = params.waitlist;
  const submittedEmail = typeof params.email === "string" ? params.email : "";

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
        <span style={{ fontSize: 12, color: "#9ca3af", letterSpacing: "0.08em" }}>
          EARLY ACCESS WAITLIST
        </span>
      </nav>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "72px 24px 56px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22c55e",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          WAITLIST OPEN
        </div>

        <h1
          style={{
            fontSize: "clamp(30px, 6vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            marginBottom: 14,
            maxWidth: 860,
          }}
        >
          여러 대 내 컴퓨터의 AI들이 팀으로 일한다 —<br />당신은 채팅창에서 말만 하면 된다.
        </h1>

        <p
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#d1d5db",
            lineHeight: 1.45,
            maxWidth: 760,
            marginBottom: 14,
          }}
        >
          Your AIs, across all your machines, working as one team. You just chat.
        </p>

        <p
          style={{
            fontSize: 15,
            color: "#9ca3af",
            lineHeight: 1.7,
            maxWidth: 720,
            marginBottom: 28,
          }}
        >
          For developers and creators running 2-3 machines (Mac/Windows/Linux) who want
          AI orchestration without building it themselves.
        </p>

        <form
          action="/api/waitlist?from=/landing"
          method="post"
          style={{
            width: "100%",
            maxWidth: 560,
            background: "#111111",
            border: "1px solid #1f1f1f",
            borderRadius: 14,
            padding: 18,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
          }}
        >
          <label htmlFor="waitlist-email" style={{ display: "none" }}>
            Waitlist email
          </label>
          <input
            id="waitlist-email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            style={{
              width: "100%",
              background: "#0f0f0f",
              border: "1px solid #2b2b2b",
              borderRadius: 10,
              color: "#f9fafb",
              fontSize: 15,
              padding: "12px 14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              border: "none",
              borderRadius: 10,
              background: "#22c55e",
              color: "#04110a",
              fontSize: 15,
              fontWeight: 800,
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            Join Waitlist
          </button>
        </form>

        {waitlistStatus === "ok" ? (
          <div
            style={{
              marginTop: 14,
              fontSize: 14,
              color: "#86efac",
              lineHeight: 1.6,
            }}
          >
            We will let you know when your access is ready.
            {submittedEmail ? ` (${submittedEmail})` : ""}
          </div>
        ) : null}

        {waitlistStatus === "invalid_email" ? (
          <div
            style={{
              marginTop: 14,
              fontSize: 14,
              color: "#fca5a5",
              lineHeight: 1.6,
            }}
          >
            이메일 형식이 올바르지 않습니다. 다시 확인해주세요.
          </div>
        ) : null}

        {waitlistStatus === "error" ? (
          <div
            style={{
              marginTop: 14,
              fontSize: 14,
              color: "#fca5a5",
              lineHeight: 1.6,
            }}
          >
            지금은 대기자 명단에 등록할 수 없습니다. 잠시 후 다시 시도해주세요.
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 64,
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: 980,
          }}
        >
          {features.map((feature) => (
            <div
              key={feature.title}
              style={{
                background: "#111111",
                border: "1px solid #1f1f1f",
                borderRadius: 12,
                padding: "26px 22px",
                flex: "1 1 250px",
                maxWidth: 300,
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{feature.icon}</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "#f3f4f6",
                }}
              >
                {feature.title}
              </div>
              <div style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6 }}>
                {feature.desc}
              </div>
            </div>
          ))}
        </div>
      </main>

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
