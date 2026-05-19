import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = (
  process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070"
).replace(/\/+$/, "");

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    // V24-R7: canonical Rust path /api/nodes/add (was Python-era /api/admin/pair).
    const res = await fetch(`${BRIDGE_URL}/api/nodes/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
