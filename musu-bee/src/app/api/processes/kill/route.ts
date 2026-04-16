import { NextRequest, NextResponse } from "next/server";

const DEFAULT_WORKER_URL = (
  process.env.MUSU_WORKER_URL ?? "http://localhost:9700"
).replace(/\/+$/, "");

const WORKER_TOKEN = process.env.MUSU_WORKER_TOKEN ?? "";

function workerUrl(deviceId: string | null): string {
  if (!deviceId || deviceId === "local") return DEFAULT_WORKER_URL;
  return `http://${deviceId}:9700`;
}

/** POST /api/processes/kill?pid=<pid>&device_id=<ip|local>&force=<bool> */
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pid = searchParams.get("pid");
  const deviceId = searchParams.get("device_id") ?? "local";
  const force = searchParams.get("force") === "true";

  if (!pid || isNaN(Number(pid))) {
    return NextResponse.json({ error: "pid is required" }, { status: 400 });
  }

  const base = workerUrl(deviceId);
  const url = new URL(`${base}/processes/${pid}/kill`);
  if (force) url.searchParams.set("force", "true");

  const headers: Record<string, string> = {};
  if (WORKER_TOKEN) headers["Authorization"] = `Bearer ${WORKER_TOKEN}`;

  try {
    const res = await fetch(url.toString(), { method: "POST", headers });
    if (res.status === 404) {
      return NextResponse.json({ error: `process ${pid} not found` }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `worker returned ${res.status}` }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
