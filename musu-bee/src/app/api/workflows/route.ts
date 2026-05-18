// V23.4 Phase 4 T2-D-mini — /api/workflows proxy (wiki/435 v2 §6.1).
// Forwards GET (list) + POST (create) to musu-bridge.
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";

const BRIDGE_URL =
  process.env.MUSU_BRIDGE_URL ?? process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:8070";

async function proxy(req: NextRequest, method: "GET" | "POST"): Promise<NextResponse> {
  try {
    const target = new URL(`${BRIDGE_URL}/api/workflows`);
    req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const body = method === "POST" ? await req.text() : undefined;
    const res = await fetch(target.toString(), {
      method,
      headers: buildBridgeHeaders(process.env.MUSU_BRIDGE_TOKEN ?? ""),
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
