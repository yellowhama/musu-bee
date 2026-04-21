import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { getSubscription } from "@/lib/subscription";

export const metadata: Metadata = {
  title: "MUSU App",
  description: "Chat-driven control plane for your machines and AI work.",
};

export default async function AppPage() {
  const subscription = await getSubscription();
  const isPaidTier = subscription.plan !== "free";

  if (!isPaidTier) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0a",
          color: "#f3f4f6",
          fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            background: "#111",
            border: "1px solid #1f1f1f",
            borderRadius: 20,
            padding: "48px 40px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 24 }}>🐝</div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 16,
              color: "#f3f4f6",
            }}
          >
            Dashboard is Local-Only
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "#9ca3af",
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            The MUSU dashboard is currently only available in local environments.
            <br />
            Cloud dashboard access is available on Pro plans and above.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <a
              href="/pro#pricing"
              style={{
                display: "inline-block",
                background: "var(--musu-color-brand-accent)",
                color: "#0a0a0a",
                fontWeight: 700,
                fontSize: 15,
                padding: "14px 32px",
                borderRadius: 12,
                textDecoration: "none",
                letterSpacing: "-0.01em",
              }}
            >
              View Pro Plan →
            </a>
            <a
              href="/"
              style={{
                display: "inline-block",
                background: "transparent",
                color: "#6b7280",
                fontWeight: 600,
                fontSize: 14,
                padding: "12px 32px",
                borderRadius: 12,
                textDecoration: "none",
                border: "1px solid #2d2d2d",
                letterSpacing: "-0.01em",
              }}
            >
              Back to Home
            </a>
          </div>
          <div
            style={{
              marginTop: 40,
              paddingTop: 32,
              borderTop: "1px solid #1f1f1f",
              fontSize: 13,
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#9ca3af", display: "block", marginBottom: 8 }}>
              How to Use the Local Dashboard
            </strong>
            Run <code style={{ background: "#1a1a1a", padding: "2px 8px", borderRadius: 4, color: "var(--musu-color-brand-accent)" }}>musu start</code> in your terminal, then
            <br />
            visit <code style={{ background: "#1a1a1a", padding: "2px 8px", borderRadius: 4, color: "var(--musu-color-brand-accent)" }}>http://localhost:3001/app</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
