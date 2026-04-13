import { MUSU_PORT_URL, MUSU_BRIDGE_URL, MUSU_WORKER_URL } from "../config";

export async function handleGetServiceHealth(): Promise<unknown> {
  const endpoints: Record<string, string> = {
    port: `${MUSU_PORT_URL}/health`,
    bridge: `${MUSU_BRIDGE_URL}/health`,
    worker: `${MUSU_WORKER_URL}/health`,
  };
  const results: Record<string, { status: string; latency_ms?: number }> = {};
  await Promise.allSettled(
    Object.entries(endpoints).map(async ([svc, url]) => {
      const start = Date.now();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        results[svc] = { status: res.ok ? "up" : "down", latency_ms: Date.now() - start };
      } catch {
        results[svc] = { status: "unreachable" };
      }
    })
  );
  return { services: results };
}
