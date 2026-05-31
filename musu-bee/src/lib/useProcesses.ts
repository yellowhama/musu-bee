"use client";

import { useState, useCallback } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";
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

const POLL_INTERVAL_MS = 10_000;

export function useProcesses(deviceId = "local", nameFilter?: string): UseProcessesReturn {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProcesses = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const url = new URL("/api/processes", window.location.origin);
      url.searchParams.set("device_id", deviceId);
      if (nameFilter) url.searchParams.set("name", nameFilter);
      const res = await fetch(url.toString(), { signal });
      if (!res.ok) {
        if (!signal?.aborted) setError(`Failed to fetch processes (HTTP ${res.status})`);
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as ProcessInfo[];
      if (!signal?.aborted) {
        setProcesses(data);
        setError(null);
      }
    } catch (err) {
      if (!signal?.aborted) setError(String(err));
      if (signal) throw err;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [deviceId, nameFilter]);

  const refresh = useCallback(() => {
    void fetchProcesses();
  }, [fetchProcesses]);

  useLowDutyPolling(fetchProcesses, { intervalMs: POLL_INTERVAL_MS });

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
