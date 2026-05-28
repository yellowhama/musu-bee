import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    // V24-R7: canonical Rust path /api/nodes/add (was Python-era /api/admin/pair).
    const res = await fetch(`${bridgeUrl()}/api/nodes/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildBridgeHeaders(await getBridgeToken()),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
