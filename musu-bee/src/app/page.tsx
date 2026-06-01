import Link from "next/link";
import type { CSSProperties } from "react";
import { MusuLogo } from "@/components/brand/MusuLogo";

export const metadata = {
  title: "MUSU | Coming Soon",
  description: "The Antigravity Workspace for Vibe Coders.",
};

export default function ComingSoonPage() {
  return (
    <div
      className="musu-public-scroll-root"
      data-testid="public-home"
      style={{
        background: "var(--bg-base)",
        color: "var(--fg1)",
        fontFamily: "var(--font-ui)",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* NAV */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px var(--space-3)", /* Using min 56px height indirectly */
          borderBottom: "var(--neo-border)",
          background: "var(--bg-surface)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Link href="/" aria-label="MUSU home" style={siteLogoLinkStyle}>
          <MusuLogo size="header" variant="onLight" />
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link
            href="/app"
            className="btn btn-primary"
            style={{
              textDecoration: "none",
            }}
          >
            Open App →
          </Link>
        </div>
      </nav>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* HERO */}
        <section
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "var(--space-6) var(--space-3) var(--space-4)",
            textAlign: "center",
          }}
        >
          <div
            data-brand-accent="emerald"
            style={{
              display: "inline-block",
              background: "var(--bg-card)",
              color: "var(--musu-color-brand-emerald)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              padding: "12px 16px",
              border: "2px solid var(--musu-color-brand-emerald)",
              marginBottom: 32,
              boxShadow: "var(--neo-shadow-sm)",
            }}
          >
            Antigravity Workspace
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(48px, 8vw, 80px)",
              fontWeight: 800,
              lineHeight: 1.1,
              margin: "0 0 32px",
              color: "var(--fg1)",
            }}
          >
            The Ultimate IDE <br />
            <span style={{ color: "var(--fg3)" }}>for Vibe Coders.</span>
          </h1>
          <p
            style={{
              fontSize: "var(--text-md)", /* At least 18px (text-base is 18, md is 20) */
              color: "var(--fg2)",
              lineHeight: 1.7,
              maxWidth: 720,
              margin: "0 auto 56px",
            }}
          >
            The era of text-only chat bots is over. Meet the most beautiful AI control plane featuring Generative UI, 3 distinct workflow modes, and flawless multi-machine orchestration.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              maxWidth: 500,
              margin: "0 auto",
            }}
          >
            <form style={{ display: "flex", width: "100%", flexDirection: "column", gap: 16 }}>
              {/* Added gap and column for mobile, but let's do responsive flex */}
              <div style={{ display: "flex", width: "100%", flexWrap: "wrap", gap: 16 }}>
                <input
                  type="email"
                  placeholder="Enter your email"
                  required
                  style={{
                    flex: "1 1 200px",
                    background: "var(--bg-surface)",
                    border: "var(--neo-border)",
                    color: "var(--fg1)",
                    padding: "16px 24px",
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-base)", /* 18px */
                    outline: "none",
                    boxShadow: "var(--neo-shadow-sm)",
                    borderRadius: 0,
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-brand-accent="emerald"
                  style={{
                    flex: "1 1 auto",
                    padding: "16px 32px",
                    background: "var(--musu-color-brand-emerald)",
                    borderColor: "var(--musu-color-brand-ink)",
                    color: "var(--musu-color-brand-ink)",
                  }}
                >
                  Request Access
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* 3-COLUMN MOCKUP SHOWCASE */}
        <section style={{ padding: "0 var(--space-3) var(--space-6)" }}>
          <div
            style={{
              maxWidth: 1000,
              margin: "0 auto",
              background: "var(--bg-surface)",
              border: "var(--neo-border)",
              boxShadow: "var(--neo-shadow)",
              display: "flex",
              flexDirection: "row",
              height: 480,
              overflow: "hidden", /* Keep inner bounds sharp */
            }}
          >
            {/* Left Panel - Nodes */}
            <div style={{ width: 220, borderRight: "var(--neo-border)", background: "var(--bg-base)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg2)", textTransform: "uppercase" }}>Devices</div>
              <div style={{ background: "var(--bg-card)", border: "var(--neo-border)", padding: "12px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--musu-color-brand-emerald)" }} />
                <span style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>MacBook-Pro</span>
              </div>
              <div style={{ background: "var(--bg-card)", border: "var(--neo-border)", padding: "12px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--musu-color-brand-emerald)" }} />
                <span style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>Cloud-A100</span>
              </div>
            </div>

            {/* Center Panel - Town Mode / Viewport */}
            <div style={{ flex: 1, padding: 32, position: "relative", background: "var(--bg-surface)" }}>
              <div style={{ position: "absolute", top: 24, right: 24, display: "flex", gap: 12 }}>
                <span style={{ border: "var(--neo-border)", background: "var(--bg-base)", padding: "8px 16px", fontSize: "var(--text-sm)", fontWeight: 700 }}>Dev</span>
                <span style={{ border: "var(--neo-border)", background: "var(--accent)", color: "#000", padding: "8px 16px", fontSize: "var(--text-sm)", fontWeight: 700, boxShadow: "var(--neo-shadow-sm)" }}>Town</span>
                <span style={{ border: "var(--neo-border)", background: "var(--bg-base)", padding: "8px 16px", fontSize: "var(--text-sm)", fontWeight: 700 }}>Butler</span>
              </div>
              
              <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 32, marginTop: 12 }}>Agent Fleet Management</h3>
              
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {/* Agent Card */}
                <div style={{ background: "var(--bg-card)", border: "var(--neo-border)", padding: 24, width: 220, boxShadow: "var(--neo-shadow-sm)" }}>
                  <div style={{ width: 64, height: 64, background: "var(--accent)", border: "2px solid #000", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 800, fontSize: "var(--text-md)" }}>CEO</div>
                  <div style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: 8 }}>Project Lead</div>
                  <div style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-mono)", color: "var(--fg2)" }}>Claude 3.5 Sonnet</div>
                </div>
                <div style={{ background: "var(--bg-base)", border: "2px dashed var(--border-default)", padding: 24, width: 220, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <span style={{ color: "var(--fg1)", fontSize: "var(--text-base)", fontWeight: 700 }}>+ Add Agent</span>
                </div>
              </div>
            </div>

            {/* Right Panel - Chat Console */}
            <div style={{ width: 320, borderLeft: "var(--neo-border)", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 24, borderBottom: "var(--neo-border)", fontSize: "var(--text-base)", fontFamily: "var(--font-display)", fontWeight: 700 }}>Console</div>
              <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "hidden" }}>
                <div style={{ background: "var(--bg-surface)", border: "var(--neo-border)", padding: 16, fontSize: "var(--text-base)", color: "var(--fg1)", boxShadow: "2px 2px 0px #000" }}>
                  Checking GPU memory across nodes...
                </div>
                <div style={{ background: "var(--accent)", border: "var(--neo-border)", padding: 16, fontSize: "var(--text-base)", color: "#000", fontWeight: 600, boxShadow: "2px 2px 0px #000" }}>
                  I&apos;ve assigned the backend refactoring to Cloud-A100.
                </div>
              </div>
              <div style={{ padding: 24, borderTop: "var(--neo-border)" }}>
                <div style={{ background: "var(--bg-surface)", border: "var(--neo-border)", padding: "12px 16px", display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-mono)", color: "var(--fg2)", flex: 1 }}>Message CEO...</span>
                  <div style={{ width: 24, height: 24, background: "var(--accent)", border: "2px solid #000" }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section style={{ background: "var(--bg-surface)", padding: "var(--space-6) var(--space-3)", borderTop: "var(--neo-border)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 32,
              }}
            >
              {[
                {
                  title: "3-Column Antigravity Layout",
                  desc: "Monitor nodes on the left, communicate on the right, and visualize generative widgets in the massive center viewport. The perfect AI workflow ratio.",
                },
                {
                  title: "Generative UI (Holograms)",
                  desc: "AI that responds with more than just text. Charts, tables, loading bars, and summary widgets are rendered holographically in real-time.",
                },
                {
                  title: "Three Distinct Modes",
                  desc: "Dev Mode for terminal hackers. Town Mode to manage your AI team visually. Butler Mode for zero-knowledge natural language execution.",
                },
              ].map((feat, i) => (
                <div
                  key={i}
                  className="card"
                >
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 800,
                      color: "var(--accent)",
                      fontFamily: "var(--font-mono)",
                      marginBottom: 16,
                      background: "#000",
                      display: "inline-block",
                      padding: "4px 12px",
                      border: "1px solid var(--accent)",
                    }}
                  >
                    0{i + 1}
                  </div>
                  <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--fg1)", marginBottom: 16 }}>
                    {feat.title}
                  </h3>
                  <p style={{ fontSize: "var(--text-base)", color: "var(--fg2)", lineHeight: 1.6 }}>
                    {feat.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: "var(--neo-border)",
          background: "var(--bg-base)",
          padding: "32px var(--space-3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <Link href="/" aria-label="MUSU home" style={siteLogoLinkStyle}>
          <MusuLogo size="header" variant="onLight" />
        </Link>
        <span style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-mono)", color: "var(--fg3)" }}>© 2026 MUSU. The Antigravity Workspace.</span>
      </footer>
    </div>
  );
}

const siteLogoLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "var(--fg1)",
  textDecoration: "none",
};
