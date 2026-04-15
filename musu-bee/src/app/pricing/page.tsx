import type { Metadata } from "next";
import Link from "next/link";
import PublicSiteShell from "@/components/PublicSiteShell";
import CheckoutButton from "@/components/CheckoutButton";
import { PRICING_TIERS } from "@/lib/publicSiteContent";

export const metadata: Metadata = {
  title: "MUSU Pricing",
  description:
    "Pricing and access context for MUSU early-access users and multi-machine teams.",
};

interface PageProps {
  searchParams: Promise<{ success?: string; cancelled?: string; tier?: string }>;
}

export default async function PricingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isSuccess = params.success === "1";
  const isCancelled = params.cancelled === "1";

  return (
    <PublicSiteShell>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 24px 96px" }}>
        <div style={eyebrowStyle}>PRICING AND ACCESS</div>
        <h1 style={titleStyle}>가격보다 먼저, 어떤 운영 문제를 푸는지 설명해야 한다.</h1>
        <p style={descStyle}>
          MUSU pricing page는 단순히 결제 버튼을 보여주는 곳이 아니라, 누가 어떤 상태에서 어떤
          접근 경로를 선택해야 하는지 설명하는 곳이어야 한다.
        </p>

        {isSuccess && (
          <div style={successBannerStyle}>
            결제가 완료되었습니다. MUSU {params.tier?.toUpperCase() ?? "PRO"} 플랜이
            활성화되었습니다.
          </div>
        )}
        {isCancelled && (
          <div style={errorBannerStyle}>
            결제가 취소되었습니다. 접근이 준비되면 언제든 다시 시도할 수 있습니다.
          </div>
        )}

        <section style={{ marginTop: 32, display: "grid", gap: 18 }}>
          <div style={contextCardStyle}>
            <div style={cardEyebrowStyle}>HONEST STATE</div>
            <h2 style={sectionTitleStyle}>현재 public site의 기본 경로는 waitlist 중심이 맞다.</h2>
            <p style={sectionDescStyle}>
              현재 pricing은 존재하지만 broad paid acquisition보다 early access와 beta
              honesty가 더 중요하다. 따라서 pricing 페이지는 “지금 결제하라”보다 “어떤 사용자가
              어떤 플랜에 맞는지”를 먼저 설명해야 한다.
            </p>
            <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/landing" style={primaryButtonStyle}>
                Join Early Access
              </Link>
              <Link href="/faq" style={secondaryButtonStyle}>
                Read FAQ
              </Link>
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 36,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
            alignItems: "start",
          }}
        >
          {PRICING_TIERS.map((tier, index) => (
            <article
              key={tier.name}
              style={{
                ...tierCardStyle,
                ...(index === 0 ? highlightedTierStyle : null),
              }}
            >
              <div style={cardEyebrowStyle}>{tier.name.toUpperCase()}</div>
              <h2 style={tierTitleStyle}>{tier.name}</h2>
              <div style={priceRowStyle}>
                <span style={priceStyle}>{tier.price}</span>
                <span style={periodStyle}>{tier.period}</span>
              </div>
              <div style={audienceStyle}>{tier.audience}</div>
              <div style={devicesStyle}>{tier.devices}</div>
              <ul style={bulletListStyle}>
                {tier.bullets.map((bullet) => (
                  <li key={bullet} style={bulletStyle}>
                    {bullet}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                tier={tier.name.toLowerCase() as "pro" | "team"}
                label={`${tier.name} access`}
                style={index === 0 ? checkoutPrimaryStyle : checkoutSecondaryStyle}
              />
            </article>
          ))}
        </section>

        <section style={{ marginTop: 52, display: "grid", gap: 18 }}>
          <div style={gridStyle}>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>WHO IS PRO FOR</div>
              <h3 style={infoTitleStyle}>개인 개발기 + GPU 박스를 운영하는 사람</h3>
              <p style={infoDescStyle}>
                개인 환경이지만 이미 여러 머신을 운영 중이라면 Pro가 기본 프레임이다.
              </p>
            </article>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>WHO IS TEAM FOR</div>
              <h3 style={infoTitleStyle}>작은 팀이 여러 머신을 같이 쓰는 경우</h3>
              <p style={infoDescStyle}>
                팀 멤버와 기기 fleet을 공유해야 할 때 Team framing이 맞다.
              </p>
            </article>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>WHAT NOT TO DO</div>
              <h3 style={infoTitleStyle}>과장된 enterprise promise</h3>
              <p style={infoDescStyle}>
                명시적 security/privacy proof가 생기기 전까지 enterprise-grade promise는 세게
                밀지 않는 것이 정직하다.
              </p>
            </article>
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--musu-color-brand-accent)",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(34px, 6vw, 60px)",
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: "-0.05em",
};

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "#9ca3af",
  lineHeight: 1.75,
  maxWidth: 760,
};

const successBannerStyle: React.CSSProperties = {
  marginTop: 24,
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.25)",
  borderRadius: 16,
  color: "#86efac",
  padding: "14px 16px",
  fontSize: 14,
  fontWeight: 700,
};

const errorBannerStyle: React.CSSProperties = {
  marginTop: 24,
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.20)",
  borderRadius: 16,
  color: "#fca5a5",
  padding: "14px 16px",
  fontSize: 14,
};

const contextCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24,
  padding: 24,
};

const cardEyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--musu-color-brand-accent)",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: "clamp(24px, 4vw, 36px)",
  fontWeight: 900,
  lineHeight: 1.12,
  letterSpacing: "-0.04em",
};

const sectionDescStyle: React.CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  fontSize: 14,
  lineHeight: 1.75,
  maxWidth: 760,
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  background: "var(--musu-color-brand-accent)",
  color: "#0a0a0a",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: 15,
  padding: "14px 18px",
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
  padding: "14px 18px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
};

const tierCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24,
  padding: 24,
};

const highlightedTierStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(250,204,21,0.10), rgba(255,255,255,0.03))",
  border: "1px solid rgba(250,204,21,0.18)",
};

const tierTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 26,
  fontWeight: 900,
  letterSpacing: "-0.03em",
};

const priceRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  marginBottom: 8,
};

const priceStyle: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  letterSpacing: "-0.05em",
};

const periodStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#9ca3af",
};

const audienceStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#d1d5db",
  lineHeight: 1.7,
  marginBottom: 8,
};

const devicesStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#9ca3af",
  fontWeight: 700,
  marginBottom: 16,
};

const bulletListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "0 0 22px",
  display: "grid",
  gap: 10,
};

const bulletStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#d1d5db",
  lineHeight: 1.7,
};

const checkoutPrimaryStyle: React.CSSProperties = {
  background: "#0a0a0a",
  color: "var(--musu-color-brand-accent)",
};

const checkoutSecondaryStyle: React.CSSProperties = {
  background: "#1a1a1a",
  color: "#f3f4f6",
  border: "1px solid #2d2d2d",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 18,
};

const infoCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 20,
};

const infoTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const infoDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#9ca3af",
  lineHeight: 1.75,
};
