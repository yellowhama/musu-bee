"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProcessInfo } from "@/app/api/processes/route";

export type { ProcessInfo };

export interface ProcessStartRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  device_id?: string;
}

export interface UseProcessesReturn {
  processes: ProcessInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  killProcess: (pid: number, deviceId: string, force?: boolean) => Promise<void>;
  startProcess: (req: ProcessStartRequest) => Promise<{ pid: number; name: string }>;
}

const POLL_INTERVAL_MS = 5_000;

export function useProcesses(deviceId = "local", nameFilter?: string): UseProcessesReturn {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchProcesses() {
      setLoading(true);
      try {
        const url = new URL("/api/processes", window.location.origin);
        url.searchParams.set("device_id", deviceId);
        if (nameFilter) url.searchParams.set("name", nameFilter);
        const res = await fetch(url.toString());
        if (!res.ok) {
          setError(`Failed to fetch processes (HTTP ${res.status})`);
          return;
        }
        const data = (await res.json()) as ProcessInfo[];
        if (!cancelled) {
          setProcesses(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProcesses();
    const id = setInterval(fetchProcesses, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId, nameFilter, tick]);

  const killProcess = useCallback(
    async (pid: number, targetDeviceId: string, force = false) => {
      const url = new URL("/api/processes/kill", window.location.origin);
      url.searchParams.set("pid", String(pid));
      url.searchParams.set("device_id", targetDeviceId);
      if (force) url.searchParams.set("force", "true");
      const res = await fetch(url.toString(), { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      refresh();
    },
    [refresh],
  );

  const startProcess = useCallback(
    async (req: ProcessStartRequest): Promise<{ pid: number; name: string }> => {
      const res = await fetch("/api/processes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { pid: number; name: string };
      refresh();
      return data;
    },
    [refresh],
  );

  return { processes, loading, error, refresh, killProcess, startProcess };
}
