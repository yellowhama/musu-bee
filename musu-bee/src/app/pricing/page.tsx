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
        <h1 style={titleStyle}>Before price, explain what operational problem this solves.</h1>
        <p style={descStyle}>
          The MUSU pricing page is not just a place to show a checkout button — it should explain
          who should choose which access path, and why.
        </p>

        {isSuccess && (
          <div style={successBannerStyle}>
            Payment complete. Your MUSU {params.tier?.toUpperCase() ?? "PRO"} plan is now active.
          </div>
        )}
        {isCancelled && (
          <div style={errorBannerStyle}>
            Payment cancelled. You can try again whenever you&apos;re ready.
          </div>
        )}

        <section style={{ marginTop: 32, display: "grid", gap: 18 }}>
          <div style={contextCardStyle}>
            <div style={cardEyebrowStyle}>HONEST STATE</div>
            <h2 style={sectionTitleStyle}>The primary path on the public site should be waitlist-first.</h2>
            <p style={sectionDescStyle}>
              Pricing exists, but early access and beta honesty matter more than broad paid
              acquisition right now. This page should explain &quot;who fits which plan&quot; before
              it says &quot;pay now.&quot;
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
              <h3 style={infoTitleStyle}>Running a dev machine + GPU box on your own</h3>
              <p style={infoDescStyle}>
                If you already operate multiple machines solo, Pro is the right frame.
              </p>
            </article>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>WHO IS TEAM FOR</div>
              <h3 style={infoTitleStyle}>A small team sharing a fleet of machines</h3>
              <p style={infoDescStyle}>
                When you need to share devices and workloads with teammates, Team is the right fit.
              </p>
            </article>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>WHAT NOT TO DO</div>
              <h3 style={infoTitleStyle}>Overstated enterprise promises</h3>
              <p style={infoDescStyle}>
                Until explicit security and privacy proof exists, it&apos;s more honest not to push
                enterprise-grade claims hard.
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
  color: "var(--fg2)",
  lineHeight: 1.75,
  maxWidth: 760,
};

const successBannerStyle: React.CSSProperties = {
  marginTop: 24,
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.25)",
  borderRadius: 16,
  color: "var(--status-online)",
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
  color: "var(--fg2)",
  fontSize: 14,
  lineHeight: 1.75,
  maxWidth: 760,
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  background: "var(--musu-color-brand-accent)",
  color: "var(--bg-base)",
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
  color: "var(--fg1)",
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
  color: "var(--fg2)",
};

const audienceStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--fg1)",
  lineHeight: 1.7,
  marginBottom: 8,
};

const devicesStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--fg2)",
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
  color: "var(--fg1)",
  lineHeight: 1.7,
};

const checkoutPrimaryStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--musu-color-brand-accent)",
};

const checkoutSecondaryStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  color: "var(--fg1)",
  border: "1px solid var(--border-default)",
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
  color: "var(--fg2)",
  lineHeight: 1.75,
};
