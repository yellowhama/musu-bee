import type { Metadata } from "next";
import CheckoutButton from "@/components/CheckoutButton";

export const metadata: Metadata = {
  title: "MUSU — AI가 운영하는 나만의 팀",
  description:
    "여러 기기를 하나의 AI 팀으로. 사장 AI가 작업을 알아서 분배하고 처리합니다.",
};

// Pricing tiers (from MUS-811 pricing decision)
const TIERS = [
  {
    name: "Free",
    tier: "free" as const,
    price: "무료",
    period: "",
    devices: "기기 1대",
    features: ["기본 AI 채팅", "작업 분배", "상태 모니터링"],
    cta: "무료로 시작",
    highlight: false,
  },
  {
    name: "Pro",
    tier: "pro" as const,
    price: "₩12,000",
    period: "/월",
    devices: "기기 최대 3대",
    features: ["모든 Free 기능", "우선 처리 큐", "고급 분석 대시보드", "이메일 지원"],
    cta: "Pro 시작하기",
    highlight: true,
  },
  {
    name: "Team",
    tier: "team" as const,
    price: "₩25,000",
    period: "/월",
    devices: "기기 무제한",
    features: ["모든 Pro 기능", "팀 멤버 공유", "API 접근", "우선 기술 지원"],
    cta: "Team 시작하기",
    highlight: false,
  },
] as const;

const VALUE_PROPS = [
  {
    icon: "⚡",
    title: "자동 작업 분배",
    desc: "CPU·GPU 여유 기기로 자동 분배. 사장 AI가 최적 기기를 골라 처리합니다.",
  },
  {
    icon: "📊",
    title: "실시간 모니터링",
    desc: "모든 기기의 CPU·GPU·RAM 상태를 한 화면에서 확인하세요.",
  },
  {
    icon: "💬",
    title: "AI 팀 채팅",
    desc: "말만 하세요. 사장 AI가 기기 팀에 지시하고 결과를 가져옵니다.",
  },
] as const;

interface PageProps {
  searchParams: Promise<{ success?: string; cancelled?: string; tier?: string }>;
}

export default async function ProLandingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isSuccess = params.success === "1";
  const isCancelled = params.cancelled === "1";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f3f4f6",
        fontFamily:
          "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* ── Payment status banner ── */}
      {isSuccess && (
        <div
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            color: "#86efac",
            padding: "12px 24px",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          결제가 완료되었습니다! MUSU {params.tier?.toUpperCase() ?? "Pro"} 플랜이 활성화되었습니다.
        </div>
      )}
      {isCancelled && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#fca5a5",
            padding: "12px 24px",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          결제가 취소되었습니다. 언제든지 다시 시도할 수 있습니다.
        </div>
      )}

      {/* ── Nav ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1f1f1f",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>🐝</span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>
            MUSU
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#facc15",
              background: "rgba(250,204,21,0.12)",
              border: "1px solid rgba(250,204,21,0.3)",
              borderRadius: 4,
              padding: "1px 6px",
              letterSpacing: "0.04em",
            }}
          >
            BETA
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/pro#pricing"
            style={{
              fontSize: 13,
              color: "#9ca3af",
              textDecoration: "none",
              padding: "6px 14px",
              borderRadius: 8,
              transition: "color 0.15s",
            }}
          >
            가격
          </a>
          <a
            href="/"
            style={{
              fontSize: 13,
              color: "#0a0a0a",
              background: "#facc15",
              textDecoration: "none",
              padding: "6px 16px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            앱 열기
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "100px 24px 80px",
          textAlign: "center",
        }}
      >
        {/* Beta badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(250,204,21,0.1)",
            border: "1px solid rgba(250,204,21,0.25)",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 12,
            color: "#facc15",
            fontWeight: 600,
            marginBottom: 32,
            letterSpacing: "0.03em",
          }}
        >
          <span>✦</span>
          <span>베타 오픈 — 첫 10명 무료 이용</span>
        </div>

        <h1
          style={{
            fontSize: "clamp(36px, 6vw, 68px)",
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: "-0.04em",
            margin: "0 0 24px",
          }}
        >
          AI가 운영하는
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #facc15 0%, #f97316 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            나만의 기기 팀
          </span>
        </h1>

        <p
          style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            color: "#9ca3af",
            lineHeight: 1.7,
            maxWidth: 560,
            margin: "0 auto 48px",
          }}
        >
          여러 컴퓨터를 하나의 팀으로 묶으세요.
          <br />
          사장 AI가 작업을 알아서 분배하고, 결과를 가져옵니다.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/"
            style={{
              display: "inline-block",
              background: "#facc15",
              color: "#0a0a0a",
              fontWeight: 700,
              fontSize: 15,
              padding: "14px 32px",
              borderRadius: 12,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            무료로 시작하기 →
          </a>
          <a
            href="/"
            style={{
              display: "inline-block",
              background: "transparent",
              color: "#f3f4f6",
              fontWeight: 600,
              fontSize: 15,
              padding: "14px 32px",
              borderRadius: 12,
              textDecoration: "none",
              border: "1px solid #2d2d2d",
              letterSpacing: "-0.01em",
            }}
          >
            데모 보기
          </a>
        </div>

        {/* Hero illustration placeholder — device status row */}
        <div
          style={{
            marginTop: 72,
            background: "#111",
            border: "1px solid #1f1f1f",
            borderRadius: 16,
            padding: "24px 28px",
            textAlign: "left",
            fontSize: 13,
            color: "#6b7280",
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "1px solid #1f1f1f",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span style={{ color: "#f3f4f6", fontWeight: 600, fontSize: 13 }}>MUSU 팀 상태</span>
            <span style={{ marginLeft: "auto", color: "#374151" }}>2대 활성</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Musu-A (사장)", note: "4060Ti Desktop", cpu: 48, gpu: 23, ram: 62, status: "online" },
              { label: "Musu-B", note: "5070Ti Desktop", cpu: 72, gpu: 61, ram: 45, status: "busy" },
              { label: "Musu-C", note: "노트북", cpu: 0, gpu: null, ram: 0, status: "offline" },
            ].map((d) => (
              <div
                key={d.label}
                style={{ display: "flex", alignItems: "center", gap: 12, opacity: d.status === "offline" ? 0.4 : 1 }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: d.status === "online" ? "#22c55e" : d.status === "busy" ? "#facc15" : "#374151",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "#d1d5db", minWidth: 160 }}>{d.label}</span>
                <span style={{ color: "#4b5563", fontSize: 11, minWidth: 120 }}>{d.note}</span>
                {d.status !== "offline" ? (
                  <span style={{ color: "#6b7280", fontSize: 11 }}>
                    CPU {d.cpu}% · GPU {d.gpu ?? "—"}% · RAM {d.ram}%
                  </span>
                ) : (
                  <span style={{ color: "#374151", fontSize: 11 }}>오프라인</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value Props ── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "80px 24px",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            marginBottom: 56,
          }}
        >
          모든 기기를 하나의 팀으로
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {VALUE_PROPS.map((vp) => (
            <div
              key={vp.title}
              style={{
                background: "#111",
                border: "1px solid #1f1f1f",
                borderRadius: 16,
                padding: "28px 24px",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 16 }}>{vp.icon}</div>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                  color: "#f3f4f6",
                }}
              >
                {vp.title}
              </h3>
              <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.65, margin: 0 }}>
                {vp.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section
        id="pricing"
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "80px 24px",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            marginBottom: 12,
          }}
        >
          심플한 가격
        </h2>
        <p
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: 15,
            marginBottom: 48,
          }}
        >
          베타 기간 중 첫 10명은 무료. 베타 종료 시 50% 할인 쿠폰 제공.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
            alignItems: "start",
          }}
        >
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              style={{
                background: tier.highlight ? "#facc15" : "#111",
                border: tier.highlight ? "none" : "1px solid #1f1f1f",
                borderRadius: 20,
                padding: "32px 28px",
                position: "relative",
                transform: tier.highlight ? "scale(1.03)" : "none",
              }}
            >
              {tier.highlight && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#f97316",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 12px",
                    borderRadius: 20,
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                  }}
                >
                  가장 인기
                </div>
              )}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: tier.highlight ? "#0a0a0a" : "#9ca3af",
                  letterSpacing: "0.06em",
                  marginBottom: 12,
                }}
              >
                {tier.name.toUpperCase()}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 40,
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                    color: tier.highlight ? "#0a0a0a" : "#f3f4f6",
                  }}
                >
                  {tier.price}
                </span>
                <span style={{ fontSize: 14, color: tier.highlight ? "#4b3a00" : "#4b5563" }}>
                  {tier.period}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: tier.highlight ? "#4b3a00" : "#6b7280",
                  marginBottom: 24,
                  fontWeight: 600,
                }}
              >
                {tier.devices}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {tier.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: 14,
                      color: tier.highlight ? "#1a1000" : "#9ca3af",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: tier.highlight ? "#92400e" : "#374151", fontSize: 12 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                tier={tier.tier}
                label={tier.cta}
                style={{
                  background: tier.highlight ? "#0a0a0a" : "#1a1a1a",
                  color: tier.highlight ? "#facc15" : "#f3f4f6",
                  border: tier.highlight ? "none" : "1px solid #2d2d2d",
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        style={{
          maxWidth: 700,
          margin: "0 auto",
          padding: "80px 24px 120px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            marginBottom: 16,
            lineHeight: 1.15,
          }}
        >
          지금 시작하면
          <br />
          <span style={{ color: "#facc15" }}>베타 무료</span>
        </h2>
        <p
          style={{
            color: "#6b7280",
            fontSize: 15,
            marginBottom: 40,
            lineHeight: 1.6,
          }}
        >
          첫 10명 베타 유저는 무료로 이용할 수 있습니다.
          <br />
          베타 종료 시 50% 할인 쿠폰이 제공됩니다.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            background: "#facc15",
            color: "#0a0a0a",
            fontWeight: 800,
            fontSize: 16,
            padding: "16px 40px",
            borderRadius: 14,
            textDecoration: "none",
            letterSpacing: "-0.02em",
          }}
        >
          무료로 시작하기 →
        </a>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: "1px solid #1a1a1a",
          padding: "32px 24px",
          textAlign: "center",
          color: "#374151",
          fontSize: 13,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>🐝</span>
          <span style={{ fontWeight: 700, color: "#4b5563" }}>MUSU</span>
        </div>
        <p style={{ margin: 0 }}>© 2026 MUSU. 모든 기기를 하나의 팀으로.</p>
      </footer>
    </div>
  );
}
