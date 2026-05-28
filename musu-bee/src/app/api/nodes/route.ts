import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function GET() {
  try {
    // V24-R7: canonical Rust path /api/nodes (was Python-era /api/admin/nodes).
    const res = await fetch(`${bridgeUrl()}/api/nodes`, {
      headers: buildBridgeHeaders(await getBridgeToken()),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
