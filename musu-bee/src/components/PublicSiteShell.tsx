import Link from "next/link";

export default function PublicSiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(250,204,21,0.10), transparent 28%), radial-gradient(circle at top right, rgba(34,197,94,0.10), transparent 24%), #0a0a0a",
        color: "var(--fg1)",
        fontFamily:
          "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
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
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            color: "var(--fg1)",
            textDecoration: "none",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            fontSize: 18,
          }}
        >
          <span style={{ fontSize: 20 }}>🐝</span>
          <span>MUSU</span>
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
          <Link href="/app" style={appButtonStyle}>
            Open App
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
        <div>© 2026 MUSU · honest beta, proof-backed claims only.</div>
      </footer>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  color: "var(--fg2)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
};

const appButtonStyle: React.CSSProperties = {
  color: "var(--bg-base)",
  background: "var(--musu-color-brand-accent)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 800,
  padding: "9px 14px",
  borderRadius: 999,
};

