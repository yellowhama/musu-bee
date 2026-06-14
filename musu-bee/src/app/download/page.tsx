import type { Metadata } from "next";
import type { CSSProperties } from "react";
import PublicSiteShell from "@/components/PublicSiteShell";
import {
  DESKTOP_APPINSTALLER_URL,
  DESKTOP_CERT_URL,
  DESKTOP_MSIX_URL,
  PUBLIC_RELEASE_METADATA_TEXT,
  PUBLIC_RELEASE_VERSION,
} from "@/lib/publicRelease";

export const metadata: Metadata = {
  title: "Download MUSU for Windows",
  description:
    "Install MUSU for Windows. Beta build, self-signed: trust the certificate, then install the .appinstaller for automatic updates.",
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
          Microsoft Store-signed), so installing takes two steps: trust the
          certificate once, then install. After that, MUSU keeps itself updated
          automatically. Version <strong>{PUBLIC_RELEASE_VERSION}</strong>, x64.
        </p>

        <div style={ctaRowStyle}>
          <a
            href={DESKTOP_APPINSTALLER_URL}
            data-testid="download-appinstaller"
            style={primaryButtonStyle}
          >
            <span aria-hidden="true">⊞</span> Download installer (.appinstaller)
          </a>
          <a href={DESKTOP_CERT_URL} data-testid="download-cert" style={secondaryButtonStyle}>
            Download certificate (.cer)
          </a>
        </div>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Install in two steps</h2>
          <ol style={listStyle}>
            <li>
              <strong>Trust the certificate.</strong> Download{" "}
              <a href={DESKTOP_CERT_URL} style={linkStyle}>
                blossompark.musu.cer
              </a>{" "}
              and import it into your machine&rsquo;s Trusted People store. Open
              an <strong>Administrator</strong> PowerShell and run:
              <pre style={preStyle}>
                <code>
                  Import-Certificate -FilePath .\blossompark.musu.cer
                  {"\n"} -CertStoreLocation Cert:\LocalMachine\TrustedPeople
                </code>
              </pre>
            </li>
            <li>
              <strong>Install MUSU.</strong> Open{" "}
              <a href={DESKTOP_APPINSTALLER_URL} style={linkStyle}>
                musu.appinstaller
              </a>{" "}
              (double-click it, or run the command below). Windows App Installer
              handles installation and registers MUSU to check for updates every
              24 hours.
              <pre style={preStyle}>
                <code>Add-AppxPackage -AppInstallerFile &quot;{DESKTOP_APPINSTALLER_URL}&quot;</code>
              </pre>
            </li>
          </ol>
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

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "16px 28px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  color: "var(--fg1)",
  textDecoration: "none",
  fontWeight: 600,
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
  margin: "10px 0 0",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  overflowX: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
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
