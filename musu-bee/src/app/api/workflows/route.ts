import { getBridgeUrl } from '../../../lib/bridge-config';
// V23.4 Phase 4 T2-D-mini — /api/workflows proxy (wiki/435 v2 §6.1).
// Forwards GET (list) + POST (create) to musu-bridge.
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

async function proxy(req: NextRequest, method: "GET" | "POST"): Promise<NextResponse> {
  try {
    const target = new URL(`${getBridgeUrl().replace(/\/+$/, "")}/api/workflows`);
    req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const body = method === "POST" ? await req.text() : undefined;
    const token = await getBridgeToken();
    const res = await fetch(target.toString(), {
      method,
      headers: buildBridgeHeaders(token),
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

export const GET = (req: NextRequest) => proxy(req, "GET");
export const POST = (req: NextRequest) => proxy(req, "POST");
