import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "MUSU | Your Personal AI Team",
  description: "Connect your devices and let your AI team do the work.",
};

export default function ProLandingPage() {
  // VibeCode Aesthetics for V2
  const colors = {
    bgBase: "#251714", // Deep Espresso
    bgSurface: "#2D1D19",
    bgCard: "#3A2621",
    accent: "#FFA602", // Golden Orange
    textPrimary: "#F3F4F6",
    textSecondary: "#D4C5B9",
    border: "#3A2621",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bgBase,
        color: colors.textPrimary,
        fontFamily: "'Inter', 'Pretendard', sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(37,23,20,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${colors.border}`,
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>
            <span style={{ color: colors.accent }}>✦</span> MUSU
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href="/landing" style={{ fontSize: 13, color: colors.bgBase, background: colors.accent, textDecoration: "none", padding: "6px 16px", borderRadius: 8, fontWeight: 700 }}>Open app</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "120px 24px 80px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: colors.bgSurface, color: colors.accent, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 999, marginBottom: 32, border: `1px solid rgba(255, 166, 2, 0.3)` }}>
          Coming Soon
        </div>
        <h1 style={{ fontSize: "clamp(40px, 6vw, 76px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.04em", margin: "0 0 24px" }}>
          Control multiple computers <br />
          <span style={{ color: colors.textSecondary }}>at once.</span>
        </h1>
        <p style={{ fontSize: "clamp(16px, 2vw, 20px)", color: colors.textSecondary, lineHeight: 1.6, maxWidth: 680, margin: "0 auto 48px" }}>
          Turn your scattered laptops and desktops into one powerful AI team. Just tell the AI what to do, and it will automatically find the right machine for the job and show you the results visually.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <form style={{ display: "flex", width: "100%", maxWidth: 400, gap: 8 }}>
            <input
              type="email"
              placeholder="Enter your email for early access"
              required
              style={{
                flex: 1,
                background: colors.bgSurface,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                color: colors.textPrimary,
                padding: "14px 16px",
                fontSize: 15,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: colors.accent,
                color: colors.bgBase,
                border: "none",
                borderRadius: 8,
                padding: "0 24px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Join Waitlist
            </button>
          </form>
        </div>
      </section>

      {/* ── Simple App Showcase ── */}
      <section style={{ padding: "0 24px 120px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", background: colors.bgSurface, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.4)", display: "flex", height: 480 }}>
          {/* Left Panel - Devices */}
          <div style={{ width: 220, borderRight: `1px solid ${colors.border}`, background: colors.bgBase, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>My Devices</div>
            <div style={{ background: colors.bgSurface, padding: "8px 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 13, color: colors.textPrimary }}>Home PC</span>
            </div>
            <div style={{ background: colors.bgSurface, padding: "8px 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 13, color: colors.textPrimary }}>Work Laptop</span>
            </div>
          </div>

          {/* Center Panel - Visual Work */}
          <div style={{ flex: 1, padding: 24, position: "relative" }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, marginTop: 12 }}>My AI Team</h3>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ background: colors.bgCard, border: `1px solid rgba(255,166,2,0.2)`, borderRadius: 8, padding: 16, width: 200 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: colors.accent, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", color: colors.bgBase, fontWeight: 800 }}>AI</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Project Manager</div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>Running on Home PC</div>
              </div>
            </div>
          </div>

          {/* Right Panel - Chat */}
          <div style={{ width: 280, borderLeft: `1px solid ${colors.border}`, background: colors.bgBase, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${colors.border}`, fontSize: 13, fontWeight: 600 }}>Chat with Manager</div>
            <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "hidden" }}>
              <div style={{ background: colors.bgSurface, padding: 12, borderRadius: 8, fontSize: 13, color: colors.textSecondary }}>
                Finding the fastest device...
              </div>
              <div style={{ background: `rgba(255, 166, 2, 0.1)`, border: `1px solid rgba(255, 166, 2, 0.2)`, padding: 12, borderRadius: 8, fontSize: 13, color: colors.textPrimary }}>
                I&apos;ve assigned the heavy data processing to your Home PC. I&apos;ll show you the chart when it&apos;s done!
              </div>
            </div>
            <div style={{ padding: 16, borderTop: `1px solid ${colors.border}` }}>
              <div style={{ background: colors.bgSurface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "8px 12px", display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>Type a message...</span>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: colors.accent }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Value Props (Layman terms) ── */}
      <section style={{ background: colors.bgSurface, padding: "100px 24px", borderTop: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {[
              {
                title: "Everything on one screen",
                desc: "See your connected laptops and desktops on the left, chat with your AI boss on the right, and watch the work happen in the middle.",
              },
              {
                title: "Answers you can see",
                desc: "The AI doesn't just reply with text. It creates charts, builds tables, and shows progress bars right in front of you.",
              },
              {
                title: "Made for everyone",
                desc: "Whether you're an expert who loves writing code, or someone who just wants to tell the AI what to do—there's a mode for you.",
              },
            ].map((feat, i) => (
              <div key={i} style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 32 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent, fontFamily: "monospace", marginBottom: 16 }}>0{i + 1}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>{feat.title}</h3>
                <p style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 1.6, margin: 0 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${colors.border}`, padding: "32px 24px", textAlign: "center", color: colors.textSecondary, fontSize: 13 }}>
        <p style={{ margin: 0 }}>© 2026 MUSU. Your personal AI team.</p>
      </footer>
    </div>
  );
}
