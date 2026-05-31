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
const AGENTS_SURFACE_REFRESH_VISIBLE_MS = 30_000;
const AGENTS_SURFACE_REFRESH_HIDDEN_MS = 120_000;

export function useAgentsSurface(onHandoff?: (newBoss: string) => void): UseAgentsSurfaceReturn {
  const [agentsSurface, setAgentsSurface] = useState<AgentsSurfaceSnapshot | null>(null);
  const prevBossHostRef = useRef<string | null>(null);
  const onHandoffRef = useRef(onHandoff);
  onHandoffRef.current = onHandoff;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const refreshDelay = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? AGENTS_SURFACE_REFRESH_HIDDEN_MS
        : AGENTS_SURFACE_REFRESH_VISIBLE_MS;

    const schedule = () => {
      if (cancelled) return;
      clearTimer();
      timer = setTimeout(() => {
        void fetchAgentsSurface();
      }, refreshDelay());
    };

    async function fetchAgentsSurface() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) {
          if (!cancelled) setAgentsSurface((prev) => ({
            fetchedAt: new Date().toISOString(),
            degraded: true,
            degradedReason: `agents_route_http_${res.status}`,
            stale: true,
            summary: prev?.summary ?? EMPTY_SUMMARY,
          }));
          return;
        }
        const payload = (await res.json()) as AgentsSurfaceSnapshot;
        if (!cancelled) {
          setAgentsSurface(payload);
          // Detect boss handoff
          const newBoss = payload.summary?.bossHost ?? null;
          if (newBoss && prevBossHostRef.current !== null && prevBossHostRef.current !== newBoss) {
            onHandoffRef.current?.(newBoss);
          }
          prevBossHostRef.current = newBoss;
        }
      } catch {
        if (!cancelled) setAgentsSurface((prev) => ({
          fetchedAt: new Date().toISOString(),
          degraded: true,
          degradedReason: "agents_route_fetch_error",
          stale: true,
          summary: prev?.summary ?? EMPTY_SUMMARY,
        }));
      } finally {
        inFlight = false;
        schedule();
      }
    }

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
        clearTimer();
        void fetchAgentsSurface();
      }
    };

    void fetchAgentsSurface();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { agentsSurface };
}
