import type { Metadata } from "next";
import Link from "next/link";
import PublicSiteShell from "@/components/PublicSiteShell";
import {
  EARLY_ACCESS_BENEFITS,
  ICP_CHIPS,
  INSTALL_COMMANDS,
} from "@/lib/publicSiteContent";

export const metadata: Metadata = {
  title: "MUSU Early Access",
  description:
    "Join the MUSU early-access waitlist for a multi-machine AI control plane built for developers and operators.",
};

type LandingPageProps = {
  searchParams: Promise<{
    waitlist?: string;
  }>;
};

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const waitlistStatus = params.waitlist;

  return (
    <PublicSiteShell>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 24px 96px" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div>
            <div style={eyebrowStyle}>EARLY ACCESS</div>
            <h1 style={titleStyle}>
              If you&apos;re already running multiple machines, you need a control plane.
            </h1>
            <p style={leadStyle}>
              MUSU early access isn&apos;t about &quot;AI is smart.&quot; It&apos;s about getting
              first access to a product that lets you operate your existing machines and AI workloads
              from a single surface.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              {ICP_CHIPS.map((chip) => (
                <span key={chip} style={chipStyle}>
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div style={formPanelStyle}>
            <div style={panelEyebrowStyle}>REQUEST ACCESS</div>
            <h2 style={panelTitleStyle}>Join the waitlist</h2>
            <p style={panelDescStyle}>
              At this stage, the right CTA is proof-backed early access, not a broad checkout.
            </p>

            <form action="/api/waitlist?from=/landing" method="post" style={formStyle}>
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
                style={inputStyle}
              />
              <button type="submit" style={submitStyle}>
                Join Waitlist
              </button>
            </form>

            {waitlistStatus === "ok" ? (
              <div style={okStyle}>We will let you know when your access is ready.</div>
            ) : null}

            {waitlistStatus === "invalid_email" ? (
              <div style={errorStyle}>Invalid email format. Please check and try again.</div>
            ) : null}

            {waitlistStatus === "error" ? (
              <div style={errorStyle}>
                Unable to join the waitlist right now. Please try again in a moment.
              </div>
            ) : null}

            <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
              {EARLY_ACCESS_BENEFITS.map((benefit) => (
                <div key={benefit} style={benefitStyle}>
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ marginTop: 56, display: "grid", gap: 18 }}>
          <div style={sectionCardStyle}>
            <div style={cardEyebrowStyle}>WHAT YOU ARE JOINING</div>
            <h2 style={sectionTitleStyle}>The site should show the operating surface before it makes promises.</h2>
            <p style={sectionDescStyle}>
              MUSU&apos;s current strength is showing &quot;what is running right now.&quot; So the early
              access page should lead with devices, status, installation, and access flow — not
              abstract copy.
            </p>
          </div>

          <div style={gridStyle}>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>CURRENT BETA SHAPE</div>
              <h3 style={infoTitleStyle}>Visible control surface</h3>
              <p style={infoDescStyle}>
                Agent channels, device state, waitlist flow, pricing surface, and onboarding
                commands are present today.
              </p>
            </article>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>ROADMAP WEDGE</div>
              <h3 style={infoTitleStyle}>Browser work surface</h3>
              <p style={infoDescStyle}>
                A browser terminal backed by remote PTY is a strong future wedge, but it should
                stay roadmap-framed until implementation and security policy exist.
              </p>
            </article>
            <article style={infoCardStyle}>
              <div style={cardEyebrowStyle}>NEXT STEP</div>
              <h3 style={infoTitleStyle}>Get positioned early</h3>
              <p style={infoDescStyle}>
                Early access is the right path for users who want to shape how MUSU handles
                machine coordination, control surfaces, and future remote access.
              </p>
            </article>
          </div>
        </section>

        <section style={{ marginTop: 56 }}>
          <div style={cardEyebrowStyle}>INSTALL SHAPE</div>
          <h2 style={sectionTitleStyle}>Install story</h2>
          <p style={sectionDescStyle}>
            Current install framing should stay simple: install the port, connect the machine, and
            surface it inside MUSU.
          </p>
          <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
            {INSTALL_COMMANDS.map((item) => (
              <article key={item.platform} style={installCardStyle}>
                <div style={installPlatformStyle}>{item.platform}</div>
                <div style={installLabelStyle}>{item.label}</div>
                <div style={installStatusStyle}>{item.status}</div>
                <p style={installDetailStyle}>{item.detail}</p>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <Link href="/install" style={linkButtonStyle}>
              View install page
            </Link>
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

const leadStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "#cbd5e1",
  lineHeight: 1.8,
  maxWidth: 620,
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--fg1)",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 999,
  padding: "8px 12px",
};

const formPanelStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(var(--musu-color-brand-emerald-rgb), 0.12), rgba(255,255,255,0.03))",
  border: "1px solid rgba(var(--musu-color-brand-emerald-rgb), 0.24)",
  borderRadius: 24,
  padding: 24,
};

const panelEyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--musu-color-brand-emerald)",
  fontWeight: 900,
  letterSpacing: "0.12em",
  marginBottom: 8,
};

const panelTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: "-0.04em",
};

const panelDescStyle: React.CSSProperties = {
  margin: "0 0 18px",
  color: "var(--fg1)",
  fontSize: 14,
  lineHeight: 1.75,
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f0f0f",
  border: "1px solid #2b2b2b",
  borderRadius: 12,
  color: "#f9fafb",
  fontSize: 15,
  padding: "12px 14px",
  outline: "none",
};

const submitStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  background: "var(--musu-color-brand-accent)",
  color: "var(--bg-base)",
  fontSize: 15,
  fontWeight: 900,
  padding: "12px 20px",
  cursor: "pointer",
};

const okStyle: React.CSSProperties = {
  marginTop: 14,
  fontSize: 14,
  color: "var(--status-online)",
  lineHeight: 1.6,
};

const errorStyle: React.CSSProperties = {
  marginTop: 14,
  fontSize: 14,
  color: "#fca5a5",
  lineHeight: 1.6,
};

const benefitStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--fg1)",
  lineHeight: 1.7,
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const sectionCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 22,
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

const installCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 8,
};

const installPlatformStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--musu-color-brand-accent)",
  fontWeight: 900,
};

const installLabelStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
};

const installStatusStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(var(--musu-color-brand-emerald-rgb), 0.12)",
  color: "var(--musu-color-brand-emerald)",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const installDetailStyle: React.CSSProperties = {
  margin: "0",
  color: "#cbd5e1",
  fontSize: 13,
  lineHeight: 1.75,
};

const linkButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--bg-base)",
  background: "var(--musu-color-brand-accent)",
  textDecoration: "none",
  fontWeight: 900,
  padding: "12px 16px",
  borderRadius: 999,
};
