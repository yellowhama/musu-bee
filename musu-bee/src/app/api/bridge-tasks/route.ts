import { NextRequest } from "next/server";

import { proxyToBridge } from "@/lib/bridge-proxy";

// Migrated onto the shared proxyToBridge helper (TS SDK phase 0).
// Behavior-preserving: json parse mode (original `res.json()` → malformed
// upstream → 503), forwards only the ALLOWED_PARAMS allowlist, no-store
// cache + "musu-bridge unavailable" 503 message are the helper defaults.
export const GET = (req: NextRequest) =>
  proxyToBridge(req, {
    targetPath: "/api/tasks",
    allowedParams: ["status", "limit", "before_id", "channel", "company_id"],
    parse: "json",
  });
