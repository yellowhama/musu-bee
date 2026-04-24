"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Project {
  id: string;
  company_id: string;
  project_name: string;
  status: "active" | "paused" | "archived";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<Project["status"], string> = {
  active: "var(--status-online)",
  paused: "var(--status-warn)",
  archived: "var(--fg3)",
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

interface ProjectsPanelProps {
  companyId?: string | null;
}

export default function ProjectsPanel({ companyId }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
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
      const res = await fetch(`/api/bridge/companies/${companyId}/projects`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Project[] = await res.json();
      if (mountedRef.current) {
        const list = Array.isArray(data) ? data : [];
        const filtered =
          statusFilter === "all"
            ? list
            : list.filter((p) => p.status === statusFilter);
        setProjects(filtered);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    setProjects([]);
    void doFetch();
  }, [statusFilter, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    void doFetch();
    const interval = setInterval(() => {
      if (mountedRef.current) void doFetch();
    }, 15000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = useCallback(
    async (projectId: string, newStatus: Project["status"]) => {
      setUpdating((prev) => new Set(prev).add(projectId));
      try {
        const res = await fetch(`/api/bridge/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) void doFetch();
      } finally {
        setUpdating((prev) => {
          const next = new Set(prev);
          next.delete(projectId);
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
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg1)" }}>
            Projects
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
            {projects.filter((p) => p.status === "active").length} active
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

        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="all">All status</option>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="archived">archived</option>
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
            {error}
          </p>
        )}
        {companyId && !loading && !error && projects.length === 0 && (
          <p style={{ color: "var(--fg4)", fontSize: 13, padding: "20px 8px" }}>
            No projects found.
          </p>
        )}

        {companyId &&
          !loading &&
          !error &&
          projects.map((project) => {
            const isExpanded = expandedId === project.id;
            return (
              <div
                key={project.id}
                onClick={() => toggleExpand(project.id)}
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
                {/* Row 1: status + name + time */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: STATUS_COLOR[project.status],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--fg1)",
                      flex: 1,
                    }}
                  >
                    {project.project_name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: STATUS_COLOR[project.status],
                    }}
                  >
                    {project.status}
                  </span>
                </div>

                {/* Assigned to */}
                {project.assigned_to && (
                  <p style={{ fontSize: 11, color: "var(--fg2)", margin: 0 }}>
                    assigned to: {project.assigned_to}
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
                      {project.id}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--fg4)", margin: 0 }}>
                      updated {formatRelative(project.updated_at)}
                    </p>
                    {project.status !== "archived" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        {project.status === "active" && (
                          <button
                            onClick={() =>
                              void handleStatusChange(project.id, "paused")
                            }
                            disabled={updating.has(project.id)}
                            style={{
                              fontSize: 11,
                              color: updating.has(project.id) ? "var(--fg4)" : "var(--status-warn)",
                              background: "transparent",
                              border: "1px solid currentColor",
                              borderRadius: 4,
                              padding: "3px 10px",
                              cursor: updating.has(project.id) ? "default" : "pointer",
                            }}
                          >
                            Pause
                          </button>
                        )}
                        {project.status === "paused" && (
                          <button
                            onClick={() =>
                              void handleStatusChange(project.id, "active")
                            }
                            disabled={updating.has(project.id)}
                            style={{
                              fontSize: 11,
                              color: updating.has(project.id) ? "var(--fg4)" : "var(--status-online)",
                              background: "transparent",
                              border: "1px solid currentColor",
                              borderRadius: 4,
                              padding: "3px 10px",
                              cursor: updating.has(project.id) ? "default" : "pointer",
                            }}
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() =>
                            void handleStatusChange(project.id, "archived")
                          }
                          disabled={updating.has(project.id)}
                          style={{
                            fontSize: 11,
                            color: updating.has(project.id) ? "var(--fg4)" : "var(--fg3)",
                            background: "transparent",
                            border: "1px solid currentColor",
                            borderRadius: 4,
                            padding: "3px 10px",
                            cursor: updating.has(project.id) ? "default" : "pointer",
                          }}
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!isExpanded && (
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--fg4)",
                      margin: 0,
                      fontFamily: "monospace",
                    }}
                  >
                    {project.id}
                  </p>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
