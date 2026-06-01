// V23.4 Phase 4 T2-D-mini — RunPanel polling display (wiki/435 v2 §5).
// Polls /api/workflows/[id]/status with the shared low-duty poller; stops on terminal status.
"use client";

import { useCallback, useState } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

interface StepStatus {
  id: string;
  agent_id: string;
  status: string;
  started_at: number | null;
  finished_at: number | null;
  error_json: string | null;
}

interface WorkflowStatus {
  id: string;
  status: string;
  steps: StepStatus[];
}

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--status-warn)",
  running: "var(--status-running)",
  succeeded: "var(--status-online)",
  failed: "var(--status-error)",
  timeout: "var(--status-error)",
  skipped: "var(--fg3)",
  cancelled: "var(--fg3)",
};

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

export default function RunPanel({ workflowId }: { workflowId: string }) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchStatus = useCallback(async (signal: AbortSignal) => {
    if (!workflowId) return;
    try {
      const res = await fetch(`/api/workflows/${workflowId}/status`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WorkflowStatus;
      if (signal.aborted) return;
      setStatus(json);
      setError(null);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }, [workflowId]);

  useLowDutyPolling(fetchStatus, {
    enabled: Boolean(workflowId) && !TERMINAL.has(status?.status ?? ""),
    intervalMs: 5_000,
    maxBackoffMs: 60_000,
  });

  if (!status && !error) return null;

  return (
    <section
      data-testid="run-panel"
      style={{
        marginTop: 16,
        padding: 16,
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>
        Run · <span style={{ color: STATUS_COLOR[status?.status ?? ""] ?? "var(--fg3)" }}>{status?.status ?? "—"}</span>
      </h2>
      {error && (
        <div role="alert" style={{ fontSize: 12, color: "var(--status-error)", marginBottom: 8 }}>
          Status fetch error: {error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(status?.steps ?? []).map((s) => {
          const isExpanded = expanded.has(s.id);
          const canExpand = s.status === "succeeded" || s.status === "failed" || s.status === "timeout";
          return (
            <div
              key={s.id}
              data-testid={`run-step-${s.agent_id}`}
              onClick={() => {
                if (!canExpand) return;
                const next = new Set(expanded);
                if (next.has(s.id)) next.delete(s.id);
                else next.add(s.id);
                setExpanded(next);
              }}
              style={{
                padding: "8px 10px",
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                cursor: canExpand ? "pointer" : "default",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontFamily: "monospace" }}>{s.agent_id}</span>
                <span style={{ color: STATUS_COLOR[s.status] ?? "var(--fg3)" }}>{s.status}</span>
              </div>
              {isExpanded && s.status === "succeeded" && s.started_at && s.finished_at && (
                <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>
                  duration: {s.finished_at - s.started_at}s
                </div>
              )}
              {isExpanded && (s.status === "failed" || s.status === "timeout") && s.error_json && (
                <pre style={{ fontSize: 11, marginTop: 4, color: "var(--status-error)", whiteSpace: "pre-wrap" }}>
                  {s.error_json}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
