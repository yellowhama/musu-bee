import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = (
  process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070"
).replace(/\/+$/, "");

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    const res = await fetch(`${BRIDGE_URL}/api/admin/nodes/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
