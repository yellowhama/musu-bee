import type { Metadata } from "next";
import type { CSSProperties } from "react";
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
          Install the MUSU desktop app on each Windows PC you want in the fleet.
          The PowerShell command pulls the installer from musu.pro, trusts the
          beta certificate, installs the package, and registers automatic
          updates.
        </p>

        <div style={{ display: "grid", gap: 18, marginTop: 32 }}>
          {INSTALL_COMMANDS.map((item) => {
            const isLiveCommand = item.status === "live";

            return (
              <article key={item.platform} style={cardStyle}>
                <div style={platformStyle}>{item.platform}</div>
                <h2 style={cardTitleStyle}>{item.label}</h2>
                <div style={statusPillStyle}>{item.status}</div>
                <div style={detailBlockStyle}>
                  {isLiveCommand ? (
                    <code data-testid="install-one-liner" style={commandStyle}>
                      {item.detail}
                    </code>
                  ) : (
                    <p style={{ margin: 0 }}>{item.detail}</p>
                  )}
                </div>
                {isLiveCommand ? (
                  <p style={hintStyle}>
                    Run this in PowerShell on the other PC, then check{" "}
                    <code style={inlineCodeStyle}>musu package-status</code>.
                  </p>
                ) : null}
              </article>
            );
          })}

          <article style={cardStyle}>
            <div style={platformStyle}>WINDOWS PROOF</div>
            <h2 style={cardTitleStyle}>Verify the installed PC</h2>
            <div style={detailBlockStyle}>
              <code data-testid="fleet-proof-command" style={commandStyle}>
                {FLEET_PROOF_COMMAND}
              </code>
            </div>
            <p style={hintStyle}>
              Run this after opening MUSU once. It emits JSON evidence for the
              installed package version, fleet URL, direct-only online count, and
              brain token custody.
            </p>
          </article>
        </div>
      </main>
    </PublicSiteShell>
  );
}

const FLEET_PROOF_COMMAND =
  "& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -RequireBrainToken -Json";

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--musu-color-brand-accent)",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const titleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "clamp(34px, 6vw, 58px)",
  fontWeight: 900,
  lineHeight: 1.04,
  letterSpacing: 0,
};

const descStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "var(--fg2)",
  lineHeight: 1.75,
  maxWidth: 760,
};

const cardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: 22,
};

const platformStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--musu-color-brand-accent)",
  fontWeight: 800,
  marginBottom: 8,
};

const cardTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 20,
  fontWeight: 800,
};

const statusPillStyle: CSSProperties = {
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

const detailBlockStyle: CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 8,
  background: "#0f0f0f",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--fg1)",
  lineHeight: 1.7,
};

const commandStyle: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const hintStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "var(--fg2)",
  fontSize: 14,
  lineHeight: 1.75,
};

const inlineCodeStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  padding: "2px 5px",
  border: "1px solid rgba(255,255,255,0.12)",
};
