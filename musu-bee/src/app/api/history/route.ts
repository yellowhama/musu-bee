import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";

const MUSU_BRIDGE_URL = (
  getBridgeUrl()
).trim();

export interface HistoryMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  agent_id: string | null;
  created_at: string;
  meta: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get("session_id");
  const limit = searchParams.get("limit") ?? "50";
  const beforeId = searchParams.get("before_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const upstream = new URL(`${MUSU_BRIDGE_URL}/api/messages`);
  upstream.searchParams.set("session_id", sessionId);
  upstream.searchParams.set("limit", limit);
  if (beforeId) upstream.searchParams.set("before_id", beforeId);

  try {
    const res = await fetch(upstream.toString(), {
      headers: { "Content-Type": "application/json" },
      // No cache — always fresh for chat history
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `bridge error ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as HistoryMessage[];
    return NextResponse.json(data);
  } catch {
    // musu-bridge not running — return empty history gracefully
    return NextResponse.json([]);
  }
}
