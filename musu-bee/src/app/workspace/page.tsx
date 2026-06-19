import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import UseDesktopGate from "@/components/UseDesktopGate";
import { isWorkspaceUiEnabled } from "@/lib/workspaceUi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MUSU Workspace",
  description: "Active work execution surface for MUSU.",
};

export default function WorkspacePage() {
  // Mirror the /app gate: the web workspace SaaS surface is gated off by default
  // (see lib/workspaceUi.ts). Both routes mount AppShell, so both must gate, or
  // a direct /workspace deep-link bypasses the gate.
  if (!isWorkspaceUiEnabled()) {
    return <UseDesktopGate />;
  }

  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
