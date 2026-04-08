import { NextResponse } from "next/server";

const MUSU_PORT_URL = (
  process.env.MUSU_PORT_URL ?? "http://localhost:1355"
).trim();

function toFiniteNumber(value: unknown, fallback: number): number {
  const n =
    typeof value === "number" ? value :
    typeof value === "string" ? Number(value) :
    NaN;
  return Number.isFinite(n) ? n : fallback;
}

function offlineFallback(reason: string) {
  return NextResponse.json({
    cpu: 0,
    gpu: null,
    ram: 0,
    status: "unreachable",
    device_id: "unknown-device",
    source: "offline-fallback",
    reason,
  });
}

export async function GET() {
  try {
    const statusRes = await fetch(`${MUSU_PORT_URL}/status`, {
      next: { revalidate: 0 },
    });

    // Preferred path: the richer /status contract.
    if (statusRes.ok) {
      const data = await statusRes.json();
      return NextResponse.json(data);
    }

    // Fallback path: some deployed portd builds expose only /health.
    const healthRes = await fetch(`${MUSU_PORT_URL}/health`, {
      next: { revalidate: 0 },
    });

    if (healthRes.ok) {
      const health = (await healthRes.json()) as Record<string, unknown>;
      return NextResponse.json({
        cpu: toFiniteNumber(health.cpu, 0),
        gpu: Number.isFinite(Number(health.gpu)) ? Number(health.gpu) : null,
        ram: toFiniteNumber(health.ram, 0),
        status: health.status ?? "ok",
        device_id: health.device_id ?? "unknown-device",
        source: "health-fallback",
      });
    }

    return offlineFallback(
      `status=${statusRes.status},health=${healthRes.status}`,
    );
  } catch {
    return offlineFallback("fetch_error");
  }
}
