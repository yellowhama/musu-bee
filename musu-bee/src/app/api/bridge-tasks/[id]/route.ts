import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { proxyToBridge } from "@/lib/bridge-proxy";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Migrated onto the shared proxyToBridge helper. Behavior-preserving:
// id validation stays in the route; json parse mode (`res.json()` → malformed
// upstream → 503), forwards NO query params (allowedParams: []), no-store cache
// and "musu-bridge unavailable" 503 message are helper defaults.
// NOTE: targetPath uses the raw `id` (NOT encodeURIComponent) to preserve the
// original contract exactly — the prior code built `/api/tasks/${id}` raw.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }
  return proxyToBridge(req, {
    targetPath: `/api/tasks/${id}`,
    allowedParams: [],
    parse: "json",
  });
}
