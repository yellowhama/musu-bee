import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_WORKER_URL = (
  process.env.MUSU_WORKER_URL ?? getBridgeUrl()
).trim().replace(/\/+$/, "");

const WORKER_TOKEN = process.env.MUSU_WORKER_TOKEN ?? "";

function workerUrl(deviceId: string | null): string {
  if (!deviceId || deviceId === "local") return DEFAULT_WORKER_URL;
  return `http://${deviceId}:9700`;
}

export interface ProcessStartRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  device_id?: string;
}

/** POST /api/processes/start
 * Body: { command, args?, cwd?, env?, device_id? }
 */
export async function POST(req: NextRequest) {
  let body: ProcessStartRequest;
  try {
    body = (await req.json()) as ProcessStartRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const deviceId = body.device_id ?? "local";
  const base = workerUrl(deviceId);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WORKER_TOKEN) headers["Authorization"] = `Bearer ${WORKER_TOKEN}`;

  try {
    const res = await fetch(`${base}/processes/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        command: body.command,
        args: body.args ?? [],
        cwd: body.cwd ?? null,
        env: body.env ?? {},
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `worker returned ${res.status}` }));
      return NextResponse.json({ error: (err as { detail?: string }).detail ?? String(err) }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
