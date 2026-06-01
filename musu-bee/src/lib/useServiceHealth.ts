"use client";

import { useState } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

export type ServiceStatus = "up" | "down" | "checking";

export interface ServiceHealth {
  port: ServiceStatus;    // musu-port (via bridge proxy)
  bridge: ServiceStatus;  // musu-bridge (unified gateway)
  worker: ServiceStatus;  // musu-worker (via bridge proxy)
}

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 5_000;

async function pingService(apiPath: string, signal: AbortSignal): Promise<ServiceStatus> {
  try {
    const res = await fetch(apiPath, { next: { revalidate: 0 }, signal });
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

export function useServiceHealth(): ServiceHealth {
  // In embed mode (iframe from musu.pro), skip health polling — services are on localhost
  const isEmbedded = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embed") === "1";

  const [health, setHealth] = useState<ServiceHealth>({
    port: isEmbedded ? "up" : "checking",
    bridge: isEmbedded ? "up" : "checking",
    worker: isEmbedded ? "up" : "checking",
  });

  useLowDutyPolling(
    async (signal) => {
        const [port, bridge, worker] = await Promise.all([
          pingService("/api/service-health?svc=port", signal),
          pingService("/api/service-health?svc=bridge", signal),
          pingService("/api/service-health?svc=worker", signal),
        ]);
        if (!signal.aborted) setHealth({ port, bridge, worker });
    },
    { enabled: !isEmbedded, intervalMs: POLL_INTERVAL_MS, taskTimeoutMs: POLL_TIMEOUT_MS },
  );

  return health;
}
