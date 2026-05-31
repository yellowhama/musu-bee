"use client";

import { useMemo, useState } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

export interface FlowEdge {
  /** Sender company id. */
  from: string;
  /** Receiver company id. */
  to: string;
  /** Number of messages in the rolling window (1h). */
  count: number;
  /** When the last message flowed (ms epoch). */
  lastAt: number;
}

interface FlowApiResponse {
  edges: FlowEdge[];
  /** Server clock when the snapshot was taken. */
  asOf: number;
}

const POLL_MS = 30_000;
const HOUR_MS = 60 * 60 * 1000;
const FADE_MS = 24 * HOUR_MS;

/**
 * Subscribes to the inter-company message flow stream.
 *
 * v12-canvas D — wiki 295 §6 P0 (사용자 결정 2026-05-12): edges are
 * implicit. When two companies' agents exchange messages, the canvas
 * grows an arrow between them. Frequency = thickness. 24h of silence
 * = fade out.
 *
 * Production source: /api/bridge/flow/companies (planned). Returns an
 * empty list when the endpoint isn't there yet so canvas stays clean.
 */
export function useCompanyMessageFlow() {
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [asOf, setAsOf] = useState<number>(() => Date.now());

  useLowDutyPolling(
    async (signal) => {
      try {
        const resp = await fetch("/api/bridge/flow/companies", { signal });
        if (!resp.ok) {
          if (!signal.aborted) setEdges([]);
          throw new Error(`HTTP ${resp.status}`);
        }
        const json = (await resp.json()) as FlowApiResponse;
        if (!signal.aborted) {
          setEdges(Array.isArray(json?.edges) ? json.edges : []);
          setAsOf(typeof json?.asOf === "number" ? json.asOf : Date.now());
        }
      } catch (err) {
        if (!signal.aborted) setEdges([]);
        throw err;
      }
    },
    { intervalMs: POLL_MS },
  );

  /** Render-ready: include thickness + opacity already computed. */
  const renderEdges = useMemo(() => {
    return edges.map((e) => {
      const ageMs = asOf - e.lastAt;
      // Thickness 1~5px on log-scaled message count.
      const t = Math.min(5, Math.max(1, Math.round(1 + Math.log10(1 + e.count) * 2)));
      // Fade from 1.0 at 0s to 0.0 at 24h.
      const opacity = ageMs >= FADE_MS ? 0 : Math.max(0, 1 - ageMs / FADE_MS);
      return { ...e, thicknessPx: t, opacity };
    });
  }, [edges, asOf]);

  return { edges: renderEdges, asOf };
}
