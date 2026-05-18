// V23.4 T2-C — Legacy /dashboard → /fleet redirect stub.
// Per wiki/434 §2.6 (OQ-CRIT-3 dual specification). Server-side 307 redirect;
// middleware (§2.7) already serves 301 for clients that respect it.
//
// Original ~37-LOC server-component body removed: now an orphan import sink
// (DashboardClient + listNodes + getUser); those continue to compile but are
// not exercised here. Cleanup deferred to V23.5 (OQ-A1 / Auditor A-2).

import { redirect } from "next/navigation";

export default function DashboardRedirect() {
  redirect("/fleet");
}
