"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Approval {
  id: string;
  company_id: string;
  task_id: string | null;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<Approval["status"], string> = {
  pending: "var(--status-warn)",
  approved: "var(--status-online)",
  rejected: "var(--status-error)",
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

interface ApprovalsPanelProps {
  companyId?: string | null;
}

export default function ApprovalsPanel({ companyId }: ApprovalsPanelProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Map<string, "approved" | "rejected">>(new Map());

  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/bridge/companies/${companyId}/approvals`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Approval[] = await res.json();
      if (mountedRef.current) {
        setApprovals(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to load approvals");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    setApprovals([]);
    void doFetch();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleResolve = useCallback(
    async (approvalId: string, decision: "approved" | "rejected") => {
      setResolving((prev) => new Map(prev).set(approvalId, decision));
      try {
        const res = await fetch(`/api/bridge/approvals/${approvalId}/${decision}`, {
          method: "POST",
        });
        if (res.ok) void doFetch();
      } finally {
        setResolving((prev) => {
          const next = new Map(prev);
          next.delete(approvalId);
          return next;
        });
      }
    },
    [doFetch]
  );

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
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg1)" }}>
          Approvals
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
          {approvals.filter((a) => a.status === "pending").length} pending
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
            {error}
          </p>
        )}
        {companyId && !loading && !error && approvals.length === 0 && (
          <p style={{ color: "var(--fg4)", fontSize: 13, padding: "20px 8px" }}>
            No approvals in queue.
          </p>
        )}

        {companyId &&
          !loading &&
          !error &&
          approvals.map((approval) => (
            <div
              key={approval.id}
              style={{
                background: "var(--musu-bg-card)",
                border: `1px solid ${
                  approval.status === "pending"
                    ? "#f59e0b44"
                    : "var(--musu-border-dim)"
                }`,
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {/* Row 1: status + requestor + time */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: STATUS_COLOR[approval.status],
                    border: `1px solid ${STATUS_COLOR[approval.status]}44`,
                    borderRadius: 4,
                    padding: "1px 6px",
                  }}
                >
                  {approval.status}
                </span>
                <span style={{ fontSize: 11, color: "var(--fg2)" }}>
                  from{" "}
                  <span style={{ color: "var(--fg1)" }}>{approval.requested_by}</span>
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: "var(--musu-status-offline)" }}>
                  {formatRelative(approval.created_at)}
                </span>
              </div>

              {/* Reason */}
              {approval.reason && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--fg1)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {approval.reason}
                </p>
              )}

              {/* Task link */}
              {approval.task_id && (
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--fg4)",
                    margin: 0,
                    fontFamily: "monospace",
                  }}
                >
                  task: {approval.task_id}
                </p>
              )}

              {/* Resolve buttons (only for pending) */}
              {approval.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => void handleResolve(approval.id, "approved")}
                    disabled={resolving.has(approval.id)}
                    style={{
                      fontSize: 11,
                      color: resolving.get(approval.id) === "approved" ? "var(--fg4)" : "var(--status-online)",
                      background: "transparent",
                      border: "1px solid currentColor",
                      borderRadius: 4,
                      padding: "3px 12px",
                      cursor: resolving.has(approval.id) ? "default" : "pointer",
                    }}
                  >
                    {resolving.get(approval.id) === "approved" ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => void handleResolve(approval.id, "rejected")}
                    disabled={resolving.has(approval.id)}
                    style={{
                      fontSize: 11,
                      color: resolving.get(approval.id) === "rejected" ? "var(--fg4)" : "var(--status-error)",
                      background: "transparent",
                      border: "1px solid currentColor",
                      borderRadius: 4,
                      padding: "3px 12px",
                      cursor: resolving.has(approval.id) ? "default" : "pointer",
                    }}
                  >
                    {resolving.get(approval.id) === "rejected" ? "…" : "Reject"}
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
