import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL =
  process.env.MUSU_BRIDGE_URL ?? process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:8070";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }
  try {
    const res = await fetch(`${BRIDGE_URL}/api/tasks/${id}`, { method: "DELETE" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}
