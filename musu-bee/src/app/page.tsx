import Link from "next/link";
import React from "react";

export const metadata = {
  title: "MUSU | Coming Soon",
  description: "The Antigravity Workspace for Vibe Coders.",
};

// VibeCode Aesthetics
const colors = {
  bgBase: "#251714", // Deep Espresso
  bgSurface: "#2D1D19", // Slightly lighter espresso
  bgCard: "#3A2621",
  accent: "#FFA602", // Golden Orange
  textPrimary: "#F3F4F6",
  textSecondary: "#D4C5B9", // Warm muted text
  border: "#3A2621",
};

export default function ComingSoonPage() {
  return (
    <div
      style={{
        background: colors.bgBase,
        color: colors.textPrimary,
        fontFamily: "'Inter', -apple-system, sans-serif",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      {/* NAV */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 40px",
          borderBottom: `1px solid ${colors.border}`,
          background: "rgba(37, 23, 20, 0.85)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "-0.03em",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: colors.accent }}>✦</span> musu
        </span>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link
            href="/app"
            style={{
              fontSize: 13,
              fontWeight: 600,
              background: colors.accent,
              color: colors.bgBase,
              padding: "8px 16px",
              borderRadius: 6,
              textDecoration: "none",
              transition: "all 0.15s ease",
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
            maxWidth: 900,
            margin: "0 auto",
            padding: "120px 40px 80px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: colors.bgSurface,
              color: colors.accent,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "4px 12px",
              borderRadius: 999,
              marginBottom: 32,
              border: `1px solid rgba(255, 166, 2, 0.3)`,
            }}
          >
            Antigravity Workspace
          </div>
          <h1
            style={{
              fontSize: "clamp(40px, 6vw, 72px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              margin: "0 0 24px",
              color: colors.textPrimary,
            }}
          >
            The Ultimate IDE <br />
            <span style={{ color: colors.textSecondary }}>for Vibe Coders.</span>
          </h1>
          <p
            style={{
              fontSize: 18,
              color: colors.textSecondary,
              lineHeight: 1.6,
              maxWidth: 680,
              margin: "0 auto 48px",
            }}
          >
            The era of text-only chat bots is over. Meet the most beautiful AI control plane featuring Generative UI, 3 distinct workflow modes, and flawless multi-machine orchestration.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              maxWidth: 480,
              margin: "0 auto",
            }}
          >
            <form style={{ display: "flex", width: "100%", gap: 8 }}>
              <input
                type="email"
                placeholder="Enter your email"
                required
                style={{
                  flex: 1,
                  background: colors.bgSurface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  color: colors.textPrimary,
                  padding: "12px 16px",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  background: colors.accent,
                  color: colors.bgBase,
                  border: "none",
                  borderRadius: 6,
                  padding: "0 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Request Access
              </button>
            </form>
          </div>
        </section>

        {/* 3-COLUMN MOCKUP SHOWCASE */}
        <section style={{ padding: "0 40px 120px" }}>
          <div
            style={{
              maxWidth: 1000,
              margin: "0 auto",
              background: colors.bgSurface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
              display: "flex",
              height: 480,
            }}
          >
            {/* Left Panel - Nodes */}
            <div style={{ width: 220, borderRight: `1px solid ${colors.border}`, background: colors.bgBase, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Connected Fleet</div>
              <div style={{ background: colors.bgSurface, padding: "8px 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: 13, fontFamily: "monospace" }}>MacBook-Pro</span>
              </div>
              <div style={{ background: colors.bgSurface, padding: "8px 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: 13, fontFamily: "monospace" }}>Cloud-A100</span>
              </div>
            </div>

            {/* Center Panel - Town Mode / Viewport */}
            <div style={{ flex: 1, padding: 24, position: "relative" }}>
              <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }}>
                <span style={{ background: colors.bgCard, padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Dev</span>
                <span style={{ background: colors.accent, color: colors.bgBase, padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Town</span>
                <span style={{ background: colors.bgCard, padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Butler</span>
              </div>
              
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 12 }}>Agent Fleet Management</h3>
              
              <div style={{ display: "flex", gap: 16 }}>
                {/* Agent Card */}
                <div style={{ background: colors.bgCard, border: `1px solid rgba(255,166,2,0.2)`, borderRadius: 8, padding: 16, width: 200 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: colors.accent, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", color: colors.bgBase, fontWeight: 800 }}>CEO</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Project Lead</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>Claude 3.5 Sonnet</div>
                </div>
                <div style={{ background: colors.bgBase, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: 16, width: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: colors.textSecondary, fontSize: 13 }}>+ Add Agent</span>
                </div>
              </div>
            </div>

            {/* Right Panel - Chat Console */}
            <div style={{ width: 280, borderLeft: `1px solid ${colors.border}`, background: colors.bgBase, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${colors.border}`, fontSize: 13, fontWeight: 600 }}>Console</div>
              <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "hidden" }}>
                <div style={{ background: colors.bgSurface, padding: 12, borderRadius: 8, fontSize: 13, color: colors.textSecondary }}>
                  Checking GPU memory across nodes...
                </div>
                <div style={{ background: `rgba(255, 166, 2, 0.1)`, border: `1px solid rgba(255, 166, 2, 0.2)`, padding: 12, borderRadius: 8, fontSize: 13, color: colors.textPrimary }}>
                  I've assigned the backend refactoring to Cloud-A100.
                </div>
              </div>
              <div style={{ padding: 16, borderTop: `1px solid ${colors.border}` }}>
                <div style={{ background: colors.bgSurface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "8px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>Message CEO...</span>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: colors.accent }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section style={{ background: colors.bgSurface, padding: "100px 40px", borderTop: `1px solid ${colors.border}` }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 24,
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
                  style={{
                    background: colors.bgCard,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: 32,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: colors.accent,
                      fontFamily: "monospace",
                      marginBottom: 16,
                    }}
                  >
                    0{i + 1}
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
                    {feat.title}
                  </h3>
                  <p style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 1.6 }}>
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
          borderTop: `1px solid ${colors.border}`,
          background: colors.bgBase,
          padding: "32px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: colors.textSecondary }}>
          <span style={{ color: colors.accent }}>✦</span> musu
        </span>
        <span style={{ fontSize: 12, color: colors.textSecondary }}>© 2026 MUSU. The Antigravity Workspace.</span>
      </footer>
    </div>
  );
}
