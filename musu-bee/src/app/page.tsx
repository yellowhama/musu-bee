import Link from "next/link";
import type { CSSProperties } from "react";
import { MusuLogo } from "@/components/brand/MusuLogo";
import { PUBLIC_RELEASE_VERSION } from "@/lib/publicRelease";

export const metadata = {
  title: "MUSU | Your computers, as one",
  description: "A desktop cockpit for your own machines. Give a computer an order, walk away, get notified when it's done. Private mesh you host yourself.",
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
            padding: "60px var(--space-3) 60px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 32, display: "flex", justifyContent: "center" }}>
            <MusuLogo size="hero" />
          </div>
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
            Your computers, as one
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
            Give a machine work. <br />
            <span style={{
              background: "linear-gradient(to right, var(--accent), var(--brand-yellow))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>
              Walk away.
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
            MUSU is a desktop cockpit for your own machines. Pick a computer, give it an order in one box, and walk away — MUSU runs it on that machine and taps you when it&rsquo;s done. Your machines join over a private mesh you host yourself; no account on someone else&rsquo;s network.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              maxWidth: 500,
              margin: "0 auto",
            }}
          >
            {/* Single primary CTA: download. The old email form had no onSubmit
                and no label — a dead CTA at the top of the funnel. The product
                ships today, so the honest primary action is "get it". */}
            {/* Desktop download: route to /download, NOT the raw .appinstaller.
                The package is self-signed; double-clicking the bare .appinstaller
                before the cert is trusted fails with a signature error. /download
                runs the one-click Install-MUSU.ps1 that trusts the cert first. */}
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <Link
                href="/download"
                className="btn btn-primary btn-premium"
                data-testid="hero-download-windows"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 32px",
                  borderRadius: "12px",
                  background:
                    "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 600,
                  boxShadow: "0 4px 14px rgba(36, 200, 219, 0.2)",
                  transition: "transform 0.1s ease, filter 0.2s ease",
                }}
              >
                <span aria-hidden="true">⊞</span> Download for Windows
              </Link>
              <div style={{ marginTop: 12 }}>
                <Link
                  href="/download"
                  className="link-premium"
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "rgba(255, 255, 255, 0.5)",
                    textDecoration: "none",
                  }}
                >
                  Install instructions &amp; certificate (v{PUBLIC_RELEASE_VERSION}) →
                </Link>
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: "center" }}>
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

            {/* Center Panel - the real cockpit: order box + attention-grouped
                task feed (status-by-shape). Mirrors what actually ships. */}
            <div style={{ flex: 1, padding: 32, position: "relative", background: "transparent", minWidth: 300, display: "flex", flexDirection: "column", gap: 20 }}>
              <h3 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "var(--font-display)", margin: 0 }}>Give Cloud-A100 work</h3>

              {/* Order composer */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-strong)", borderRadius: "12px", padding: "13px 16px", fontSize: "14px", color: "rgba(255,255,255,0.55)" }}>
                  What should Cloud-A100 do?
                </div>
                <div style={{ padding: "13px 22px", borderRadius: "12px", background: "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)", color: "#fff", fontWeight: 600, fontSize: "14px" }}>Send</div>
              </div>
              <p style={{ margin: "-8px 0 0", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>Private Mesh · runs on Cloud-A100, hash-verified route</p>

              {/* Running */}
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Running</div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                  {/* running = breathing amber circle (status-by-shape) */}
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--brand-yellow)", boxShadow: "0 0 8px rgba(255,209,102,0.6)", flexShrink: 0 }} />
                  <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.9)", flex: 1 }}>Refactor the auth module</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>0:42</span>
                </div>
              </div>

              {/* Done */}
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Done</div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                  {/* done = solid green circle */}
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                  <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", flex: 1 }}>Run the test suite</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>1:08</span>
                </div>
              </div>
            </div>

            {/* Right Panel - notification (walk away, get tapped) */}
            <div className="mockup-sidebar mockup-sidebar-right" style={{ borderLeft: "1px solid var(--border-subtle)", background: "rgba(9, 9, 11, 0.4)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 20, borderBottom: "1px solid var(--border-subtle)", fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} /> Walk away
              </div>
              <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "hidden" }}>
                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>Orders run in the background. MUSU taps you the moment a machine finishes — even if the window&apos;s closed.</p>
                {/* OS notification mock */}
                <div style={{ background: "rgba(24,24,27,0.9)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: 14, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.6)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "5px", background: "linear-gradient(135deg, var(--accent) 0%, var(--brand-yellow) 100%)", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--fg1)" }}>MUSU</span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>now</span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg1)" }}>Order done</div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Cloud-A100 finished &ldquo;Run the test suite&rdquo;</div>
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
                  title: "One box, any machine",
                  desc: "Pick a computer from your fleet, type what it should do, and send. The order runs on that machine — not in a chat window. Press ⌘K to target a machine and start an order without leaving the keyboard.",
                  icon: "◫"
                },
                {
                  title: "Walk away, get tapped",
                  desc: "Orders run in the background. The cockpit shows a live, attention-first inbox — what needs you first — and your OS notifies you the moment a machine finishes or fails.",
                  icon: "🔔"
                },
                {
                  title: "Your own private mesh",
                  desc: "Machines join over a mesh you host yourself — no account on someone else's network. Add a machine from a button; the cockpit wires the connection for you.",
                  icon: "🔒"
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
        <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)" }}>© 2026 MUSU. Your computers, as one.</span>
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
