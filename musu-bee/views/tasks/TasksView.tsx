import { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { applyDocumentTheme } from "@modelcontextprotocol/ext-apps";

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
  color: "#9ca3af",
  background: "#1a1a1a",
  border: "1px solid #2d2d2d",
  borderRadius: 6,
  padding: "3px 8px",
  cursor: "pointer",
  outline: "none",
};

const LIMIT = 20;
const POLL_INTERVAL_MS = 5000;

export default function TasksView() {
  const [tasks, setTasks] = useState<BridgeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [channels, setChannels] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [beforeId, setBeforeId] = useState<string | null>(null);

  const mountedRef = useRef(true);

  // ── MCP Apps SDK 연결 ───────────────────────────────────────
  const { app, isConnected, error: appError } = useApp({
    appInfo: { name: "MUSU Tasks", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      // 초기 tool result 수신 (show_tasks_view 결과)
      app.ontoolresult = (result) => {
        const sc = result.structuredContent as { tasks?: BridgeTask[] } | null;
        if (sc?.tasks && mountedRef.current) {
          applyTasks(sc.tasks);
        }
      };
      // host 테마 적용 (Claude dark/light 자동 반영)
      app.onhostcontextchanged = (ctx) => {
        if (ctx.styles) applyDocumentTheme(ctx.styles);
      };
    },
  });

  // ── 공통 task 상태 적용 ────────────────────────────────────
  const applyTasks = useCallback((list: BridgeTask[]) => {
    if (!mountedRef.current) return;
    setTasks(list);
    setHasMore(list.length === LIMIT);
    setBeforeId(list.length === LIMIT ? list[list.length - 1].task_id : null);
    setError(null);
    setLoading(false);
    setChannels((prev) => {
      const all = new Set([...prev, ...list.map((t) => t.channel)]);
      return Array.from(all).sort();
    });
  }, []);

  // ── poll_tasks 호출 헬퍼 ───────────────────────────────────
  const pollTasks = useCallback(
    async (cursor?: string | null) => {
      if (!app) return;
      try {
        const args: Record<string, unknown> = { limit: LIMIT };
        if (statusFilter !== "all") args.status = statusFilter;
        if (channelFilter !== "all") args.channel = channelFilter;
        if (cursor) args.before_id = cursor;

        const result = await app.callServerTool({ name: "poll_tasks", arguments: args });
        const sc = result.structuredContent as { tasks?: BridgeTask[] } | null;
        if (sc?.tasks && mountedRef.current) {
          if (cursor) {
            // load-more: append
            setTasks((prev) => [...prev, ...sc.tasks!]);
            setHasMore((sc.tasks?.length ?? 0) === LIMIT);
            setBeforeId(
              (sc.tasks?.length ?? 0) === LIMIT
                ? sc.tasks![sc.tasks!.length - 1].task_id
                : null,
            );
            setChannels((prev) => {
              const all = new Set([...prev, ...sc.tasks!.map((t) => t.channel)]);
              return Array.from(all).sort();
            });
          } else {
            applyTasks(sc.tasks);
          }
        }
      } catch {
        if (mountedRef.current) setError("poll failed");
      }
    },
    [app, statusFilter, channelFilter, applyTasks],
  );

  // ── 필터 변경 시 재조회 ─────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    setTasks([]);
    setBeforeId(null);
    void pollTasks();
  }, [statusFilter, channelFilter, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 5초 폴링 ───────────────────────────────────────────────
  useEffect(() => {
    if (!app || !isConnected) return;
    mountedRef.current = true;
    const id = setInterval(() => void pollTasks(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [app, isConnected, pollTasks]);

  // ── cancel ─────────────────────────────────────────────────
  const handleCancel = useCallback(
    async (taskId: string) => {
      if (!app) return;
      setCancelling((prev) => new Set(prev).add(taskId));
      try {
        await app.callServerTool({ name: "cancel_task", arguments: { task_id: taskId } });
        await pollTasks();
      } finally {
        if (mountedRef.current) {
          setCancelling((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        }
      }
    },
    [app, pollTasks],
  );

  const doLoadMore = useCallback(async () => {
    if (!beforeId || loadingMore) return;
    setLoadingMore(true);
    await pollTasks(beforeId);
    if (mountedRef.current) setLoadingMore(false);
  }, [beforeId, loadingMore, pollTasks]);

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // app 연결 실패 시 fallback 메시지
  const showAppError = !isConnected && appError;

  return (
    <div
      style={{
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
          <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6" }}>
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
          <span
            style={{
              fontSize: 11,
              color: isConnected ? "#22c55e" : "#6b7280",
            }}
          >
            {isConnected ? "● live" : "○ connecting…"}
          </span>
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
        {showAppError && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            Connection failed: {appError.message}
          </p>
        )}
        {!showAppError && loading && (
          <p style={{ color: "#6b7280", fontSize: 13, padding: "20px 8px" }}>
            Loading…
          </p>
        )}
        {!showAppError && !loading && error && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            {error}
          </p>
        )}
        {!showAppError && !loading && !error && tasks.length === 0 && (
          <p style={{ color: "#4b5563", fontSize: 13, padding: "20px 8px" }}>
            No delegated tasks yet.
          </p>
        )}

        {!showAppError &&
          !loading &&
          !error &&
          tasks.map((task) => {
            const isExpanded = expandedId === task.task_id;
            return (
              <div
                key={task.task_id}
                onClick={() => toggleExpand(task.task_id)}
                style={{
                  background: isExpanded
                    ? "var(--musu-bg-card-hover)"
                    : "var(--musu-bg-card)",
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
                    style={{
                      fontSize: 11,
                      color: "var(--musu-status-offline)",
                      marginLeft: "auto",
                    }}
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

                {task.summary && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "#d1d5db",
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

                {task.error && !isExpanded && (
                  <p style={{ fontSize: 11, color: "#f87171", margin: 0 }}>
                    {task.error}
                  </p>
                )}

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
                        color: "#6b7280",
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
                        color: "#9ca3af",
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
                            color: "#6b7280",
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
                            color: "#f87171",
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
                        color: "#4b5563",
                        margin: "8px 0 0",
                        fontFamily: "monospace",
                      }}
                    >
                      retry: {task.retry_count} · sender: {task.sender_id} ·
                      updated: {new Date(task.updated_at).toLocaleTimeString()}
                    </p>
                  </div>
                )}

                {!isExpanded && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "#374151",
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
              color: loadingMore ? "#4b5563" : "#9ca3af",
              background: "transparent",
              border: "1px solid #2d2d2d",
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
