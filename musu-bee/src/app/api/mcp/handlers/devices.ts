import { getMusuPortUrl } from "../config";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

export async function handleGetDevices(): Promise<unknown> {
  try {
    const res = await fetch(`${getMusuPortUrl()}/status`, {
      headers: buildBridgeHeaders(await getBridgeToken()),
      next: { revalidate: 0 },
    });
    if (!res.ok) return { error: `musu_port_http_${res.status}`, devices: [] };
    const data = (await res.json()) as Record<string, unknown>;
    return {
      devices: [
        {
          device_id: data.device_id ?? "local",
          cpu: data.cpu,
          gpu: data.gpu ?? null,
          ram: data.ram,
          status: data.status ?? "ok",
          recommended_for: data.recommended_for ?? [],
        },
      ],
    };
  } catch {
    return { error: "musu_port_unreachable", devices: [] };
  }
}
