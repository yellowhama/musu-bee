/**
 * Catch-all proxy for musu-bridge API.
 * Forwards /api/bridge/<path> → BRIDGE_URL/api/<path>
 * Attaches MUSU_BRIDGE_TOKEN bearer auth automatically.
 *
 * The fetch/parse/503 machinery lives in `@/lib/bridge-proxy`; this route only
 * owns the catch-all path sanitization (the segment-wise traversal guard).
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToBridge } from "@/lib/bridge-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { path } = await ctx.params;
  // Sanitize each segment: reject any that contain '..' after URL decoding.
  for (const segment of path) {
    const decoded = decodeURIComponent(segment);
    if (decoded.includes("..") || decoded.includes("/")) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
  }
  // text mode + all query params pass through = the original catch-all contract.
  return proxyToBridge(req, { targetPath: `/api/${path.join("/")}`, parse: "text" });
}

export const GET = (req: NextRequest, ctx: RouteContext) => handle(req, ctx);
export const POST = (req: NextRequest, ctx: RouteContext) => handle(req, ctx);
export const PATCH = (req: NextRequest, ctx: RouteContext) => handle(req, ctx);
export const DELETE = (req: NextRequest, ctx: RouteContext) => handle(req, ctx);
export const PUT = (req: NextRequest, ctx: RouteContext) => handle(req, ctx);
