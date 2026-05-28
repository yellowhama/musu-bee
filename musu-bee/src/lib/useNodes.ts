"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

export function useNodes(): UseNodesReturn {
  const [nodes, setNodes] = useState<Array<{ name: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchNodes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/nodes/mesh");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: NodesResponse = await res.json();
      if (mountedRef.current) {
        setNodes(data.nodes.map(n => ({ name: n.name, status: n.status })));
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch nodes");
        setNodes([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchNodes();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      void fetchNodes();
    }, 30000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchNodes]);

  return { nodes, loading, error, refetch: fetchNodes };
}
