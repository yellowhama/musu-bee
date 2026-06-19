import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import UseDesktopGate from "@/components/UseDesktopGate";
import { isWorkspaceUiEnabled } from "@/lib/workspaceUi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MUSU App",
  description: "Chat-driven control plane for your machines and AI work.",
};

export default async function AppPage() {
  // Web workspace SaaS surface is gated off by default (see lib/workspaceUi.ts).
  // When gated, show the "Use MUSU Desktop" card instead of mounting AppShell —
  // not mounting it is what stops the companies-401 / ceo-OFFLINE / PAPERCLIP
  // errors, which fire on AppShell mount independent of navigation.
  if (!isWorkspaceUiEnabled()) {
    return <UseDesktopGate />;
  }

  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
