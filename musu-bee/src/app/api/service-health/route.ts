import { NextRequest, NextResponse } from "next/server";

const SERVICES: Record<string, string> = {
  port:   (process.env.MUSU_PORT_URL   ?? "http://localhost:1355").trim().replace(/\/+$/, "") + "/health",
  bridge: (process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070").trim().replace(/\/+$/, "") + "/health",
  worker: (process.env.MUSU_WORKER_URL ?? "http://localhost:9700").trim().replace(/\/+$/, "") + "/health",
};

export async function GET(req: NextRequest) {
  const svc = new URL(req.url).searchParams.get("svc");
  if (!svc || !(svc in SERVICES)) {
    return NextResponse.json({ error: "unknown service" }, { status: 400 });
  }

  try {
    const res = await fetch(SERVICES[svc], {
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
