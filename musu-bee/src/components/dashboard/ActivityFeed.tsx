"use client";

import { StatusDot } from "@/components/console/StatusDot";
import type { TaskStatus } from "@/components/console/StatusDot";

export interface BridgeTask {
  task_id: string;
  status: string;
  channel: string;
  summary: string | null;
  error: string | null;
  created_at: string;
}

function bridgeStatusToTaskStatus(s: string): TaskStatus {
  const MAP: Record<string, TaskStatus> = {
    pending: "queued",
    queued: "queued",
    running: "running",
    waiting: "waiting",
    done: "done",
    completed: "done",
    failed: "failed",
    cancelled: "cancelled",
    error: "failed",
  };
  return MAP[s] ?? "queued";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface ActivityFeedProps {
  tasks: BridgeTask[];
  loading: boolean;
  error: string | null;
  nodeName: string;
}

export function ActivityFeed({ tasks, loading, error, nodeName }: ActivityFeedProps) {
  if (loading) {
    return (
      <div style={{ color: "rgba(253,252,240,0.3)", fontSize: "12px", padding: "4px 0" }}>
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ color: "#ff6b6b", fontSize: "12px", padding: "4px 0" }}>
        Failed to load tasks ({error})
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div style={{ color: "rgba(253,252,240,0.3)", fontSize: "12px", padding: "4px 0" }}>
        {`No recent tasks${nodeName ? ` on ${nodeName}` : ""}`}
      </div>
    );
  }
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {tasks.map((t, i) => (
        <div
          key={t.task_id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            height: "40px",
            padding: "0 16px",
            borderBottom: i < tasks.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}
        >
          <StatusDot status={bridgeStatusToTaskStatus(t.status)} size={6} />
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: "11px",
              color: "rgba(253,252,240,0.4)",
              flexShrink: 0,
              width: "64px",
            }}
          >
            {t.task_id.slice(0, 8)}
          </span>
          <span
            style={{
              fontSize: "11px",
              color: "rgba(253,252,240,0.3)",
              flexShrink: 0,
              width: "80px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t.channel}
          </span>
          <span
            style={{
              flex: 1,
              fontSize: "12px",
              color: t.error ? "#ff6b6b" : "rgba(253,252,240,0.5)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t.error ?? t.summary ?? "—"}
          </span>
          <span
            style={{
              fontSize: "11px",
              color: "rgba(253,252,240,0.25)",
              flexShrink: 0,
              marginLeft: "4px",
            }}
          >
            {relativeTime(t.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
