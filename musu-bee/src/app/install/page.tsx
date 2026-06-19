import type { Metadata } from "next";
import PublicSiteShell from "@/components/PublicSiteShell";
import { INSTALL_COMMANDS } from "@/lib/publicSiteContent";

export const metadata: Metadata = {
  title: "Install MUSU",
  description: "Install the MUSU desktop app on Windows in one line.",
};

export default function InstallPage() {
  return (
    <PublicSiteShell>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px 96px" }}>
        <div style={eyebrowStyle}>INSTALL</div>
        <h1 style={titleStyle}>The fastest way to connect a machine to MUSU</h1>
        <p style={descStyle}>
          Install the MUSU desktop app on the device, open it, and watch it
          appear in your fleet. One PowerShell line — it trusts the beta
          certificate and installs the app for you.
        </p>

        <div style={{ display: "grid", gap: 18, marginTop: 32 }}>
          {INSTALL_COMMANDS.map((item) => (
            <article key={item.platform} style={cardStyle}>
              <div style={{ fontSize: 12, color: "var(--musu-color-brand-accent)", fontWeight: 800, marginBottom: 8 }}>
                {item.platform}
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>{item.label}</h2>
              <div style={statusPillStyle}>{item.status}</div>
              <div style={detailBlockStyle}>
                <p style={{ margin: 0 }}>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
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
  fontSize: "clamp(34px, 6vw, 58px)",
  fontWeight: 900,
  lineHeight: 1.04,
  letterSpacing: "-0.05em",
};

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "var(--fg2)",
  lineHeight: 1.75,
  maxWidth: 760,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 22,
};

const statusPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(var(--musu-color-brand-emerald-rgb), 0.12)",
  color: "var(--musu-color-brand-emerald)",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const detailBlockStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 16,
  background: "#0f0f0f",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--fg1)",
  lineHeight: 1.7,
};
