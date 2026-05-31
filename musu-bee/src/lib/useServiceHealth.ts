"use client";

import { useState, useEffect } from "react";

export type ServiceStatus = "up" | "down" | "checking";

export interface ServiceHealth {
  port: ServiceStatus;    // musu-port (via bridge proxy)
  bridge: ServiceStatus;  // musu-bridge (unified gateway)
  worker: ServiceStatus;  // musu-worker (via bridge proxy)
}

const POLL_INTERVAL_MS = 15_000;

async function pingService(apiPath: string): Promise<ServiceStatus> {
  try {
    const res = await fetch(apiPath, { next: { revalidate: 0 } });
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

  useEffect(() => {
    if (isEmbedded) return; // Skip polling in embed mode

    let cancelled = false;
    let inFlight = false;

    async function poll() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const [port, bridge, worker] = await Promise.all([
          pingService("/api/service-health?svc=port"),
          pingService("/api/service-health?svc=bridge"),
          pingService("/api/service-health?svc=worker"),
        ]);
        if (!cancelled) setHealth({ port, bridge, worker });
      } finally {
        inFlight = false;
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isEmbedded]);

  return health;
}
