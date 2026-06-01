"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentsSurfaceSnapshot } from "@/types";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

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
const AGENTS_SURFACE_REFRESH_VISIBLE_MS = 30_000;
const AGENTS_SURFACE_REFRESH_HIDDEN_MS = 120_000;

export function useAgentsSurface(onHandoff?: (newBoss: string) => void): UseAgentsSurfaceReturn {
  const [agentsSurface, setAgentsSurface] = useState<AgentsSurfaceSnapshot | null>(null);
  const prevBossHostRef = useRef<string | null>(null);
  const onHandoffRef = useRef(onHandoff);
  onHandoffRef.current = onHandoff;

  const fetchAgentsSurface = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/agents", { signal });
      if (!res.ok) {
        if (!signal.aborted) setAgentsSurface((prev) => ({
          fetchedAt: new Date().toISOString(),
          degraded: true,
          degradedReason: `agents_route_http_${res.status}`,
          stale: true,
          summary: prev?.summary ?? EMPTY_SUMMARY,
        }));
        return;
      }
      const payload = (await res.json()) as AgentsSurfaceSnapshot;
      if (signal.aborted) return;
      setAgentsSurface(payload);
      // Detect boss handoff.
      const newBoss = payload.summary?.bossHost ?? null;
      if (newBoss && prevBossHostRef.current !== null && prevBossHostRef.current !== newBoss) {
        onHandoffRef.current?.(newBoss);
      }
      prevBossHostRef.current = newBoss;
    } catch {
      if (!signal.aborted) setAgentsSurface((prev) => ({
        fetchedAt: new Date().toISOString(),
        degraded: true,
        degradedReason: "agents_route_fetch_error",
        stale: true,
        summary: prev?.summary ?? EMPTY_SUMMARY,
      }));
    }
  }, []);

  useLowDutyPolling(fetchAgentsSurface, {
    intervalMs: AGENTS_SURFACE_REFRESH_VISIBLE_MS,
    maxBackoffMs: AGENTS_SURFACE_REFRESH_HIDDEN_MS,
  });

  return { agentsSurface };
}
