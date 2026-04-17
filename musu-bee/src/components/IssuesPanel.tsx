"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Issue {
  id: string;
  company_id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  assignee_id: string | null;
  checkout_by: string | null;
  checkout_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<Issue["status"], string> = {
  open: "#60a5fa",
  in_progress: "#f59e0b",
  resolved: "#22c55e",
  closed: "#6b7280",
};

const PRIORITY_COLOR: Record<Issue["priority"], string> = {
  low: "#6b7280",
  medium: "#9ca3af",
  high: "#f59e0b",
  critical: "#f87171",
};

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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

interface IssuesPanelProps {
  companyId?: string | null;
}

export default function IssuesPanel({ companyId }: IssuesPanelProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const url = `/api/bridge/companies/${companyId}/issues?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Issue[] = await res.json();
      if (mountedRef.current) {
        setIssues(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    setIssues([]);
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

  const handleCheckout = useCallback(
    async (issueId: string) => {
      setCheckingOut((prev) => new Set(prev).add(issueId));
      try {
        const res = await fetch(`/api/bridge/issues/${issueId}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: "manual" }),
        });
        if (res.ok) void doFetch();
      } finally {
        setCheckingOut((prev) => {
          const next = new Set(prev);
          next.delete(issueId);
          return next;
        });
      }
    },
    [doFetch]
  );

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
          <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6" }}>
            Issues
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
            {issues.filter((i) => i.status === "open" || i.status === "in_progress").length} active
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => void doFetch()}
            style={{
              fontSize: 11,
              color: "#9ca3af",
              background: "transparent",
              border: "1px solid #2d2d2d",
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
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {!companyId && (
          <p style={{ color: "#6b7280", fontSize: 13, padding: "20px 8px" }}>
            No active company selected.
          </p>
        )}
        {companyId && loading && (
          <p style={{ color: "#6b7280", fontSize: 13, padding: "20px 8px" }}>
            Loading…
          </p>
        )}
        {companyId && !loading && error && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            {error === "HTTP 503" ? "musu-bridge unavailable" : error}
          </p>
        )}
        {companyId && !loading && !error && issues.length === 0 && (
          <p style={{ color: "#4b5563", fontSize: 13, padding: "20px 8px" }}>
            No issues found.
          </p>
        )}

        {companyId &&
          !loading &&
          !error &&
          issues.map((issue) => {
            const isExpanded = expandedId === issue.id;
            return (
              <div
                key={issue.id}
                onClick={() => toggleExpand(issue.id)}
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
                {/* Row 1: status badge + priority + title */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: STATUS_COLOR[issue.status],
                      border: `1px solid ${STATUS_COLOR[issue.status]}44`,
                      borderRadius: 4,
                      padding: "1px 6px",
                    }}
                  >
                    {issue.status.replace("_", " ")}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: PRIORITY_COLOR[issue.priority],
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {issue.priority}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--musu-status-offline)",
                    }}
                  >
                    {formatRelative(issue.created_at)}
                  </span>
                </div>

                {/* Row 2: title */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#e5e7eb",
                    lineHeight: 1.4,
                  }}
                >
                  {issue.title}
                </div>

                {/* Row 3: description (collapsed: 2 lines) */}
                {issue.description && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
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
                    {issue.description}
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
                      gap: 6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        color: "#4b5563",
                        margin: 0,
                        fontFamily: "monospace",
                      }}
                    >
                      {issue.id}
                    </p>
                    {issue.assignee_id && (
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
                        assignee: {issue.assignee_id}
                      </p>
                    )}
                    {issue.checkout_by && (
                      <p style={{ fontSize: 11, color: "#f59e0b", margin: 0 }}>
                        checked out by: {issue.checkout_by}
                      </p>
                    )}
                    {issue.status === "open" && !issue.checkout_by && (
                      <button
                        onClick={() => void handleCheckout(issue.id)}
                        disabled={checkingOut.has(issue.id)}
                        style={{
                          alignSelf: "flex-start",
                          fontSize: 11,
                          color: checkingOut.has(issue.id) ? "#4b5563" : "#60a5fa",
                          background: "transparent",
                          border: "1px solid currentColor",
                          borderRadius: 4,
                          padding: "3px 10px",
                          cursor: checkingOut.has(issue.id) ? "default" : "pointer",
                        }}
                      >
                        {checkingOut.has(issue.id) ? "…" : "Checkout"}
                      </button>
                    )}
                  </div>
                )}

                {/* Collapsed: id small */}
                {!isExpanded && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "#374151",
                      margin: 0,
                      fontFamily: "monospace",
                    }}
                  >
                    {issue.id}
                  </p>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
