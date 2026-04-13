import type { Metadata } from "next";
import { IBM_Plex_Sans, Sora } from "next/font/google";
import Link from "next/link";
import {
  EARLY_ACCESS_BENEFITS,
  ICP_CHIPS,
  INSTALL_COMMANDS,
} from "@/lib/publicSiteContent";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "MUSU Early Access",
  description:
    "Join MUSU early access to run a coordinated team of AI agents across your own machines.",
};

type LandingPageProps = {
  searchParams: Promise<{
    waitlist?: string;
  }>;
};

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const headingFont = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
});

const RUNTIME_ROWS = [
  {
    host: "4060Ti Builder Node",
    state: "ready",
    duty: "Patch generation + test loops",
  },
  {
    host: "5070Ti Dispatch Node",
    state: "busy",
    duty: "Long-context planning + orchestration",
  },
  {
    host: "Laptop Operator Node",
    state: "ready",
    duty: "QA replay + release evidence",
  },
] as const;

const PAIN_TO_SOLUTION = [
  {
    title: "Coordination tax",
    description:
      "Stop jumping between terminals, issue boards, and shell sessions to keep one lane moving.",
  },
  {
    title: "Permission drag",
    description:
      "Safe defaults keep destructive operations gated while normal execution stays fast.",
  },
  {
    title: "Proof gaps",
    description:
      "Every packet keeps owner, acceptance, and evidence in one control surface.",
  },
] as const;

const SURFACE_CARDS = [
  {
    title: "CLI + MCP is primary",
    body: "Route work, invoke agents, and read proof artifacts without leaving your operating context.",
    metric: "Low-latency control",
  },
  {
    title: "Web GUI keeps status visible",
    body: "Observe queue health, packet ownership, and blockers in real time when you are away from terminal view.",
    metric: "Executive visibility",
  },
] as const;

const SAFETY_POINTS = [
  "Destructive operations require explicit approval paths.",
  "Agent packets are rejected when acceptance criteria are weak.",
  "Proof-first execution: no evidence, no completion.",
] as const;

const REFERENCE_SIGNALS = ["Slack", "Front", "Missive", "Linear"] as const;

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const waitlistStatus = params.waitlist;

  return (
    <div className={`${styles.page} ${bodyFont.variable} ${headingFont.variable}`}>
      <header className={styles.topBar}>
        <Link href="/" className={`${styles.brand} ${headingFont.className}`}>
          MUSU
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/pricing" className={styles.navLink}>
            Pricing
          </Link>
          <Link href="/install" className={styles.navLink}>
            Install
          </Link>
          <Link href="/faq" className={styles.navLink}>
            FAQ
          </Link>
          <Link href="/app" className={styles.navButton}>
            Open App
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>MUSU · THE AGENT RUNTIME FOR VIBE CODERS</p>
            <h1 id="hero-title" className={`${styles.heroTitle} ${headingFont.className}`}>
              Run a team of AIs across your own computers.
            </h1>
            <p className={styles.heroLead}>
              One control plane. Chat or CLI. The work gets done without coordination drag.
            </p>

            <div className={styles.chipRow}>
              {ICP_CHIPS.map((chip) => (
                <span key={chip} className={styles.chip}>
                  {chip}
                </span>
              ))}
            </div>

            <form action="/api/waitlist?from=/landing-exp" method="post" className={styles.waitlistForm}>
              <label htmlFor="waitlist-email" className={styles.hiddenLabel}>
                Waitlist email
              </label>
              <input
                id="waitlist-email"
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                autoComplete="email"
                className={styles.waitlistInput}
              />
              <button type="submit" className={`${styles.primaryCta} ${headingFont.className}`}>
                Try MUSU Early Access
              </button>
              <Link href="#how-it-works" className={styles.secondaryCta}>
                Watch 90-sec demo
              </Link>
            </form>

            {waitlistStatus === "ok" ? (
              <p className={styles.okMessage}>You are on the list. We will send your access window soon.</p>
            ) : null}
            {waitlistStatus === "invalid_email" ? (
              <p className={styles.errorMessage}>That email looks invalid. Please check and submit again.</p>
            ) : null}
            {waitlistStatus === "error" ? (
              <p className={styles.errorMessage}>Waitlist is temporarily unavailable. Retry in a minute.</p>
            ) : null}

            <ul className={styles.benefitList}>
              {EARLY_ACCESS_BENEFITS.map((benefit) => (
                <li key={benefit} className={styles.benefitItem}>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.runtimeBoard}>
              <div className={styles.runtimeHeader}>
                <span className={styles.runtimeTitle}>Live Runtime Snapshot</span>
                <span className={styles.runtimeMeta}>control.musu</span>
              </div>
              <ul className={styles.runtimeRows}>
                {RUNTIME_ROWS.map((row) => (
                  <li key={row.host} className={styles.runtimeRow}>
                    <div>
                      <p className={styles.runtimeHost}>{row.host}</p>
                      <p className={styles.runtimeDuty}>{row.duty}</p>
                    </div>
                    <span className={`${styles.statePill} ${row.state === "busy" ? styles.stateBusy : styles.stateReady}`}>
                      {row.state}
                    </span>
                  </li>
                ))}
              </ul>
              <code className={styles.commandRow}>$ musu route --packet MUS-1636 --target 5070ti</code>
            </div>

            <div className={styles.heroAside}>
              <p className={styles.asideLabel}>Meaningful defaults</p>
              <h2 className={`${styles.asideTitle} ${headingFont.className}`}>Ship over deliberate, never reckless.</h2>
              <p className={styles.asideBody}>
                MUSU prioritizes safe autonomy: fast where possible, gated where needed.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.referenceStrip} aria-label="Reference signals">
          <span className={styles.referenceLead}>Reference signals analyzed</span>
          <div className={styles.referenceList}>
            {REFERENCE_SIGNALS.map((signal) => (
              <span key={signal} className={styles.referenceChip}>
                {signal}
              </span>
            ))}
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <header className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>Problem to solution</p>
            <h2 className={`${styles.sectionTitle} ${headingFont.className}`}>
              Multi-machine operations should feel like one focused team.
            </h2>
          </header>
          <div className={styles.cardGrid}>
            {PAIN_TO_SOLUTION.map((item) => (
              <article key={item.title} className={styles.infoCard}>
                <h3 className={`${styles.infoTitle} ${headingFont.className}`}>{item.title}</h3>
                <p className={styles.infoBody}>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className={styles.sectionBlock}>
          <header className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>How it works</p>
            <h2 className={`${styles.sectionTitle} ${headingFont.className}`}>
              Computers as departments. Agents as accountable operators.
            </h2>
          </header>
          <div className={styles.installGrid}>
            {INSTALL_COMMANDS.map((item) => (
              <article key={item.platform} className={styles.installCard}>
                <p className={styles.installPlatform}>{item.platform}</p>
                <h3 className={`${styles.installTitle} ${headingFont.className}`}>{item.label}</h3>
                <p className={styles.installStatus}>{item.status}</p>
                <p className={styles.installBody}>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <header className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>Core surfaces</p>
            <h2 className={`${styles.sectionTitle} ${headingFont.className}`}>
              Operate from CLI when deep, switch to web when coordinating.
            </h2>
          </header>
          <div className={styles.surfaceGrid}>
            {SURFACE_CARDS.map((card) => (
              <article key={card.title} className={styles.surfaceCard}>
                <p className={styles.surfaceMetric}>{card.metric}</p>
                <h3 className={`${styles.surfaceTitle} ${headingFont.className}`}>{card.title}</h3>
                <p className={styles.surfaceBody}>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.safetyBlock}>
          <div>
            <p className={styles.sectionEyebrow}>Safety and autonomy</p>
            <h2 className={`${styles.sectionTitle} ${headingFont.className}`}>
              Autonomy where safe. Deliberation where it matters.
            </h2>
          </div>
          <ul className={styles.safetyList}>
            {SAFETY_POINTS.map((point) => (
              <li key={point} className={styles.safetyItem}>
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.finalCta}>
          <h2 className={`${styles.finalTitle} ${headingFont.className}`}>
            Coordinate your AI workforce before scale becomes chaos.
          </h2>
          <div className={styles.finalActions}>
            <Link href="/landing" className={`${styles.primaryCta} ${styles.primaryCtaLink} ${headingFont.className}`}>
              Join early access
            </Link>
            <Link href="/install" className={styles.secondaryCta}>
              Review install shape
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
