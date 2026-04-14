"use client";

import { useEffect, useState, useCallback } from "react";

interface BridgeTask {
  task_id: string;
  status: "pending" | "running" | "done" | "failed";
  channel: string;
  sender_id: string;
  summary: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<BridgeTask["status"], string> = {
  pending: "#9ca3af",
  running: "#60a5fa",
  done: "#86efac",
  failed: "#f87171",
};

const STATUS_DOT: Record<BridgeTask["status"], string> = {
  pending: "○",
  running: "◐",
  done: "●",
  failed: "✕",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function TasksPanel() {
  const [tasks, setTasks] = useState<BridgeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  // Initial load + 3s polling with unmount guard
  useEffect(() => {
    let mounted = true;
    const doFetch = async () => {
      try {
        const res = await fetch("/api/bridge-tasks?limit=50");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted) {
          setTasks(Array.isArray(data) ? data : []);
          setError(null);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load tasks");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void doFetch();
    const interval = setInterval(() => void doFetch(), 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []); // empty deps — stable, interval never restarts

  const handleCancel = useCallback(async (taskId: string) => {
    setCancelling((prev) => new Set(prev).add(taskId));
    try {
      await fetch(`/api/bridge-tasks/${taskId}`, { method: "DELETE" });
      // Re-fetch inline after cancel
      const res = await fetch("/api/bridge-tasks?limit=50");
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, []); // stable — no deps

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "#0d0d0d",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 24px 12px",
          borderBottom: "1px solid #1f1f1f",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6" }}>
          Delegated Tasks
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#6b7280",
            background: "#1a1a1a",
            border: "1px solid #2d2d2d",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {tasks.filter((t) => t.status === "running").length} running
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#4b5563" }}>auto-refresh 3s</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {loading && (
          <p style={{ color: "#6b7280", fontSize: 13, padding: "20px 8px" }}>Loading…</p>
        )}
        {!loading && error && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            {error === "HTTP 503" ? "musu-bridge unavailable" : error}
          </p>
        )}
        {!loading && !error && tasks.length === 0 && (
          <p style={{ color: "#4b5563", fontSize: 13, padding: "20px 8px" }}>
            No delegated tasks yet.
          </p>
        )}
        {!loading && !error && tasks.map((task) => (
          <div
            key={task.task_id}
            style={{
              background: "#111",
              border: "1px solid #1f1f1f",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {/* Row 1: status + channel + time + cancel */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  color: STATUS_COLOR[task.status],
                  fontFamily: "monospace",
                }}
              >
                {STATUS_DOT[task.status]}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: STATUS_COLOR[task.status],
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {task.status}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  background: "#1a1a1a",
                  border: "1px solid #2d2d2d",
                  borderRadius: 999,
                  padding: "1px 7px",
                }}
              >
                {task.channel}
              </span>
              <span style={{ fontSize: 11, color: "#4b5563", marginLeft: "auto" }}>
                {formatRelative(task.created_at)}
              </span>
              {(task.status === "pending" || task.status === "running") && (
                <button
                  onClick={() => void handleCancel(task.task_id)}
                  disabled={cancelling.has(task.task_id)}
                  style={{
                    fontSize: 11,
                    color: cancelling.has(task.task_id) ? "#4b5563" : "#f87171",
                    background: "transparent",
                    border: "1px solid currentColor",
                    borderRadius: 4,
                    padding: "2px 8px",
                    cursor: cancelling.has(task.task_id) ? "default" : "pointer",
                  }}
                >
                  {cancelling.has(task.task_id) ? "…" : "Cancel"}
                </button>
              )}
            </div>

            {/* Row 2: summary / error */}
            {task.summary && (
              <p
                style={{
                  fontSize: 12,
                  color: "#d1d5db",
                  margin: 0,
                  lineHeight: 1.5,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {task.summary}
              </p>
            )}
            {task.error && (
              <p style={{ fontSize: 11, color: "#f87171", margin: 0 }}>
                {task.error}
              </p>
            )}

            {/* Row 3: task_id */}
            <p style={{ fontSize: 10, color: "#374151", margin: 0, fontFamily: "monospace" }}>
              {task.task_id}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
