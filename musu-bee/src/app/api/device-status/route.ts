import { NextResponse } from "next/server";

const MUSU_PORT_URL =
  process.env.MUSU_PORT_URL ?? "http://localhost:1355";

export async function GET() {
  try {
    const res = await fetch(`${MUSU_PORT_URL}/status`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `musu-port returned ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "musu-port unreachable" },
      { status: 503 }
    );
  }
}
