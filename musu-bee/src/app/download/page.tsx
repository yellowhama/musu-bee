import type { Metadata } from "next";
import type { CSSProperties } from "react";
import PublicSiteShell from "@/components/PublicSiteShell";
import {
  DESKTOP_INSTALL_SCRIPT_URL,
  DESKTOP_MSIX_URL,
  DESKTOP_SETUP_EXE_URL,
  PUBLIC_RELEASE_METADATA_TEXT,
  PUBLIC_RELEASE_VERSION,
} from "@/lib/publicRelease";

export const metadata: Metadata = {
  title: "Download MUSU for Windows",
  description:
    "Install MUSU for Windows in one line: irm https://musu.pro/install.ps1 | iex. Beta build, self-signed; the installer trusts the cert and installs for you.",
};

export default function DownloadPage() {
  return (
    <PublicSiteShell>
      <main style={pageStyle}>
        <p style={releaseMetadataStyle}>{PUBLIC_RELEASE_METADATA_TEXT}</p>
        <div style={eyebrowStyle}>DOWNLOAD</div>
        <h1 style={titleStyle}>MUSU for Windows</h1>
        <p style={descStyle}>
          MUSU is in beta. The desktop build is self-signed today (not yet
          Microsoft Store-signed). The one-click installer trusts the beta
          certificate and installs MUSU for you in a single step &mdash; no
          commands to type. After that, MUSU keeps itself updated automatically.
          Version <strong>{PUBLIC_RELEASE_VERSION}</strong>, x64.
        </p>

        <section style={{ ...sectionStyle, marginTop: 28 }}>
          <h2 style={headingStyle}>Install in one line</h2>
          <p style={bodyStyle}>
            Open <strong>PowerShell</strong> and paste this. It trusts the beta
            certificate and installs MUSU (with automatic updates) &mdash; you
            never type a certificate command, and it elevates itself once.
          </p>
          <pre style={preStyle}>
            <code data-testid="install-one-liner">irm https://musu.pro/install.ps1 | iex</code>
          </pre>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Prefer a .exe? Just double-click.</h2>
          <p style={bodyStyle}>
            Download{" "}
            <a href={DESKTOP_SETUP_EXE_URL} style={linkStyle} data-testid="setup-exe-link">
              MUSU setup.exe
            </a>{" "}
            and run it &mdash; the classic installer, no PowerShell. It bundles
            everything it needs (including the Edge WebView2 runtime), so it works
            on a fresh PC out of the box.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Prefer to download the script?</h2>
          <p style={bodyStyle}>
            Grab{" "}
            <a href={DESKTOP_INSTALL_SCRIPT_URL} style={linkStyle}>
              Install-MUSU.ps1
            </a>{" "}
            and right-click &rarr; &ldquo;Run with PowerShell.&rdquo; Same result
            as the one-liner.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Why the certificate step?</h2>
          <p style={bodyStyle}>
            Windows only installs signed apps. During beta, MUSU signs its own
            package with a self-signed certificate instead of paying for a
            commercial code-signing certificate or going through Store review.
            Trusting the certificate tells Windows this specific publisher is one
            you allow. A future Store release will remove this step.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Manual install</h2>
          <p style={bodyStyle}>
            Prefer the raw package? After trusting the certificate, download{" "}
            <a href={DESKTOP_MSIX_URL} style={linkStyle}>
              musu-desktop-x64.msix
            </a>{" "}
            and run <code style={codeStyle}>Add-AppxPackage .\musu-desktop-x64.msix</code>.
            The <code style={codeStyle}>.appinstaller</code> route is recommended
            because it also wires up automatic updates.
          </p>
        </section>
      </main>
    </PublicSiteShell>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "80px 24px 96px",
};

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
};

const descStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "var(--fg2)",
  lineHeight: 1.75,
  maxWidth: 780,
};

const ctaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  marginTop: 28,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "16px 28px",
  borderRadius: 12,
  background:
    "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 700,
  boxShadow: "0 4px 14px rgba(36, 200, 219, 0.2)",
};

const sectionStyle: CSSProperties = {
  marginTop: 28,
  paddingTop: 24,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const headingStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 22,
  fontWeight: 850,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: "var(--fg2)",
  fontSize: 15,
  lineHeight: 1.8,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  color: "var(--fg2)",
  fontSize: 15,
  lineHeight: 1.85,
};

const preStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "14px 16px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  overflowX: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  lineHeight: 1.6,
  color: "var(--fg1)",
};

const codeStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  padding: "2px 5px",
  border: "1px solid rgba(255,255,255,0.12)",
};

const linkStyle: CSSProperties = {
  color: "var(--musu-color-brand-accent)",
  fontWeight: 800,
};

const releaseMetadataStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
