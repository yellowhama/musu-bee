import type { Metadata } from "next";
import type { CSSProperties } from "react";
import PublicSiteShell from "@/components/PublicSiteShell";
import {
  DESKTOP_INSTALL_SCRIPT_URL,
  DESKTOP_MSIX_URL,
  PUBLIC_RELEASE_METADATA_TEXT,
  PUBLIC_RELEASE_VERSION,
} from "@/lib/publicRelease";

export const metadata: Metadata = {
  title: "Download MUSU for Windows",
  description:
    "Install MUSU for Windows on this PC or another PC in one line: irm https://musu.pro/install.ps1 | iex. Beta build, self-signed; the installer trusts the cert and installs for you.",
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
          Microsoft Store-signed). The installer trusts the beta certificate,
          installs MUSU, and registers the App Installer update path. Run the
          same command on every Windows PC you want in your fleet. Version{" "}
          <strong>{PUBLIC_RELEASE_VERSION}</strong>, x64.
        </p>

        <section style={{ ...sectionStyle, marginTop: 28 }}>
          <h2 style={headingStyle}>Install on another Windows PC</h2>
          <p style={bodyStyle}>
            On the other computer, open <strong>PowerShell</strong> and paste
            this exact command. The script elevates once, trusts the MUSU beta
            certificate, installs the package, and keeps the update channel
            attached.
          </p>
          <pre style={preStyle}>
            <code data-testid="install-one-liner">{INSTALL_ONE_LINER}</code>
          </pre>
          <p style={hintStyle}>
            After install, run <code style={codeStyle}>musu package-status</code>{" "}
            to confirm the package version, then{" "}
            <code style={codeStyle}>musu nodes --json</code> to confirm the
            machine has published itself to the fleet registry.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Prove the install after first launch</h2>
          <p style={bodyStyle}>
            Open MUSU once on that PC, then run this command to produce the JSON
            proof MUSU uses for release checks: installed package version,
            remote-usable fleet URL, direct-only online count, and brain token
            custody.
          </p>
          <pre style={preStyle}>
            <code data-testid="fleet-proof-command">{FLEET_PROOF_COMMAND}</code>
          </pre>
          <p style={hintStyle}>
            For a two-PC direct proof, include the expected node names:
          </p>
          <pre style={preStyle}>
            <code data-testid="fleet-proof-direct-command">{DIRECT_FLEET_PROOF_COMMAND}</code>
          </pre>
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

const INSTALL_ONE_LINER = "irm https://musu.pro/install.ps1 | iex";

const FLEET_PROOF_COMMAND =
  "& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -RequireBrainToken -Json";

const DIRECT_FLEET_PROOF_COMMAND =
  "& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName <this-pc-name> -ExpectedDirectPeerName <other-pc-name> -RequireBrainToken -Json";

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
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const hintStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "var(--fg2)",
  fontSize: 14,
  lineHeight: 1.75,
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
