import Link from "next/link";
import type { CSSProperties } from "react";
import { MusuLogo } from "@/components/brand/MusuLogo";

export const metadata = {
  title: "MUSU | The Antigravity Workspace",
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
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Sleek Background Glows */}
      <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "60%", height: "60%", background: "radial-gradient(circle, rgba(36,200,219,0.1) 0%, transparent 70%)", zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "20%", right: "-20%", width: "60%", height: "60%", background: "radial-gradient(circle, rgba(255,193,49,0.08) 0%, transparent 70%)", zIndex: 0, pointerEvents: "none" }} />

      {/* NAV */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px var(--space-3)",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(9, 9, 11, 0.6)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Link href="/" aria-label="MUSU home" style={siteLogoLinkStyle}>
          <MusuLogo size="header" variant="onDark" />
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link
            href="/app"
            className="btn btn-primary"
            style={{
              textDecoration: "none",
              borderRadius: "99px",
              padding: "10px 24px",
              background: "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)",
              color: "#fff",
              border: "none",
              boxShadow: "0 4px 14px rgba(36, 200, 219, 0.3)",
              fontWeight: 600,
            }}
          >
            Open App →
          </Link>
        </div>
      </nav>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1, position: "relative" }}>
        {/* HERO */}
        <section
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "80px var(--space-3) 60px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "rgba(36, 200, 219, 0.1)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              padding: "8px 16px",
              borderRadius: "99px",
              border: "1px solid rgba(36, 200, 219, 0.2)",
              marginBottom: 32,
              boxShadow: "0 0 20px rgba(36, 200, 219, 0.1)",
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
              letterSpacing: "-0.04em",
            }}
          >
            The Ultimate IDE <br />
            <span style={{ 
              background: "linear-gradient(to right, var(--accent), var(--brand-yellow))", 
              WebkitBackgroundClip: "text", 
              WebkitTextFillColor: "transparent" 
            }}>
              for Vibe Coders.
            </span>
          </h1>
          <p
            style={{
              fontSize: "var(--text-lg)",
              color: "var(--fg2)",
              lineHeight: 1.6,
              maxWidth: 720,
              margin: "0 auto 56px",
              fontWeight: 400,
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
              <div style={{ display: "flex", width: "100%", flexWrap: "wrap", gap: 12 }}>
                <input
                  type="email"
                  placeholder="Enter your email"
                  required
                  className="input-premium"
                  style={{
                    flex: "1 1 200px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-default)",
                    color: "var(--fg1)",
                    padding: "16px 24px",
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-base)",
                    outline: "none",
                    borderRadius: "12px",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-premium"
                  style={{
                    flex: "1 1 auto",
                    padding: "16px 32px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)",
                    color: "#fff",
                    border: "none",
                    boxShadow: "0 4px 14px rgba(36, 200, 219, 0.2)",
                    fontWeight: 600,
                    transition: "transform 0.1s ease, filter 0.2s ease",
                  }}
                >
                  Request Access
                </button>
              </div>
            </form>
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <Link
                href="/app"
                className="link-premium"
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  fontSize: "var(--text-base)",
                  color: "rgba(255, 255, 255, 0.6)",
                  textDecoration: "none",
                  fontWeight: 500,
                  transition: "color 0.2s",
                }}
              >
                Go to App Dashboard →
              </Link>
            </div>
          </div>
        </section>

        {/* 3-COLUMN MOCKUP SHOWCASE */}
        <section style={{ padding: "0 var(--space-3) 80px" }}>
          <div
            className="mockup-container"
            style={{
              maxWidth: 1000,
              margin: "0 auto",
              background: "rgba(24, 24, 27, 0.6)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "24px",
              boxShadow: "0 24px 48px -12px rgba(0,0,0,0.5)",
              display: "flex",
              overflow: "hidden",
            }}
          >
            {/* Left Panel - Nodes */}
            <div className="mockup-sidebar mockup-sidebar-left" style={{ borderRight: "1px solid var(--border-subtle)", background: "rgba(9, 9, 11, 0.4)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Devices</div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "12px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px #22C55E" }} />
                <span style={{ fontSize: "14px", fontFamily: "var(--font-ui)", fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>MacBook-Pro</span>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "12px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 8px #22C55E" }} />
                <span style={{ fontSize: "14px", fontFamily: "var(--font-ui)", fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>Cloud-A100</span>
              </div>
            </div>

            {/* Center Panel - Town Mode / Viewport */}
            <div style={{ flex: 1, padding: 32, position: "relative", background: "transparent", minWidth: 300 }}>
              <div style={{ position: "absolute", top: 24, right: 24, display: "flex", gap: 8, background: "rgba(0,0,0,0.2)", padding: 4, borderRadius: "12px" }}>
                <span style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>Dev</span>
                <span style={{ background: "rgba(255,255,255,0.1)", color: "var(--fg1)", padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>Town</span>
                <span style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>Butler</span>
              </div>
              
              <h3 style={{ fontSize: "24px", fontWeight: 600, fontFamily: "var(--font-display)", marginBottom: 32, marginTop: 12 }}>Agent Fleet Management</h3>
              
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {/* Agent Card */}
                <div style={{ background: "linear-gradient(145deg, rgba(39,39,42,0.8) 0%, rgba(24,24,27,0.8) 100%)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: 24, width: 220, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "16px", background: "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "18px", boxShadow: "0 4px 12px rgba(36,200,219,0.3)" }}>CEO</div>
                  <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: 4 }}>Project Lead</div>
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>Claude 3.5 Sonnet</div>
                </div>
                <div className="agent-add-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--border-strong)", borderRadius: "16px", padding: 24, width: 220, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}  >
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", fontWeight: 500 }}>+ Add Agent</span>
                </div>
              </div>
            </div>

            {/* Right Panel - Chat Console */}
            <div className="mockup-sidebar mockup-sidebar-right" style={{ borderLeft: "1px solid var(--border-subtle)", background: "rgba(9, 9, 11, 0.4)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 20, borderBottom: "1px solid var(--border-subtle)", fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} /> Console
              </div>
              <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "hidden" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: 16, fontSize: "14px", color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
                  Checking GPU memory across nodes...
                </div>
                <div style={{ background: "rgba(36, 200, 219, 0.1)", border: "1px solid rgba(36, 200, 219, 0.2)", borderRadius: "12px", padding: 16, fontSize: "14px", color: "var(--fg1)", lineHeight: 1.5, position: "relative" }}>
                  <div style={{ position: "absolute", left: -6, top: 20, width: 4, height: 16, background: "var(--accent)", borderRadius: 2 }} />
                  I've assigned the backend refactoring to Cloud-A100.
                </div>
              </div>
              <div style={{ padding: 20, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-strong)", borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", flex: 1 }}>Message CEO...</span>
                  <div style={{ width: 28, height: 28, borderRadius: "8px", background: "rgba(36, 200, 219, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>↑</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section style={{ position: "relative", padding: "80px var(--space-3)", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-base)" }}>
          {/* Subtle gradient underneath features */}
          <div style={{ position: "absolute", top: 0, left: "20%", width: "60%", height: "100%", background: "radial-gradient(ellipse at top, rgba(36,200,219,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
          
          <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>
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
                  icon: "◫"
                },
                {
                  title: "Generative UI (Holograms)",
                  desc: "AI that responds with more than just text. Charts, tables, loading bars, and summary widgets are rendered holographically in real-time.",
                  icon: "✨"
                },
                {
                  title: "Three Distinct Modes",
                  desc: "Dev Mode for terminal hackers. Town Mode to manage your AI team visually. Butler Mode for zero-knowledge natural language execution.",
                  icon: "⌘"
                },
              ].map((feat, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(24, 24, 27, 0.4)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "20px",
                    padding: 32,
                    transition: "transform 0.3s, border-color 0.3s, box-shadow 0.3s",
                    cursor: "default",
                  }}
                  className="hover-card-premium"
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "12px",
                      background: "rgba(36, 200, 219, 0.1)",
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      marginBottom: 24,
                      border: "1px solid rgba(36, 200, 219, 0.2)",
                    }}
                  >
                    {feat.icon}
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: 600, color: "var(--fg1)", marginBottom: 12 }}>
                    {feat.title}
                  </h3>
                  <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
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
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-base)",
          padding: "40px var(--space-3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <Link href="/" aria-label="MUSU home" style={siteLogoLinkStyle}>
          <MusuLogo size="header" variant="onDark" />
        </Link>
        <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)" }}>© 2026 MUSU. The Antigravity Workspace.</span>
      </footer>

      <style dangerouslySetInnerHTML={{__html: `
        /* 1. Mobile Responsiveness */
        .mockup-container {
          flex-direction: row;
          height: 520px;
        }
        .mockup-sidebar-left { width: 220px; }
        .mockup-sidebar-right { width: 340px; }
        
        @media (max-width: 900px) {
          .mockup-container {
            flex-direction: column;
            height: auto;
            min-height: 520px;
          }
          .mockup-sidebar-left, .mockup-sidebar-right {
            width: 100% !important;
            border-right: none !important;
            border-left: none !important;
            border-bottom: 1px solid var(--border-subtle);
          }
        }

        /* 2 & 3. Hover effects (Touch safe) */
        @media (hover: hover) and (pointer: fine) {
          .hover-card-premium:hover {
            transform: translateY(-4px);
            border-color: var(--accent-border) !important;
            box-shadow: 0 12px 30px -10px rgba(36, 200, 219, 0.15) !important;
          }
          .agent-add-card:hover {
            background: rgba(255,255,255,0.05) !important;
          }
          .link-premium:hover {
            color: var(--fg1) !important;
          }
          .btn-premium:hover {
            filter: brightness(1.1);
          }
        }
        
        /* Active states for touch feedback */
        .hover-card-premium:active, .btn-premium:active {
          transform: scale(0.98);
        }

        /* 4. Input focus transitions */
        .input-premium:focus {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 2px rgba(36, 200, 219, 0.2) !important;
        }
      `}} />
    </div>
  );
}

const siteLogoLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "var(--fg1)",
  textDecoration: "none",
};
