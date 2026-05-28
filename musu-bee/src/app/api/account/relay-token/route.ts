import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-server";
import { getBridgeToken } from "@/lib/bridge-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const relayWsUrl =
    process.env.MUSU_RELAY_WS_URL ??
    process.env.NEXT_PUBLIC_MUSU_RELAY_WS_URL ??
    "";
  const token = process.env.MUSU_RELAY_TOKEN ?? await getBridgeToken();

  if (!relayWsUrl || !token) {
    return NextResponse.json({ error: "Relay is not configured" }, { status: 503 });
  }

  return NextResponse.json({
    relay_ws_url: relayWsUrl.replace(/\/+$/, ""),
    token,
  });
}
