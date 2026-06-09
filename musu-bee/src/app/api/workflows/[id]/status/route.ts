// V23.4 Phase 4 T2-D-mini — /api/workflows/[id]/status proxy (wiki/435 v2 §6.3).
// GET-only; called every 2s by RunPanel polling. Migrated onto the shared
// proxyToBridge helper. Behavior-preserving: id validation stays in the route;
// text parse mode (JSON-or-raw fallback), no-store cache, and the
// "musu-bridge unavailable" 503 message are helper defaults. No 204 special-case.
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { proxyToBridge } from "@/lib/bridge-proxy";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!id || id.includes("/") || id.includes("..")) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  return proxyToBridge(req, {
    targetPath: `/api/workflows/${encodeURIComponent(id)}/status`,
    parse: "text",
  });
}
