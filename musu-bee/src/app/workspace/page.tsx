import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MUSU Workspace",
  description: "Active work execution surface for MUSU.",
};

export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
