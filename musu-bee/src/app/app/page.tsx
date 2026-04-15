import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "MUSU App",
  description: "Chat-driven control plane for your machines and AI work.",
};

export default function AppPage() {
  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
