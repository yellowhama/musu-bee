"use client";

import { useState, useCallback, useRef } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

interface NodeHealth {
  name: string;
  tailscale_ip: string;
  worker_url: string;
  roles: string[];
  gpu: string;
  status: "online" | "offline" | "degraded" | "error";
  health?: {
    status?: string;
    hostname?: string;
    platform?: string;
    gpu?: unknown;
  };
  capabilities?: {
    available_clis?: string[];
  };
  error?: string;
}

interface NodesResponse {
  nodes: NodeHealth[];
  worker_port: number;
}

export interface UseNodesReturn {
  nodes: Array<{ name: string; status: string }>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 30_000;

export function useNodes(): UseNodesReturn {
  const [nodes, setNodes] = useState<Array<{ name: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchNodes = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const res = await fetch("/api/nodes/mesh", { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: NodesResponse = await res.json();
      if (mountedRef.current && !signal?.aborted) {
        setNodes(data.nodes.map(n => ({ name: n.name, status: n.status })));
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current && !signal?.aborted) {
        setError(err instanceof Error ? err.message : "Failed to fetch nodes");
        setNodes([]);
      }
      if (signal) throw err;
    } finally {
      if (mountedRef.current && !signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useLowDutyPolling(
    async (signal) => {
    mountedRef.current = true;
      await fetchNodes(signal);
    },
    { intervalMs: POLL_INTERVAL_MS },
  );

  return { nodes, loading, error, refetch: fetchNodes };
}
