import Link from "next/link";

export default function LandingPage() {
  return (
    <div style={{ background: "var(--musu-color-brand-canvas)", color: "var(--musu-color-brand-ink)", fontFamily: "'Inter', -apple-system, sans-serif", overflowX: "hidden" }}>

      {/* NAV */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 40px", borderBottom: `1px solid var(--musu-color-brand-stroke)`, position: "sticky", top: 0, background: "var(--musu-color-brand-canvas)", zIndex: 100 }}>
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.03em", display: "flex", alignItems: "center", gap: 6 }}><img src="/images/favicon-header.png" alt="MUSU" style={{ height: 20, width: "auto" }} /> musu</span>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <a href="#features" style={{ fontSize: 14, color: "var(--musu-color-brand-ink)", opacity: 0.6, textDecoration: "none" }}>Features</a>
          <a href="#pricing" style={{ fontSize: 14, color: "var(--musu-color-brand-ink)", opacity: 0.6, textDecoration: "none" }}>Pricing</a>
          <Link href="/app" style={{ fontSize: 14, fontWeight: 700, background: "var(--musu-color-brand-ink)", color: "var(--musu-color-brand-canvas)", padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>
            Get Started →
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 800, margin: "0 auto", padding: "96px 40px 80px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "var(--musu-color-brand-accent)", color: "var(--musu-color-brand-ink)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 999, marginBottom: 24 }}>
          Agent Runtime for Vibe Coders
        </div>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05, margin: "0 0 16px" }}>
          Your machines.<br />Your AI team.<br />One chat.
        </h1>
        <p style={{ fontSize: 16, opacity: 0.5, letterSpacing: "-0.01em", margin: "0 0 20px" }}>
          A work messenger where AIs across multiple machines work as a team
        </p>
        <p style={{ fontSize: 18, opacity: 0.65, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 40px" }}>
          4060Ti runs Claude. 5070Ti runs Qwen. If one machine goes down, another takes over.
          Tasks route to wherever there&apos;s GPU headroom.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/app" style={{ display: "inline-block", background: "var(--musu-color-brand-ink)", color: "var(--musu-color-brand-canvas)", fontWeight: 700, fontSize: 16, padding: "14px 32px", borderRadius: 10, textDecoration: "none" }}>
            Start for free
          </Link>
          <a href="#features" style={{ display: "inline-block", border: `2px solid var(--musu-color-brand-ink)`, color: "var(--musu-color-brand-ink)", fontWeight: 600, fontSize: 16, padding: "14px 32px", borderRadius: 10, textDecoration: "none", opacity: 0.7 }}>
            See how it works
          </a>
        </div>
        <div style={{ marginTop: 64, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {["🟢 musu-port :1355", "⚡ Claude CLI", "📡 live CPU/GPU/RAM", "🧠 wiki memory"].map((item) => (
            <span key={item} style={{ fontSize: 12, background: "var(--musu-color-brand-stroke)", padding: "4px 10px", borderRadius: 999, fontFamily: "monospace" }}>
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* PAIN */}
      <section style={{ background: "var(--musu-color-brand-ink)", color: "var(--musu-color-brand-canvas)", padding: "80px 40px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.5, marginBottom: 16 }}>Sound familiar?</p>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 40 }}>
            Three terminals open.<br />SSHing between machines.<br />Manually checking which GPU is free.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { e: "🔁", a: "Wait for inference to finish,", b: "then manually queue the next job" },
              { e: "💀", a: "One machine goes down,", b: "the task disappears with it" },
              { e: "📋", a: "You forget which AI", b: "you assigned what to" },
              { e: "🐌", a: "Migrating 4060Ti → 5070Ti", b: "is fully manual every time" },
            ].map((item) => (
              <div key={item.a} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "20px" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{item.e}</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.8 }}>{item.a}<br /><strong>{item.b}</strong></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "96px 40px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.4, marginBottom: 16, textAlign: "center" }}>What it does</p>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 56 }}>
            One runtime. Many machines.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {[
              { num: "01", title: "Many machines, one fleet", desc: "Doesn't matter where the machine is. MUSU routes automatically. One machine goes down, another takes over as Leader.", tags: ["musu-port :1355", "musu-connects QUIC"] },
              { num: "02", title: "Local AI, now an agent", desc: "Claude CLI, Codex CLI — already installed. MUSU runs them from chat. No cloud API. No per-token cost.", tags: ["Claude CLI", "Codex CLI", "child_process"] },
              { num: "03", title: "MCP interface", desc: "MUSU is an MCP server. Claude Code, Cursor, any MCP client can call MUSU tools directly.", tags: ["JSON-RPC 2.0", "musu_get_devices", "musu_search_wiki"] },
              { num: "04", title: "Resource orchestration", desc: "Real-time CPU/RAM/GPU collection. Tasks route to machines with GPU headroom. Inspect decisions with @route.", tags: ["@route gpu", "recommended_for", "handoff/route"] },
            ].map((feat) => (
              <div key={feat.num} style={{ border: `1px solid var(--musu-color-brand-stroke)`, borderRadius: 16, padding: "28px", background: "white" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--musu-color-brand-canvas)", background: "var(--musu-color-brand-ink)", borderRadius: 6, padding: "2px 8px", display: "inline-block", marginBottom: 16, letterSpacing: "0.05em" }}>
                  {feat.num}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.02em" }}>{feat.title}</h3>
                <p style={{ fontSize: 14, opacity: 0.65, lineHeight: 1.6, marginBottom: 16 }}>{feat.desc}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {feat.tags.map((tag) => (
                    <code key={tag} style={{ fontSize: 11, background: "var(--musu-color-brand-stroke)", padding: "2px 8px", borderRadius: 4 }}>{tag}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section style={{ background: "var(--musu-color-brand-stroke)", padding: "80px 40px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 48 }}>
            How it works
          </h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { t: "Type in chat", d: 'Send "refactor this code" to the ceo channel' },
              { t: "Routing", d: "MUSU picks the machine with GPU headroom and runs Claude CLI" },
              { t: "Response in chat", d: "Claude's reply appears in the channel, attributed by agent" },
            ].map((step, i) => (
              <div key={step.t} style={{ display: "flex", gap: 20, padding: "24px 0", borderBottom: i < 2 ? `1px solid var(--musu-color-brand-ink)20` : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--musu-color-brand-ink)", color: "var(--musu-color-brand-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{step.t}</div>
                  <div style={{ fontSize: 14, opacity: 0.65 }}>{step.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section style={{ padding: "80px 40px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 48 }}>
            Built, not vaporware
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
            {[
              { n: "40+", l: "musu-port endpoints" },
              { n: "live", l: "CPU/GPU/RAM telemetry" },
              { n: "$0", l: "cost to run local AI" },
              { n: "SQLite", l: "wiki + task storage" },
              { n: "QUIC", l: "P2P network base" },
              { n: "6", l: "MCP tools" },
            ].map((item) => (
              <div key={item.l} style={{ border: `1px solid var(--musu-color-brand-stroke)`, borderRadius: 12, padding: "20px 16px" }}>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>{item.n}</div>
                <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>{item.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ background: "var(--musu-color-brand-ink)", color: "var(--musu-color-brand-canvas)", padding: "80px 40px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 12 }}>Pricing</h2>
          <p style={{ opacity: 0.5, marginBottom: 48 }}>Local execution is free. Multi-machine sync needs Pro.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 520, margin: "0 auto" }}>
            <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "28px", textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Free</div>
              <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 4 }}>$0</div>
              <div style={{ opacity: 0.5, fontSize: 12, marginBottom: 20 }}>forever</div>
              {["1 machine", "Claude/Codex CLI", "wiki + tasks", "MCP server"].map((f) => (
                <div key={f} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", opacity: 0.75 }}>✓ {f}</div>
              ))}
            </div>
            <div style={{ border: `2px solid var(--musu-color-brand-accent)`, borderRadius: 16, padding: "28px", position: "relative", textAlign: "left" }}>
              <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--musu-color-brand-accent)", color: "var(--musu-color-brand-ink)", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>Recommended</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Pro</div>
              <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 4, color: "var(--musu-color-brand-accent)" }}>$14</div>
              <div style={{ opacity: 0.5, fontSize: 12, marginBottom: 20 }}>/ month</div>
              {["Unlimited machines", "P2P multi-machine sync", "Automatic Boss election", "Priority support"].map((f) => (
                <div key={f} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", opacity: 0.75 }}>✓ {f}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "96px 40px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 16 }}>
            Start in five minutes.
          </h2>
          <p style={{ opacity: 0.55, fontSize: 16, marginBottom: 40 }}>
            Run musu-port → open musu-bee → chat with Claude CLI
          </p>
          <Link href="/app" style={{ display: "inline-block", background: "var(--musu-color-brand-ink)", color: "var(--musu-color-brand-canvas)", fontWeight: 800, fontSize: 18, padding: "16px 40px", borderRadius: 12, textDecoration: "none" }}>
            Start for free →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid var(--musu-color-brand-stroke)`, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><img src="/images/favicon-header.png" alt="MUSU" style={{ height: 15, width: "auto" }} /> musu</span>
        <span style={{ fontSize: 12, opacity: 0.4 }}>© 2026 MUSU. Local AI orchestration.</span>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/app" style={{ fontSize: 12, opacity: 0.5, textDecoration: "none" }}>Open app</Link>
          <a href="#pricing" style={{ fontSize: 12, opacity: 0.5, textDecoration: "none" }}>Pricing</a>
        </div>
      </footer>
    </div>
  );
}
