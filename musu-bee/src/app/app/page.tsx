import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { getSubscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MUSU App",
  description: "Chat-driven control plane for your machines and AI work.",
};

type PageProps = { searchParams: Promise<{ embed?: string }> };

export default async function AppPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isEmbedded = params.embed === "1";

  const subscription = await getSubscription();
  const isPaidTier = subscription.plan !== "free";

  if (!isPaidTier && !isEmbedded) {
    return (
      <div className="app-gate-outer">
        <div className="app-gate-card">
          <div className="app-gate-bee"><img src="/images/favicon-header.png" alt="MUSU" style={{ height: 40, width: "auto" }} /></div>
          <h1 className="app-gate-title">Dashboard is Local-Only</h1>
          <p className="app-gate-body">
            The MUSU dashboard is currently only available in local environments.
            <br />
            Cloud dashboard access is available on Pro plans and above.
          </p>
          <div className="app-gate-actions">
            <Link href="/pro#pricing" className="btn btn-primary app-gate-btn">
              View Pro Plan →
            </Link>
            <Link href="/" className="btn btn-ghost app-gate-btn">
              Back to Home
            </Link>
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
