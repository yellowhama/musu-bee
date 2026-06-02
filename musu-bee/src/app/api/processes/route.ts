import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { requireOperator, resolveWorkerTarget } from "@/lib/operator-api-security";

/** Process info shape returned by musu-worker /processes */
export interface ProcessInfo {
  pid: number;
  name: string;
  cmdline: string;
  cpu_percent: number;
  memory_mb: number;
  status: string;
  started_at: string;
  username: string;
  /** Added by this proxy to identify which device the process belongs to */
  device_id: string;
}

const WORKER_TOKEN = process.env.MUSU_WORKER_TOKEN ?? "";
const FETCH_TIMEOUT_MS = 5_000;

function defaultWorkerUrl(): string {
  return (process.env.MUSU_WORKER_URL ?? getBridgeUrl()).trim().replace(/\/+$/, "");
}

async function fetchProcesses(
  baseUrl: string,
  nameFilter: string | null,
  deviceId: string,
): Promise<ProcessInfo[]> {
  try {
    const url = new URL(`${baseUrl}/processes`);
    if (nameFilter) url.searchParams.set("name", nameFilter);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WORKER_TOKEN) headers["Authorization"] = `Bearer ${WORKER_TOKEN}`;
    const res = await fetch(url.toString(), { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as ProcessInfo[];
    return data.map((p) => ({ ...p, device_id: deviceId }));
  } catch {
    return [];
  }
}

/** GET /api/processes?device_id=<ip|local>&name=<filter>
 *
 * Returns running processes from the specified device's musu-worker.
 * device_id="local" (or missing) → local worker
 * device_id=<ip>                 → worker at http://<ip>:9700
 */
export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("device_id") ?? "local";
  const nameFilter = searchParams.get("name");
  const target = resolveWorkerTarget(deviceId, defaultWorkerUrl());
  if (!target.ok) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }

  const processes = await fetchProcesses(target.baseUrl, nameFilter, target.deviceId);
  return NextResponse.json(processes);
}
