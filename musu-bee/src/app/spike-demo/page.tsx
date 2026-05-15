import type { Metadata } from "next";
import PublicSiteShell from "@/components/PublicSiteShell";
import SpikeDemoClient from "./SpikeDemoClient";

export const metadata: Metadata = {
  title: "MUSU P2P Spike Demo (V23.2)",
  description:
    "Internal V23.2 spike: connects a browser visitor to a local musu-relay-gateway through musu.pro signaling, runs one HTTP-over-DataChannel request, surfaces every signaling step for debugging.",
  robots: { index: false, follow: false },
};

export default function SpikeDemoPage() {
  const defaultSignalingUrl =
    process.env.NEXT_PUBLIC_MUSU_SIGNALING_URL ??
    "wss://signaling.musu.pro/signaling";

  return (
    <PublicSiteShell>
      <main
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "80px 24px 96px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "var(--musu-color-brand-accent)",
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          V23.2 SPIKE — INTERNAL
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800 }}>
          P2P signaling demo
        </h1>
        <p style={{ margin: "0 0 24px", color: "var(--musu-color-text-muted)" }}>
          End-to-end browser-side test of the V23 architecture: this page
          talks to musu.pro signaling as <code>role=&quot;visitor&quot;</code>,
          waits for the user&apos;s local <code>musu-relay-gateway</code> to
          join the same per-user room, completes the WebRTC handshake, and
          sends one HTTP-over-DataChannel request. Status of every step is
          surfaced below — page is not for end users and is excluded from
          search via <code>robots</code>.
        </p>

        <SpikeDemoClient defaultSignalingUrl={defaultSignalingUrl} />
      </main>
    </PublicSiteShell>
  );
}
