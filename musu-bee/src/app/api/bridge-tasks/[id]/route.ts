import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL =
  process.env.MUSU_BRIDGE_URL ?? process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:8070";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BRIDGE_URL}/api/tasks/${id}`, { method: "DELETE" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}
