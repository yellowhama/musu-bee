/**
 * Catch-all proxy for musu-bridge API.
 * Forwards /api/bridge/<path> → BRIDGE_URL/api/<path>
 * Attaches MUSU_BRIDGE_TOKEN bearer auth automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";

const BRIDGE_URL =
  process.env.MUSU_BRIDGE_URL ?? process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:8070";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyToBridge(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { path } = await ctx.params;
    // Sanitize each segment: reject any that contain '..' after URL decoding
    for (const segment of path) {
      const decoded = decodeURIComponent(segment);
      if (decoded.includes("..") || decoded.includes("/")) {
        return NextResponse.json({ error: "invalid path" }, { status: 400 });
      }
    }
    const bridgePath = path.join("/");
    const target = new URL(`${BRIDGE_URL}/api/${bridgePath}`);
    // Guard: ensure final URL stays within the expected API scope
    if (!target.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }

    // Forward query string
    req.nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.set(key, value);
    });

    const token = process.env.MUSU_BRIDGE_TOKEN ?? "";
    const headers = buildBridgeHeaders(token);

    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.text()
        : undefined;

    const res = await fetch(target.toString(), {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const data = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = data;
    }

    return NextResponse.json(parsed, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}

export const GET = (req: NextRequest, ctx: RouteContext) => proxyToBridge(req, ctx);
export const POST = (req: NextRequest, ctx: RouteContext) => proxyToBridge(req, ctx);
export const PATCH = (req: NextRequest, ctx: RouteContext) => proxyToBridge(req, ctx);
export const DELETE = (req: NextRequest, ctx: RouteContext) => proxyToBridge(req, ctx);
export const PUT = (req: NextRequest, ctx: RouteContext) => proxyToBridge(req, ctx);
