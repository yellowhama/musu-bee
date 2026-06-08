import type { Metadata } from "next";
import { headers } from "next/headers";
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

function normalizeRequestHost(hostHeader: string | null): string {
  const raw = (hostHeader ?? "").trim().toLowerCase();
  if (!raw) return "";

  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end >= 0 ? raw.slice(1, end) : raw;
  }

  const firstColon = raw.indexOf(":");
  const lastColon = raw.lastIndexOf(":");
  if (firstColon === lastColon && firstColon >= 0) {
    return raw.slice(0, firstColon);
  }

  return raw;
}

function isLoopbackDashboardHost(hostHeader: string | null): boolean {
  const host = normalizeRequestHost(hostHeader);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("127.") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  );
}

export default async function AppPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isEmbedded = params.embed === "1";

  const subscription = await getSubscription();
  const isPaidTier = subscription.plan !== "free";
  const requestHeaders = await headers();
  const requestHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const isLocalDashboardRequest = isLoopbackDashboardHost(requestHost);

  if (false) {
    return (
      <div className="app-gate-outer">
        <div className="app-gate-card">
          <div className="app-gate-bee"><img src="/images/favicon-header.png" alt="MUSU" style={{ height: 40, width: "auto" }} /></div>
          <h1 className="app-gate-title">Use MUSU Desktop</h1>
          <p className="app-gate-body">
            MUSU work runs on the device where the desktop app is installed.
            <br />
            MUSU.PRO only connects to that local runtime and sends user input.
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
            <strong className="app-gate-footer-label">How to Use the Local Runtime</strong>
            Open the MUSU desktop app on the machine that should do the work, then
            <br />
            connect it from the MUSU.PRO workspace.
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
