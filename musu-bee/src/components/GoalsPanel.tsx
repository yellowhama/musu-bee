"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Goal } from "@/types";

const STATUS_COLOR: Record<Goal["status"], string> = {
  active: "var(--status-running)",
  completed: "var(--status-online)",
  cancelled: "var(--fg3)",
};

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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return `overdue ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  return `due in ${diffDays}d`;
}

interface GoalsPanelProps {
  companyId?: string | null;
}

export default function GoalsPanel({ companyId }: GoalsPanelProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const url = `/api/bridge/companies/${companyId}/goals?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Goal[] = await res.json();
      if (mountedRef.current) {
        setGoals(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to load goals");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    setGoals([]);
    void doFetch();
  }, [statusFilter, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    void doFetch();
    const interval = setInterval(() => {
      if (mountedRef.current) void doFetch();
    }, 10000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = useCallback(
    async (goalId: string, newStatus: Goal["status"]) => {
      setUpdating((prev) => new Set(prev).add(goalId));
      try {
        const res = await fetch(`/api/bridge/goals/${goalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) void doFetch();
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev);
          next.delete(goalId);
          return next;
        });
      }
    },
    [doFetch]
  );

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const activeCount = goals.filter((g) => g.status === "active").length;

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
            Goals
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
            {activeCount} active
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => void doFetch()}
            style={{
              fontSize: 11,
              color: "var(--fg2)",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="all">All status</option>
            <option value="active">active</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {!companyId && (
          <p style={{ color: "var(--fg3)", fontSize: 13, padding: "20px 8px" }}>
            No active company selected.
          </p>
        )}
        {companyId && loading && (
          <p style={{ color: "var(--fg3)", fontSize: 13, padding: "20px 8px" }}>
            Loading…
          </p>
        )}
        {companyId && !loading && error && (
          <p style={{ color: "var(--status-error)", fontSize: 13, padding: "20px 8px" }}>
            {error === "HTTP 503" ? "musu-bridge unavailable" : error}
          </p>
        )}
        {companyId && !loading && !error && goals.length === 0 && (
          <p style={{ color: "var(--fg4)", fontSize: 13, padding: "20px 8px" }}>
            No goals found.
          </p>
        )}

        {companyId &&
          !loading &&
          !error &&
          goals.map((goal) => {
            const isExpanded = expandedId === goal.id;
            const dueLabel = formatDueDate(goal.due_date);
            const isOverdue = dueLabel?.startsWith("overdue");
            return (
              <div
                key={goal.id}
                onClick={() => toggleExpand(goal.id)}
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
                {/* Row 1: status badge + due date + time */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: STATUS_COLOR[goal.status],
                      border: `1px solid ${STATUS_COLOR[goal.status]}44`,
                      borderRadius: 4,
                      padding: "1px 6px",
                    }}
                  >
                    {goal.status}
                  </span>
                  {dueLabel && (
                    <span
                      style={{
                        fontSize: 10,
                        color: isOverdue ? "var(--status-error)" : "var(--fg2)",
                        fontWeight: isOverdue ? 600 : 400,
                      }}
                    >
                      {dueLabel}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--musu-status-offline)",
                    }}
                  >
                    {formatRelative(goal.created_at)}
                  </span>
                </div>

                {/* Row 2: title */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--fg1)",
                    lineHeight: 1.4,
                  }}
                >
                  {goal.title}
                </div>

                {/* Row 3: description (collapsed: 2 lines) */}
                {goal.description && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--fg2)",
                      margin: 0,
                      lineHeight: 1.5,
                      ...(isExpanded
                        ? {}
                        : {
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }),
                    }}
                  >
                    {goal.description}
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
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--fg4)",
                        margin: 0,
                        fontFamily: "monospace",
                      }}
                    >
                      {goal.id}
                    </p>
                    {goal.due_date && (
                      <p style={{ fontSize: 11, color: "var(--fg2)", margin: 0 }}>
                        due: {goal.due_date}
                      </p>
                    )}
                    {goal.status === "active" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => void handleStatusChange(goal.id, "completed")}
                          disabled={updating.has(goal.id)}
                          style={{
                            fontSize: 11,
                            color: updating.has(goal.id) ? "var(--fg4)" : "var(--status-online)",
                            background: "transparent",
                            border: "1px solid currentColor",
                            borderRadius: 4,
                            padding: "3px 10px",
                            cursor: updating.has(goal.id) ? "default" : "pointer",
                          }}
                        >
                          {updating.has(goal.id) ? "…" : "Mark Complete"}
                        </button>
                        <button
                          onClick={() => void handleStatusChange(goal.id, "cancelled")}
                          disabled={updating.has(goal.id)}
                          style={{
                            fontSize: 11,
                            color: updating.has(goal.id) ? "var(--fg4)" : "var(--fg3)",
                            background: "transparent",
                            border: "1px solid currentColor",
                            borderRadius: 4,
                            padding: "3px 10px",
                            cursor: updating.has(goal.id) ? "default" : "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsed: id small */}
                {!isExpanded && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--fg4)",
                      margin: 0,
                      fontFamily: "monospace",
                    }}
                  >
                    {goal.id}
                  </p>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
