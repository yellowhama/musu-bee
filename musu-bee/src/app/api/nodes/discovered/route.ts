import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function GET() {
  try {
    // V24-R7: canonical Rust path namespace /api/nodes/discovered (was
    // Python-era /api/admin/discovered). Handler not yet implemented in R1
    // Rust bridge — call will 404 against Rust :8070 until a later R-fast
    // step adds it. Empty-array fallback below keeps the UI graceful.
    const res = await fetch(`${bridgeUrl()}/api/nodes/discovered`, {
      headers: buildBridgeHeaders(await getBridgeToken()),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
