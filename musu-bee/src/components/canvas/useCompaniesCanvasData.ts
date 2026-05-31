"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompanyCardData, CompanyCardAgent } from "./CompanyCard";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

/**
 * Pulls the operator's company registry + per-company agents into the
 * shape CompanyCard wants.
 *
 * v12-canvas B: pulls from /api/bridge/companies (every active company)
 * and /api/bridge/companies/<id>/agents per card. Polls every 30s.
 *
 * Returns mock data when offline so the canvas isn't blank in dev.
 */
export function useCompaniesCanvasData() {
  const [cards, setCards] = useState<CompanyCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const compResp = await fetch("/api/bridge/companies", { signal });
      if (!compResp.ok) throw new Error(`companies ${compResp.status}`);
      const compJson = await compResp.json();
      const list: Array<{ id: string; name: string; purpose?: string; meta?: Record<string, unknown> }> = Array.isArray(compJson) ? compJson : compJson.companies ?? [];

      const next: CompanyCardData[] = await Promise.all(
        list.map(async (co) => {
          const agentsResp = await fetch(`/api/bridge/companies/${encodeURIComponent(co.id)}/agents`, { signal });
          const agentsJson: Array<{ id: string; name: string; role?: string; status?: string }> = agentsResp.ok ? await agentsResp.json() : [];
          const agents: CompanyCardAgent[] = agentsJson.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role ?? "agent",
            status: mapStatus(a.status),
          }));

          const meta = co.meta ?? {};
          const primaryNode = typeof meta.primary_node === "string" ? meta.primary_node : null;
          const otherNodes = Array.isArray(meta.other_nodes) ? (meta.other_nodes as string[]) : [];

          return {
            companyId: co.id,
            companyName: co.name,
            mission: co.purpose?.split("\n")[0]?.trim() || "—",
            primaryNode,
            otherNodes,
            agents,
            blockedCount: 0,
          };
        }),
      );
      if (!cancelledRef.current && !signal?.aborted) {
        setCards(next);
        setError(null);
      }
    } catch (e) {
      if (!cancelledRef.current && !signal?.aborted) {
        setError((e as Error).message);
      }
      if (signal) throw e;
    } finally {
      if (!cancelledRef.current && !signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useLowDutyPolling(load, { intervalMs: 30_000 });

  const refresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  const layout = useMemo(() => layoutCards(cards), [cards]);
  return { cards, layout, loading, error, refresh };
}

function mapStatus(s: string | undefined): CompanyCardAgent["status"] {
  switch (s) {
    case "running":
    case "active":
    case "working":
      return "working";
    case "blocked":
    case "error":
      return "blocked";
    case "paused":
      return "paused";
    case "idle":
    case "stopped":
    default:
      return "idle";
  }
}

/**
 * Simple grid layout — N cards in a centered grid. v12-canvas E will
 * replace this with persisted tldraw shape positions.
 */
function layoutCards(cards: CompanyCardData[]): Record<string, { left: number; top: number }> {
  const out: Record<string, { left: number; top: number }> = {};
  const cardW = 240;
  const cardH = 170;
  const gap = 28;
  const cols = Math.max(1, Math.ceil(Math.sqrt(cards.length || 1)));
  cards.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[c.companyId] = {
      left: 80 + col * (cardW + gap),
      top: 80 + row * (cardH + gap),
    };
  });
  return out;
}
