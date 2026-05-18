// V23.4 T2-C — Legacy /app/dashboard → /fleet redirect stub.
// Per wiki/434 §2.6 (OQ-CRIT-3 dual specification). Server-side 307 redirect.
//
// Original ~225-LOC `"use client"` component body removed entirely per
// Critic C-T2C-2 + Builder MUST-do: no `"use client"`, no React hooks,
// no client-side imports — bare server-component stub. Cleanup deferred
// to V23.5 (OQ-A1 / Auditor A-2).

import { redirect } from "next/navigation";

export default function AppDashboardRedirect() {
  redirect("/fleet");
}
