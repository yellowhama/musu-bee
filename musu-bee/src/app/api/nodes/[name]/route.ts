import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = (
  getBridgeUrl()
).replace(/\/+$/, "");

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    // V24-R7: canonical Rust path namespace /api/nodes/{name} (was Python-era
    // /api/admin/nodes/{name}). DELETE handler not yet implemented in R1
    // Rust bridge — call will 404 against Rust :8070 until a later R-fast step
    // adds it; behaviour matches Python-bridge legacy path layout otherwise.
    const res = await fetch(`${BRIDGE_URL}/api/nodes/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
