import { NextRequest } from "next/server";

import { proxyToBridge } from "@/lib/bridge-proxy";

// Migrated onto the shared proxyToBridge helper (TS SDK phase 0).
// Behavior-preserving: json parse mode (original `res.json()` → malformed
// upstream → 503), error message "bridge_unavailable", forwards NO query
// params (allowedParams: []). The {name} path param extraction +
// encodeURIComponent stays in the route; only fetch/parse goes through the
// helper. V24-R7: canonical Rust path namespace /api/nodes/{name}.
export const DELETE = (
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) =>
  params.then(({ name }) =>
    proxyToBridge(req, {
      targetPath: `/api/nodes/${encodeURIComponent(name)}`,
      allowedParams: [],
      parse: "json",
      errorMessage: "bridge_unavailable",
    })
  );
