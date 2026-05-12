import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth-server";
import { listNodes } from "@/lib/nodes-server";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    const user = await getUser();

    if (!user) {
      redirect("/login?redirect=/dashboard");
    }

    const nodes = await listNodes();

    const consoleUser = {
      email: user.email || "user@local",
      displayName: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
      avatarUrl: (user.user_metadata?.avatar_url as string) || null,
    };

    return (
      <Suspense fallback={null}>
        <ConsoleShell user={consoleUser} nodes={nodes} activePanel="dashboard">
          <DashboardClient nodes={nodes} />
        </ConsoleShell>
      </Suspense>
    );
  } catch (error) {
    console.error("CRITICAL: DashboardPage error:", error);
    throw error; // Rethrow to show Next.js error page with logs in server console
  }
}
