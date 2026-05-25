import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const BRIDGE =
    getBridgeUrl();
  const token = process.env.MUSU_BRIDGE_TOKEN ?? "";

  const upstream = await fetch(`${BRIDGE}/api/tasks/events`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      Accept: "text/event-stream",
    },
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("SSE upstream error", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
