import { NextRequest } from "next/server";

import { proxyToBridge } from "@/lib/bridge-proxy";

// V24-R7: canonical Rust path /api/nodes (was Python-era /api/admin/nodes).
// json parse mode = the original `res.json()` contract (malformed → 503).
// allowedParams: [] preserves the original behavior of forwarding NO query
// params (the prior GET() ignored the request query entirely).
export const GET = (req: NextRequest) =>
  proxyToBridge(req, {
    targetPath: "/api/nodes",
    parse: "json",
    allowedParams: [],
    errorMessage: "bridge_unavailable",
  });
