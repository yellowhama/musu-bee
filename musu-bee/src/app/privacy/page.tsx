import type { Metadata } from "next";
import type { CSSProperties } from "react";
import PublicSiteShell from "@/components/PublicSiteShell";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";

export const metadata: Metadata = {
  title: "MUSU Privacy",
  description: "Privacy policy for MUSU desktop and web surfaces.",
};

export default function PrivacyPage() {
  return (
    <PublicSiteShell>
      <main style={pageStyle}>
        <div style={eyebrowStyle}>PRIVACY</div>
        <h1 style={titleStyle}>MUSU Privacy Policy</h1>
        <p style={descStyle}>
          This policy covers MUSU desktop, local runtime, dashboard, and public web surfaces.
          MUSU is currently an honest beta product, so privacy claims are kept narrow and tied to
          the behavior the product actually needs.
        </p>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Data MUSU may process</h2>
          <ul style={listStyle}>
            <li>Account and sign-in data when you use a hosted MUSU account or dashboard.</li>
            <li>Device and node metadata such as machine name, local service status, health checks, and version.</li>
            <li>Task metadata, task instructions, task results, and logs created by workflows you run.</li>
            <li>Local file paths or file contents only when you explicitly connect a workspace or run a workflow that uses them.</li>
            <li>Diagnostic data needed to debug install, startup, bridge, dashboard, and multi-device failures.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>How MUSU uses data</h2>
          <p style={bodyStyle}>
            MUSU uses this data to start and monitor the local runtime, show node readiness,
            route user-initiated tasks, troubleshoot failures, and improve the product. MUSU should not
            be described as a fully autonomous control system. Remote commands and file access are
            user-directed workflow surfaces.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Local runtime and remote workflows</h2>
          <p style={bodyStyle}>
            The desktop app starts a local bridge runtime on your machine. Multi-device workflows can
            connect machines you configure and may run approved tasks on those machines. You should
            only connect machines and workspaces you own or are authorized to operate.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Sharing and third parties</h2>
          <p style={bodyStyle}>
            MUSU does not sell personal information. MUSU may send workflow content to configured
            model providers, hosting providers, authentication providers, or infrastructure services
            only as needed to provide the product features you use. Provider-specific privacy terms
            also apply when you connect those services.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>User controls</h2>
          <ul style={listStyle}>
            <li>You can stop the local runtime and remove configured peers.</li>
            <li>You can avoid connecting sensitive workspaces or providers.</li>
            <li>You can request support for account, diagnostic, or deletion questions through the support page.</li>
            <li>Store-managed installs should use the Store update and uninstall path.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Security</h2>
          <p style={bodyStyle}>
            MUSU uses package-managed Windows distribution for the Store path and separates local
            sideload/manual startup from Store-reviewed startup behavior. Security and privacy claims
            will be updated as multi-device proof, Store review, and production controls mature.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Contact</h2>
          <p style={bodyStyle}>
            For privacy or support requests, email{" "}
            <a href={SUPPORT_MAILTO} style={linkStyle}>
              {SUPPORT_EMAIL}
            </a>{" "}
            or use the MUSU support page at{" "}
            <a href="/support" style={linkStyle}>
              /support
            </a>
            . This policy was last updated on 2026-05-29.
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

const linkStyle: CSSProperties = {
  color: "var(--musu-color-brand-accent)",
  fontWeight: 800,
};
