"use client";

import { useState, useEffect, useRef } from "react";
import type { AgentsSurfaceSnapshot } from "@/types";

export interface UseAgentsSurfaceReturn {
  agentsSurface: AgentsSurfaceSnapshot | null;
}

const EMPTY_SUMMARY: AgentsSurfaceSnapshot["summary"] = {
  bossHost: null,
  lastHandoffTarget: null,
  handoffReasonCode: null,
  handoffRecordedAtMs: null,
  departments: [],
  statusCounts: {},
};

export function useAgentsSurface(onHandoff?: (newBoss: string) => void): UseAgentsSurfaceReturn {
  const [agentsSurface, setAgentsSurface] = useState<AgentsSurfaceSnapshot | null>(null);
  const prevBossHostRef = useRef<string | null>(null);
  const onHandoffRef = useRef(onHandoff);
  onHandoffRef.current = onHandoff;

  useEffect(() => {
    async function fetchAgentsSurface() {
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) {
          setAgentsSurface((prev) => ({
            fetchedAt: new Date().toISOString(),
            degraded: true,
            degradedReason: `agents_route_http_${res.status}`,
            stale: true,
            summary: prev?.summary ?? EMPTY_SUMMARY,
          }));
          return;
        }
        const payload = (await res.json()) as AgentsSurfaceSnapshot;
        setAgentsSurface(payload);
        // Detect boss handoff
        const newBoss = payload.summary?.bossHost ?? null;
        if (newBoss && prevBossHostRef.current !== null && prevBossHostRef.current !== newBoss) {
          onHandoffRef.current?.(newBoss);
        }
        prevBossHostRef.current = newBoss;
      } catch {
        setAgentsSurface((prev) => ({
          fetchedAt: new Date().toISOString(),
          degraded: true,
          degradedReason: "agents_route_fetch_error",
          stale: true,
          summary: prev?.summary ?? EMPTY_SUMMARY,
        }));
      }
    }

    fetchAgentsSurface();
    const id = setInterval(fetchAgentsSurface, 5000);
    return () => clearInterval(id);
  }, []);

  return { agentsSurface };
}
