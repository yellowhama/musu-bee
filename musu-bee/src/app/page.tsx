import type { Metadata } from "next";
import Link from "next/link";
import PublicSiteShell from "@/components/PublicSiteShell";
import {
  DIFFERENTIATION,
  HOME_PROOF_CARDS,
  HOW_IT_WORKS,
  ICP_CHIPS,
  PRIMARY_CTA,
  SECONDARY_CTA,
  SITE_POSITIONING,
  TRUST_POINTS,
} from "@/lib/publicSiteContent";

export const metadata: Metadata = {
  title: "MUSU | Multi-machine AI control plane",
  description:
    "Coordinate AI work across your machines from one chat. Built for developers and operators running more than one machine.",
};

export default function HomePage() {
  return (
    <PublicSiteShell>
      <main>
        <section
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "88px 24px 56px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 32,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.14em",
                color: "#facc15",
                textTransform: "uppercase",
                marginBottom: 18,
              }}
            >
              <span>●</span>
              <span>{SITE_POSITIONING.eyebrow}</span>
            </div>
            <h1
              style={{
                fontSize: "clamp(38px, 7vw, 76px)",
                lineHeight: 1.02,
                letterSpacing: "-0.05em",
                fontWeight: 900,
                margin: "0 0 18px",
                maxWidth: 680,
              }}
            >
              {SITE_POSITIONING.title}
            </h1>
            <p
              style={{
                fontSize: 18,
                color: "#d1d5db",
                lineHeight: 1.7,
                maxWidth: 680,
                margin: "0 0 12px",
              }}
            >
              {SITE_POSITIONING.subtitle}
            </p>
            <p
              style={{
                fontSize: 14,
                color: "#9ca3af",
                lineHeight: 1.7,
                maxWidth: 640,
                margin: "0 0 26px",
              }}
            >
              {SITE_POSITIONING.audience}
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <Link href={PRIMARY_CTA.href} style={primaryButtonStyle}>
                {PRIMARY_CTA.label}
              </Link>
              <Link href={SECONDARY_CTA.href} style={secondaryButtonStyle}>
                {SECONDARY_CTA.label}
              </Link>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {ICP_CHIPS.map((chip) => (
                <span key={chip} style={chipStyle}>
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 18,
                color: "#9ca3af",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#22c55e" }}>●</span>
              <span>live-ish product surface</span>
            </div>
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              <div style={surfaceCardStyle}>
                <div style={surfaceLabelStyle}>channels</div>
                <div style={surfaceRowStyle}>
                  <span style={surfaceActiveStyle}>ceo</span>
                  <span style={surfaceMutedStyle}>cto</span>
                  <span style={surfaceMutedStyle}>engineer</span>
                  <span style={surfaceMutedStyle}>tasks</span>
                </div>
              </div>
              <div style={surfaceCardStyle}>
                <div style={surfaceLabelStyle}>devices</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    "Musu-A  CPU 48% · GPU 23% · RAM 62%",
                    "Musu-B  CPU 72% · GPU 61% · RAM 45%",
                    "Musu-C  unreachable",
                  ].map((line) => (
                    <div key={line} style={surfaceLineStyle}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
              <div style={surfaceCardStyle}>
                <div style={surfaceLabelStyle}>work intent</div>
                <div style={surfaceLineStyle}>
                  “Split work across my desktop and GPU box, then report back here.”
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "8px 24px 40px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {HOME_PROOF_CARDS.map((card) => (
              <article key={card.title} style={proofCardStyle}>
                <h2
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    margin: "0 0 10px",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {card.title}
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "#9ca3af",
                    lineHeight: 1.7,
                  }}
                >
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "64px 24px",
          }}
        >
          <SectionHeader
            eyebrow="HOW IT WORKS"
            title="DIY 오케스트레이션 대신, 한 화면에서 운영한다."
            description="MUSU의 공개 사이트는 지금 과장보다 흐름 설명이 더 중요하다. 설치하고, 연결하고, 채팅으로 위임하고, 상태와 결과를 한 곳에서 보는 흐름을 먼저 이해시켜야 한다."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 18,
            }}
          >
            {HOW_IT_WORKS.map((item) => (
              <article key={item.step} style={stepCardStyle}>
                <div style={stepNumberStyle}>{item.step}</div>
                <h3 style={stepTitleStyle}>{item.title}</h3>
                <p style={stepDescriptionStyle}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "24px 24px 64px",
          }}
        >
          <SectionHeader
            eyebrow="WHY MUSU"
            title="MUSU는 어디에 서야 하는가"
            description="이 사이트는 Cursor, Bolt, Lovable, v0, Replit, Relay 같은 익숙한 AI 제품들과 implicitly 비교된다. 그래서 정체성을 분명히 말해야 한다."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
            }}
          >
            {DIFFERENTIATION.map((item) => (
              <article key={item.title} style={diffCardStyle}>
                <h3 style={diffTitleStyle}>{item.title}</h3>
                <p style={diffDescStyle}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "8px 24px 96px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 0.85fr",
              gap: 20,
              alignItems: "stretch",
            }}
          >
            <div style={trustPanelStyle}>
              <div style={eyebrowStyle}>TRUST AND HONESTY</div>
              <h2 style={panelTitleStyle}>
                지금은 과장보다 증빙이 중요하다.
              </h2>
              <p style={panelDescStyle}>
                MUSU는 beta 상태를 숨기지 않고, 현재 보이는 제품 surface와 일치하는 주장만
                사용해야 한다. 이 원칙이 public site의 신뢰를 만든다.
              </p>
              <ul style={trustListStyle}>
                {TRUST_POINTS.map((point) => (
                  <li key={point} style={trustListItemStyle}>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div style={ctaPanelStyle}>
              <div style={eyebrowStyle}>NEXT STEP</div>
              <h2 style={panelTitleStyle}>먼저 early access에 합류하라.</h2>
              <p style={panelDescStyle}>
                지금 public site의 올바른 CTA는 broad checkout push가 아니라 proof-backed
                early access다.
              </p>
              <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
                <Link href="/landing" style={primaryButtonStyle}>
                  Join Early Access
                </Link>
                <Link href="/pricing" style={secondaryButtonStyle}>
                  View Pricing Context
                </Link>
                <Link href="/install" style={ghostButtonStyle}>
                  Install The Port
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div style={{ maxWidth: 760, marginBottom: 32 }}>
      <div style={eyebrowStyle}>{eyebrow}</div>
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: "clamp(28px, 5vw, 44px)",
          lineHeight: 1.08,
          fontWeight: 900,
          letterSpacing: "-0.04em",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: "#9ca3af",
          lineHeight: 1.75,
        }}
      >
        {description}
      </p>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#facc15",
  color: "#0a0a0a",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: 15,
  padding: "14px 20px",
  borderRadius: 999,
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  background: "transparent",
  color: "#f3f4f6",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 15,
  padding: "14px 20px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
};

const ghostButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 15,
  padding: "14px 20px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#d1d5db",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 999,
  padding: "8px 12px",
};

const surfaceCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 16,
};

const surfaceLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontWeight: 800,
  marginBottom: 10,
};

const surfaceRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const surfaceActiveStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "#facc15",
  color: "#0a0a0a",
  fontSize: 13,
  fontWeight: 800,
};

const surfaceMutedStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 700,
};

const surfaceLineStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#d1d5db",
  fontFamily:
    "'JetBrains Mono', 'SFMono-Regular', 'Roboto Mono', monospace",
};

const proofCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 20,
};

const stepCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 22,
};

const stepNumberStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#facc15",
  fontWeight: 900,
  letterSpacing: "0.12em",
  marginBottom: 10,
};

const stepTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const stepDescriptionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#9ca3af",
  lineHeight: 1.7,
};

const diffCardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(250,204,21,0.06), rgba(255,255,255,0.02))",
  border: "1px solid rgba(250,204,21,0.14)",
  borderRadius: 20,
  padding: 22,
};

const diffTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const diffDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#d1d5db",
  lineHeight: 1.7,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#facc15",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const trustPanelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24,
  padding: 24,
};

const ctaPanelStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(250,204,21,0.12), rgba(255,255,255,0.03))",
  border: "1px solid rgba(250,204,21,0.18)",
  borderRadius: 24,
  padding: 24,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(24px, 4vw, 34px)",
  lineHeight: 1.12,
  fontWeight: 900,
  letterSpacing: "-0.04em",
};

const panelDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#d1d5db",
  lineHeight: 1.75,
};

const trustListStyle: React.CSSProperties = {
  margin: "22px 0 0",
  paddingLeft: 18,
  color: "#d1d5db",
  display: "grid",
  gap: 10,
};

const trustListItemStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
};
