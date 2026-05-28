import { getBridgeUrl } from '../../../../lib/bridge-config';
// V23.4 Phase 4 T2-D-mini — /api/workflows/[id] proxy (wiki/435 v2 §6.2).
// GET single + PATCH status + DELETE.
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

type Ctx = { params: Promise<{ id: string }> };

async function proxy(
  req: NextRequest,
  ctx: Ctx,
  method: "GET" | "PATCH" | "DELETE"
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!id || id.includes("/") || id.includes("..")) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const target = new URL(`${getBridgeUrl().replace(/\/+$/, "")}/api/workflows/${encodeURIComponent(id)}`);
    const body = method === "PATCH" ? await req.text() : undefined;
    const token = await getBridgeToken();
    const res = await fetch(target.toString(), {
      method,
      headers: buildBridgeHeaders(token),
      body,
      cache: "no-store",
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
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

export const GET = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, "GET");
export const PATCH = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, "PATCH");
export const DELETE = (req: NextRequest, ctx: Ctx) => proxy(req, ctx, "DELETE");
