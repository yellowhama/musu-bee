import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL =
  process.env.MUSU_BRIDGE_URL ?? process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:8070";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(`${BRIDGE_URL}/api/tasks`);
    req.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}
