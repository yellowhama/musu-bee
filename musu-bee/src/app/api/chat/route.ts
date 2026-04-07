import { NextRequest, NextResponse } from "next/server";

const MUSU_PORT_URL = process.env.MUSU_PORT_URL ?? "http://localhost:1355";

export async function POST(req: NextRequest) {
  try {
    const { message } = (await req.json()) as { message: string };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const res = await fetch(`${MUSU_PORT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = (await res.json()) as { text?: string; error?: string };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error ?? `musu-port error ${res.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
