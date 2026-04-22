"use client";

import { useEffect, useState } from "react";

interface Briefing {
  company_name: string;
  purpose: string;
  status: string;
  summary: string;
  active_goals: { title: string }[];
  completed_goals_count: number;
  blockers: { title: string; priority: string }[];
  open_issues: number;
  recent_wins: string[];
  agents: { total: number; active: number };
  needs_attention: boolean;
  attention_item: string | null;
}

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  healthy: { color: "#22c55e", label: "Running well" },
  busy: { color: "#f59e0b", label: "Busy" },
  needs_attention: { color: "#f87171", label: "Needs attention" },
};

interface ProjectBriefingProps {
  companyId?: string | null;
  nodeName?: string;
}

export default function ProjectBriefing({ companyId, nodeName }: ProjectBriefingProps) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    const nodeQ = nodeName ? `?node=${encodeURIComponent(nodeName)}` : "";
    fetch(`/api/bridge/companies/${companyId}/briefing${nodeQ}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setBriefing(data as Briefing); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId, nodeName]);

  if (loading) {
    return <Shell><span style={{ color: "var(--fg3)", fontSize: 13 }}>Loading briefing...</span></Shell>;
  }
  if (!companyId || !briefing) {
    return <Shell><span style={{ color: "var(--fg3)", fontSize: 13 }}>Select a project to see its briefing.</span></Shell>;
  }

  const si = STATUS_INDICATOR[briefing.status] || STATUS_INDICATOR.healthy;

  return (
    <Shell>
      {/* Company identity */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--fg1)", margin: 0 }}>
        {briefing.company_name}
      </h1>
      <p style={{ fontSize: 13, color: "var(--fg2)", margin: "4px 0 16px", lineHeight: 1.5 }}>
        {briefing.purpose}
      </p>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: si.color, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: si.color }}>{si.label}</span>
        <span style={{ fontSize: 12, color: "var(--fg3)", marginLeft: "auto" }}>
          Team: {briefing.agents.active}/{briefing.agents.total} active
        </span>
      </div>

      {/* Summary (the secretary's words) */}
      <p style={{ fontSize: 14, color: "var(--fg1)", lineHeight: 1.6, margin: "0 0 16px" }}>
        {briefing.summary}
      </p>

      {/* Blockers (if any) */}
      {briefing.blockers.length > 0 && (
        <div style={{
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>Needs your attention</span>
          {briefing.blockers.map((b, i) => (
            <p key={i} style={{ fontSize: 13, color: "var(--fg1)", margin: "6px 0 0" }}>{b.title}</p>
          ))}
        </div>
      )}

      {/* Goals progress */}
      {briefing.active_goals.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Active Goals
          </span>
          {briefing.active_goals.map((g, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 13, color: "var(--fg1)" }}>{g.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent wins */}
      {briefing.recent_wins.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Recent Wins
          </span>
          {briefing.recent_wins.map((w, i) => (
            <p key={i} style={{ fontSize: 12, color: "var(--fg2)", margin: "4px 0 0" }}>
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Show details toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          background: "none", border: "none", color: "var(--fg3)",
          fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit",
        }}
      >
        {showDetails ? "Hide details" : "Show details"}
      </button>

      {showDetails && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg3)", lineHeight: 1.6 }}>
          <p>Open issues: {briefing.open_issues}</p>
          <p>Completed goals: {briefing.completed_goals_count}</p>
          <p>Agents: {briefing.agents.total} total, {briefing.agents.active} active</p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      padding: "32px 40px", overflow: "auto",
      maxWidth: 640,
    }}>
      {children}
    </div>
  );
}
