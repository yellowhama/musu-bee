import type { Metadata } from "next";
import type { CSSProperties } from "react";
import PublicSiteShell from "@/components/PublicSiteShell";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";

export const metadata: Metadata = {
  title: "MUSU Support",
  description: "Support information for MUSU desktop, install, and beta workflows.",
};

export default function SupportPage() {
  return (
    <PublicSiteShell>
      <main style={pageStyle}>
        <div style={eyebrowStyle}>SUPPORT</div>
        <h1 style={titleStyle}>MUSU Support</h1>
        <p style={descStyle}>
          MUSU is in beta. Support is focused on install, startup, local diagnostics,
          Store packaging, and proof-backed multi-device workflow issues.
        </p>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Best support route</h2>
          <p style={bodyStyle}>
            For the first public release path, use this page as the Partner Center support URL:
            <strong> https://musu.pro/support</strong>. For account, privacy, or urgent install
            issues, email{" "}
            <a href={SUPPORT_MAILTO} style={linkStyle}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Include this diagnostic evidence</h2>
          <ul style={listStyle}>
            <li>Windows version and CPU architecture.</li>
            <li>MUSU version and install source.</li>
            <li>Output from <code style={codeStyle}>musu up --json</code>.</li>
            <li>Output from <code style={codeStyle}>musu doctor --json</code>.</li>
            <li>For Store/MSIX installs, the package name and any install error text.</li>
            <li>For multi-device tests, attach the generated evidence JSON.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Current beta scope</h2>
          <p style={bodyStyle}>
            The verified local beta path covers the Windows runtime package, local dashboard
            readiness, local task execution, and the basic Tauri launcher/status shell. Full
            multi-machine release readiness is not claimed until returned second-PC evidence passes
            the release verifier.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Safety and security reports</h2>
          <p style={bodyStyle}>
            Report unexpected remote command behavior, file access behavior, package startup behavior,
            or privacy concerns before using MUSU on sensitive workspaces. Do not attach secrets,
            access tokens, private keys, or proprietary files to public reports.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Uninstall and updates</h2>
          <p style={bodyStyle}>
            Store-managed installs should use Windows and Microsoft Store update/uninstall flows.
            Local sideload builds are test builds and may require package removal before installing
            a newer build with a different startup contract.
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
