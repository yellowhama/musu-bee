import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextResponse } from "next/server";

const BRIDGE_URL = (
  getBridgeUrl()
).replace(/\/+$/, "");

export async function GET() {
  try {
    // V24-R7: canonical Rust path /api/nodes (was Python-era /api/admin/nodes).
    const res = await fetch(`${BRIDGE_URL}/api/nodes`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
