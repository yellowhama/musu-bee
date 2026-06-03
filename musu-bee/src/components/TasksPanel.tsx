"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useBoundedEventSource } from "@/lib/useBoundedEventSource";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";
import SprintContractSection from "./SprintContractSection";

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
  pending: "var(--musu-task-pending)",
  running: "var(--musu-task-running)",
  done: "var(--musu-task-done)",
  failed: "var(--musu-task-failed)",
};

const STATUS_DOT: Record<BridgeTask["status"], string> = {
  pending: "○",
  running: "◐",
  done: "●",
  failed: "✕",
};

const ALL_STATUSES = ["all", "pending", "running", "done", "failed"] as const;
type StatusFilter = (typeof ALL_STATUSES)[number];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const SELECT_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: "var(--fg2)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "3px 8px",
  cursor: "pointer",
  outline: "none",
};

interface TasksPanelProps {
  companyId?: string | null;
}

export default function TasksPanel({ companyId }: TasksPanelProps = {}) {
  const [tasks, setTasks] = useState<BridgeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [channels, setChannels] = useState<string[]>([]);
  const [sseFallbackEnabled, setSseFallbackEnabled] = useState(false);

  // Pagination
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const mountedRef = useRef(true);
  const LIMIT = 20;
  const POLL_TIMEOUT_MS = 8_000;

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (cursor) params.set("before_id", cursor);
      if (companyId) params.set("company_id", companyId);
      return `/api/bridge-tasks?${params.toString()}`;
    },
    [statusFilter, channelFilter, companyId]
  );

  const doFetch = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(buildUrl(), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BridgeTask[] = await res.json();
      if (mountedRef.current && !signal?.aborted) {
        const list = Array.isArray(data) ? data : [];
        setTasks(list);
        setBeforeId(list.length === LIMIT ? list[list.length - 1].task_id : null);
        setHasMore(list.length === LIMIT);
        setError(null);
        // Collect unique channels for filter dropdown
        setChannels((prev) => {
          const all = new Set([...prev, ...list.map((t) => t.channel)]);
          return Array.from(all).sort();
        });
      }
    } catch (e) {
      if (mountedRef.current && !signal?.aborted)
        setError(e instanceof Error ? e.message : "Failed to load tasks");
      if (signal) throw e;
    } finally {
      if (mountedRef.current && !signal?.aborted) setLoading(false);
    }
  }, [buildUrl]);

  const doLoadMore = useCallback(async () => {
    if (!beforeId || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(beforeId));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BridgeTask[] = await res.json();
      if (mountedRef.current) {
        const list = Array.isArray(data) ? data : [];
        setTasks((prev) => [...prev, ...list]);
        setBeforeId(list.length === LIMIT ? list[list.length - 1].task_id : null);
        setHasMore(list.length === LIMIT);
        setChannels((prev) => {
          const all = new Set([...prev, ...list.map((t) => t.channel)]);
          return Array.from(all).sort();
        });
      }
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [beforeId, buildUrl, loadingMore]);

  // Re-fetch on filter change
  useEffect(() => {
    setLoading(true);
    setTasks([]);
    setBeforeId(null);
    setHasMore(false);
    void doFetch();
  }, [statusFilter, channelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleTaskUpdate = useCallback((e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data as string) as { type: string };
      if (mountedRef.current && event.type === "task_update") {
        void doFetch();
      }
    } catch {
      // ignore parse errors
    }
  }, [doFetch]);

  useBoundedEventSource({
    url: "/api/bridge-tasks/events",
    events: { task_update: handleTaskUpdate },
    onMessage: handleTaskUpdate,
    onOpen: () => {
      if (mountedRef.current) setSseFallbackEnabled(false);
    },
    onError: () => {
      if (mountedRef.current) setSseFallbackEnabled(true);
    },
  });

  useLowDutyPolling(doFetch, {
    enabled: sseFallbackEnabled,
    intervalMs: 30_000,
    taskTimeoutMs: POLL_TIMEOUT_MS,
  });

  const handleCancel = useCallback(async (taskId: string) => {
    setCancelling((prev) => new Set(prev).add(taskId));
    try {
      await fetch(`/api/bridge-tasks/${taskId}`, { method: "DELETE" });
      const res = await fetch(`/api/bridge-tasks?limit=${LIMIT}`);
      if (res.ok) {
        const data: BridgeTask[] = await res.json();
        if (mountedRef.current) setTasks(Array.isArray(data) ? data : []);
      }
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, []);

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--musu-bg-inset)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 10px",
          borderBottom: "1px solid var(--musu-border-dim)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg1)" }}>
            Delegated Tasks
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--musu-text-dim)",
              background: "var(--musu-bg-card)",
              border: "1px solid var(--musu-border)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            {tasks.filter((t) => t.status === "running").length} running
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--status-online)" }}>● live</span>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={SELECT_STYLE}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All status" : s}
              </option>
            ))}
          </select>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="all">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {loading && (
          <p style={{ color: "var(--fg3)", fontSize: 13, padding: "20px 8px" }}>
            Loading…
          </p>
        )}
        {!loading && error && (
          <p style={{ color: "var(--status-error)", fontSize: 13, padding: "20px 8px" }}>
            {error === "HTTP 503" ? "musu-bridge unavailable" : error}
          </p>
        )}
        {!loading && !error && tasks.length === 0 && (
          <p style={{ color: "var(--fg4)", fontSize: 13, padding: "20px 8px" }}>
            No delegated tasks yet.
          </p>
        )}

        {!loading &&
          !error &&
          tasks.map((task) => {
            const isExpanded = expandedId === task.task_id;
            return (
              <div
                key={task.task_id}
                onClick={() => toggleExpand(task.task_id)}
                style={{
                  background: isExpanded ? "var(--musu-bg-card-hover)" : "var(--musu-bg-card)",
                  border: `1px solid ${isExpanded ? "var(--musu-border)" : "var(--musu-border-dim)"}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
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
                      color: "var(--musu-text-muted)",
                      background: "var(--musu-bg-card)",
                      border: "1px solid var(--musu-border)",
                      borderRadius: 999,
                      padding: "1px 7px",
                    }}
                  >
                    {task.channel}
                  </span>
                  <span
                    style={{ fontSize: 11, color: "var(--musu-status-offline)", marginLeft: "auto" }}
                  >
                    {formatRelative(task.created_at)}
                  </span>
                  {(task.status === "pending" || task.status === "running") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCancel(task.task_id);
                      }}
                      disabled={cancelling.has(task.task_id)}
                      style={{
                        fontSize: 11,
                        color: cancelling.has(task.task_id)
                          ? "var(--fg4)"
                          : "var(--status-error)",
                        background: "transparent",
                        border: "1px solid currentColor",
                        borderRadius: 4,
                        padding: "2px 8px",
                        cursor: cancelling.has(task.task_id)
                          ? "default"
                          : "pointer",
                      }}
                    >
                      {cancelling.has(task.task_id) ? "…" : "Cancel"}
                    </button>
                  )}
                </div>

                {/* Row 2: summary (collapsed: 3 lines, expanded: full) */}
                {task.summary && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--fg1)",
                      margin: 0,
                      lineHeight: 1.5,
                      ...(isExpanded
                        ? {}
                        : {
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                          }),
                    }}
                  >
                    {task.summary}
                  </p>
                )}

                {/* Row 3: error */}
                {task.error && (
                  <p style={{ fontSize: 11, color: "var(--status-error)", margin: 0 }}>
                    {task.error}
                  </p>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: "10px 12px",
                      background: "var(--musu-bg-inset)",
                      border: "1px solid var(--musu-border-dim)",
                      borderRadius: 6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--fg3)",
                        margin: "0 0 6px",
                        fontFamily: "monospace",
                        letterSpacing: "0.05em",
                      }}
                    >
                      TASK ID
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--fg2)",
                        margin: "0 0 10px",
                        fontFamily: "monospace",
                      }}
                    >
                      {task.task_id}
                    </p>
                    {task.error && (
                      <>
                        <p
                          style={{
                            fontSize: 10,
                            color: "var(--fg3)",
                            margin: "0 0 4px",
                            fontFamily: "monospace",
                            letterSpacing: "0.05em",
                          }}
                        >
                          ERROR
                        </p>
                        <pre
                          style={{
                            fontSize: 11,
                            color: "var(--status-error)",
                            margin: 0,
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {task.error}
                        </pre>
                      </>
                    )}
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--fg4)",
                        margin: "8px 0 0",
                        fontFamily: "monospace",
                      }}
                    >
                      retry: {task.retry_count} · sender: {task.sender_id} ·
                      updated: {new Date(task.updated_at).toLocaleTimeString()}
                    </p>
                    <SprintContractSection taskId={task.task_id} />
                  </div>
                )}

                {/* Collapsed: task_id small */}
                {!isExpanded && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--fg4)",
                      margin: 0,
                      fontFamily: "monospace",
                    }}
                  >
                    {task.task_id}
                  </p>
                )}
              </div>
            );
          })}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={() => void doLoadMore()}
            disabled={loadingMore}
            style={{
              width: "100%",
              marginTop: 4,
              marginBottom: 16,
              padding: "8px",
              fontSize: 12,
              color: loadingMore ? "var(--fg4)" : "var(--fg2)",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              cursor: loadingMore ? "default" : "pointer",
            }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
