/**
 * SSE stream proxy for musu-bridge dispatch run events.
 *
 * The generic /api/bridge/[...path] proxy buffers the response body and
 * JSON-parses it, which breaks streaming. This route forwards the
 * fetch's ReadableStream directly so SSE frames reach the browser as
 * they're emitted by the bridge.
 */
import { NextRequest } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";

import { getBridgeUrl } from "@/lib/bridge-config";

const BRIDGE_URL = getBridgeUrl();

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { runId } = await ctx.params;
  // Light validation — runIds are uuid4 hex (32 chars) in our schema.
  if (!/^[A-Za-z0-9_\-]+$/.test(runId)) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", detail: "invalid runId" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const target = `${BRIDGE_URL}/api/dispatch/runs/${runId}/stream`;
  const token = process.env.MUSU_BRIDGE_TOKEN ?? "";
  const headers = {
    ...buildBridgeHeaders(token),
    Accept: "text/event-stream",
  };

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers,
      cache: "no-store",
      // Important: do not let undici buffer; rely on streaming.
    });
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", detail: "musu-bridge unreachable" })}\n\n`,
      { status: 503, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  if (!upstream.body) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", detail: "no upstream body" })}\n\n`,
      { status: 502, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
