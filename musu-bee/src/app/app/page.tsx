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
      <div className="app-gate-outer">
        <div className="app-gate-card">
          <div className="app-gate-bee">🐝</div>
          <h1 className="app-gate-title">Dashboard is Local-Only</h1>
          <p className="app-gate-body">
            The MUSU dashboard is currently only available in local environments.
            <br />
            Cloud dashboard access is available on Pro plans and above.
          </p>
          <div className="app-gate-actions">
            <a href="/pro#pricing" className="btn btn-primary app-gate-btn">
              View Pro Plan →
            </a>
            <a href="/" className="btn btn-ghost app-gate-btn">
              Back to Home
            </a>
          </div>
          <div className="app-gate-footer">
            <strong className="app-gate-footer-label">How to Use the Local Dashboard</strong>
            Run <code className="mono app-gate-code">musu start</code> in your terminal, then
            <br />
            visit <code className="mono app-gate-code">http://localhost:3001/app</code>
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
