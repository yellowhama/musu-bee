// V23.4 Phase 4 T2-D-mini — /api/workflows proxy (wiki/435 v2 §6.1).
// Forwards GET (list) + POST (create) to musu-bridge.
// Migrated onto the shared proxyToBridge helper (TS SDK phase 0).
// Behavior-preserving: text parse mode (JSON-or-raw fallback, never 503 on
// malformed body), forwards ALL query params (no allowedParams), no-store
// cache + "musu-bridge unavailable" 503 message are the helper defaults.
// POST body is read+forwarded by the helper for non-GET/HEAD methods.
import { NextRequest } from "next/server";

import { proxyToBridge } from "@/lib/bridge-proxy";

export const GET = (req: NextRequest) =>
  proxyToBridge(req, { targetPath: "/api/workflows", parse: "text" });

export const POST = (req: NextRequest) =>
  proxyToBridge(req, { targetPath: "/api/workflows", parse: "text" });
