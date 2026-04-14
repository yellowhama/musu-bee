import { NextResponse } from "next/server";

const BRIDGE_URL = (
  process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070"
).replace(/\/+$/, "");

export async function GET() {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/admin/discovered`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
