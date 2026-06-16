import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { MusuLogo } from "@/components/brand/MusuLogo";

export default function PublicSiteShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="musu-public-scroll-root" style={shellStyle}>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(14px)",
          background: "rgba(10,10,10,0.78)",
        }}
      >
        <Link
          href="/"
          style={brandLinkStyle}
        >
          <MusuLogo size="header" variant="onDark" />
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link href="/pricing" style={navLinkStyle}>
            Pricing
          </Link>
          <Link href="/install" style={navLinkStyle}>
            Install
          </Link>
          <Link href="/faq" style={navLinkStyle}>
            FAQ
          </Link>
          <Link href="/landing" style={navLinkStyle}>
            Early Access
          </Link>
          <Link href="/auth/login" style={navLinkStyle}>
            Log in
          </Link>
          <Link href="/auth/signup" data-brand-accent="emerald" style={appButtonStyle}>
            Sign up
          </Link>
        </div>
      </nav>
      {children}
      <footer
        style={{
          padding: "32px 24px 48px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          color: "var(--fg3)",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 8 }}>MUSU · multi-machine AI control plane</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
          <Link href="/privacy" style={footerLinkStyle}>
            Privacy
          </Link>
          <Link href="/support" style={footerLinkStyle}>
            Support
          </Link>
        </div>
        <div>© 2026 MUSU · honest beta, proof-backed claims only.</div>
      </footer>
    </div>
  );
}

type ShellStyle = CSSProperties & Record<`--${string}`, string>;

const shellStyle: ShellStyle = {
  "--fg1": "#f8fafc",
  "--fg2": "#cbd5e1",
  "--fg3": "#94a3b8",
  "--bg-base": "#0d0d0d",
  "--bg-card": "#111111",
  "--border-default": "rgba(255,255,255,0.12)",
  minHeight: "100vh",
  background: "#0d0d0d",
  color: "var(--fg1)",
  fontFamily:
    "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
};

const brandLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "var(--fg1)",
  textDecoration: "none",
  filter: "drop-shadow(0 0 12px rgba(var(--musu-color-brand-emerald-rgb), 0.22))",
};

const navLinkStyle: CSSProperties = {
  color: "var(--fg2)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
};

const appButtonStyle: CSSProperties = {
  color: "#041316",
  background: "var(--musu-color-brand-emerald)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 800,
  padding: "9px 14px",
  borderRadius: 999,
  boxShadow: "0 0 0 1px rgba(var(--musu-color-brand-emerald-rgb), 0.35)",
};

const footerLinkStyle: CSSProperties = {
  color: "var(--fg2)",
  textDecoration: "none",
  fontWeight: 700,
};

