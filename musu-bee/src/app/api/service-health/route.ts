import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";

function services(): Record<string, string> {
  const bridgeUrl = (getBridgeUrl()).trim().replace(/\/+$/, "");
  return {
    port: (process.env.MUSU_PORT_URL ?? bridgeUrl).trim().replace(/\/+$/, "") + "/health",
    bridge: bridgeUrl + "/health",
    worker: (process.env.MUSU_WORKER_URL ?? bridgeUrl + "/worker").trim().replace(/\/+$/, "") + "/health",
  };
}

export async function GET(req: NextRequest) {
  const svc = new URL(req.url).searchParams.get("svc");
  const endpoints = services();
  if (!svc || !(svc in endpoints)) {
    return NextResponse.json({ error: "unknown service" }, { status: 400 });
  }

  try {
    const res = await fetch(endpoints[svc], {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(2_000),
    });
    const data = res.ok ? (await res.json().catch(() => ({}))) : {};
    return NextResponse.json({ ok: res.ok, status: res.status, ...data }, {
      status: res.ok ? 200 : 502,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
  }
}
