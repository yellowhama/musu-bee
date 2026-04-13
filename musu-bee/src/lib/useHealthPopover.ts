"use client";

import { useState, useCallback, useEffect, useRef } from "react";

type HealthPopoverData = { status: string; latency_ms?: number; version?: string } | null;

export type HealthPopover = {
  svc: "port" | "bridge" | "worker";
  anchor: { x: number; y: number };
  data: HealthPopoverData;
  loading: boolean;
};

export function useHealthPopover() {
  const [healthPopover, setHealthPopover] = useState<HealthPopover | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!healthPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setHealthPopover(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [healthPopover]);

  const handleBadgeClick = useCallback(
    async (svc: "port" | "bridge" | "worker", e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHealthPopover({ svc, anchor: { x: rect.left, y: rect.bottom + 6 }, data: null, loading: true });
      const start = Date.now();
      try {
        const res = await fetch(`/api/service-health?svc=${svc}`);
        const body = (await res.json()) as { ok?: boolean; status?: string; version?: string };
        setHealthPopover((prev) =>
          prev
            ? {
                ...prev,
                loading: false,
                data: {
                  status: body.ok ? "up" : "down",
                  latency_ms: Date.now() - start,
                  version: body.version,
                },
              }
            : null
        );
      } catch {
        setHealthPopover((prev) =>
          prev ? { ...prev, loading: false, data: { status: "unreachable" } } : null
        );
      }
    },
    []
  );

  return { healthPopover, setHealthPopover, popoverRef, handleBadgeClick };
}
