import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";

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

const DEFAULT_WORKER_URL = (
  process.env.MUSU_WORKER_URL ?? getBridgeUrl()
).trim().replace(/\/+$/, "");

const WORKER_TOKEN = process.env.MUSU_WORKER_TOKEN ?? "";
const FETCH_TIMEOUT_MS = 5_000;

function workerUrl(deviceId: string | null): string {
  if (!deviceId || deviceId === "local") return DEFAULT_WORKER_URL;
  // deviceId is an IP or hostname — worker is always on port 9700
  return `http://${deviceId}:9700`;
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
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("device_id") ?? "local";
  const nameFilter = searchParams.get("name");

  const base = workerUrl(deviceId);
  const processes = await fetchProcesses(base, nameFilter, deviceId);
  return NextResponse.json(processes);
}
