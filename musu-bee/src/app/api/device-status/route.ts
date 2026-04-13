import { NextResponse } from "next/server";
import { z } from "zod";

const PortStatusSchema = z.object({
  cpu: z.number().optional(),
  gpu: z.number().nullable().optional(),
  ram: z.number().optional(),
  device_id: z.string().optional(),
  status: z.string().optional(),
  recommended_for: z.array(z.string()).optional(),
}).passthrough();

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

function computeRecommendedFor(cpu: number, gpu: number | null, ram: number): string[] {
  const tags: string[] = [];
  if (gpu !== null && gpu < 60) tags.push("llm", "compute");
  if (cpu < 40) tags.push("general");
  if (ram < 60) tags.push("memory");
  return tags.length > 0 ? [...new Set(tags)] : ["general"];
}

function offlineFallback(reason: string) {
  return NextResponse.json({
    cpu: 0,
    gpu: null,
    ram: 0,
    status: "unreachable",
    device_id: "unknown-device",
    source: "offline-fallback",
    recommended_for: [],
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
      const parsed = PortStatusSchema.safeParse(await statusRes.json());
      if (!parsed.success) return offlineFallback("invalid_status_response");
      const data = parsed.data;
      const cpu = toFiniteNumber(data.cpu, 0);
      const gpu = Number.isFinite(Number(data.gpu)) ? Number(data.gpu) : null;
      const ram = toFiniteNumber(data.ram, 0);
      return NextResponse.json({ ...data, recommended_for: computeRecommendedFor(cpu, gpu, ram) });
    }

    // Fallback path: some deployed portd builds expose only /health.
    const healthRes = await fetch(`${MUSU_PORT_URL}/health`, {
      next: { revalidate: 0 },
    });

    if (healthRes.ok) {
      const healthParsed = PortStatusSchema.safeParse(await healthRes.json());
      if (!healthParsed.success) return offlineFallback("invalid_health_response");
      const health = healthParsed.data;
      const cpu = toFiniteNumber(health.cpu, 0);
      const gpu = Number.isFinite(Number(health.gpu)) ? Number(health.gpu) : null;
      const ram = toFiniteNumber(health.ram, 0);
      return NextResponse.json({
        cpu,
        gpu,
        ram,
        status: health.status ?? "ok",
        device_id: health.device_id ?? "unknown-device",
        source: "health-fallback",
        recommended_for: computeRecommendedFor(cpu, gpu, ram),
      });
    }

    return offlineFallback(
      `status=${statusRes.status},health=${healthRes.status}`,
    );
  } catch {
    return offlineFallback("fetch_error");
  }
}
