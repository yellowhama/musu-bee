import { getBridgeUrl } from '../../../../../lib/bridge-config';
// V23.4 Phase 4 T2-D-mini — /api/workflows/[id]/status proxy (wiki/435 v2 §6.3).
// GET-only; called every 2s by RunPanel polling.
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!id || id.includes("/") || id.includes("..")) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const target = `${getBridgeUrl().replace(/\/+$/, "")}/api/workflows/${encodeURIComponent(id)}/status`;
    const token = await getBridgeToken();
    const res = await fetch(target, {
      headers: buildBridgeHeaders(token),
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
