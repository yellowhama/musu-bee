"use client";

import { useState, useEffect } from "react";

export type ServiceStatus = "up" | "down" | "checking";

export interface ServiceHealth {
  port: ServiceStatus;    // musu-port :1355
  bridge: ServiceStatus;  // musu-bridge :8070
  worker: ServiceStatus;  // musu-worker :9700
}

const POLL_INTERVAL_MS = 5_000;

async function pingService(apiPath: string): Promise<ServiceStatus> {
  try {
    const res = await fetch(apiPath, { next: { revalidate: 0 } });
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

export function useServiceHealth(): ServiceHealth {
  const [health, setHealth] = useState<ServiceHealth>({
    port: "checking",
    bridge: "checking",
    worker: "checking",
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const [port, bridge, worker] = await Promise.all([
        pingService("/api/service-health?svc=port"),
        pingService("/api/service-health?svc=bridge"),
        pingService("/api/service-health?svc=worker"),
      ]);
      if (!cancelled) setHealth({ port, bridge, worker });
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return health;
}
