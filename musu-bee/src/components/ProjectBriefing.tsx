"use client";

import React, { useEffect, useState } from "react";

// V23.5 C-1 — schema mirror of api_company_briefing.recent_wiki_pages[i]
// (musu-bridge `server.py`, commit 9d32bc5). snake_case preserved across the
// bridge ↔ frontend contract.
export interface RecentWikiPage {
  page_id: string;
  title: string;
  scope: string; // "global" | "company:<id_truncated_8>"
  updated_at: string; // ISO 8601
  summary_excerpt: string;
}

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
  // V23.5 C-1: present when the bridge surfaced wiki updates in the last 24h
  // (5-item cap, filesystem scan). Optional because endpoint may omit the field
  // for installs without wiki content. Empty array also tolerated.
  recent_wiki_pages?: RecentWikiPage[];
}

// V23.5 C-2 — build the W-4 agent wiki page URL from the C-1 row.
// Contract (W-4 `agentWikiClient.shared.ts`):
//   - path:  /app/wiki/agent/{encodeURIComponent(page_id)}
//   - query: ?company_id={companyId} ONLY when scope is "company:*"; global
//            scope pages drop the query entirely so the bridge picks the
//            global path on the server side.
// page_id can be folder-shaped (segments joined with "/"); we encode the whole
// id as a single component to mirror the W-3 proxy behaviour (the route
// segment is read back with decodeURIComponent on the server).
export function buildAgentWikiHref(
  pageId: string,
  scope: string,
  companyId?: string | null,
): string {
  const base = `/app/wiki/agent/${encodeURIComponent(pageId)}`;
  if (scope.startsWith("company:") && companyId) {
    return `${base}?company_id=${encodeURIComponent(companyId)}`;
  }
  return base;
}

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  healthy: { color: "var(--status-online)", label: "Running well" },
  busy: { color: "var(--status-warn)", label: "Busy" },
  needs_attention: { color: "var(--status-error)", label: "Needs attention" },
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
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--status-error)" }}>Needs your attention</span>
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

      {/* V23.5 C-2: Recent wiki updates (last 24h, ≤5 entries from C-1). */}
      <RecentWikiPagesSection
        pages={briefing.recent_wiki_pages ?? []}
        companyId={companyId}
        synthesisEnabled={false}
      />

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
      fontFamily: "var(--font-ui)",
      color: "var(--fg1)",
    }}>
      {children}
    </div>
  );
}

// V23.5 C-2 — Recent wiki updates card list.
//
// Consumes C-1's `recent_wiki_pages` field (5-cap, 24h). Each card links to the
// W-4 agent wiki page route (`/app/wiki/agent/{page_id}`), passing the full
// `company_id` query param only when the page is company-scoped — global pages
// stay query-free so the bridge takes the global path.
//
// The "📝 Get AI synthesis" button is a UI-only stub for C-3 (multi-page
// synthesis backend, not yet wired). It's rendered disabled with a tooltip
// explaining the gate; clicking is a no-op until C-3 lands and flips
// `synthesisEnabled`.
export function RecentWikiPagesSection({
  pages,
  companyId,
  onSynthesize,
  synthesisEnabled,
}: {
  pages: RecentWikiPage[];
  companyId?: string | null;
  onSynthesize?: () => void;
  synthesisEnabled: boolean;
}) {
  if (!pages || pages.length === 0) return null;
  return (
    <section
      className="briefing-wiki-section"
      style={{ marginTop: 24, marginBottom: 16 }}
      aria-label="Recent wiki updates"
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--fg1)" }}>
          📚 Recent wiki updates ({pages.length})
        </h3>
        <button
          type="button"
          onClick={synthesisEnabled ? onSynthesize : undefined}
          disabled={!synthesisEnabled}
          aria-disabled={!synthesisEnabled}
          title={
            synthesisEnabled
              ? "Get AI synthesis across these wiki updates"
              : "AI synthesis is opt-in (V23.5 C-3, not yet enabled)"
          }
          style={{
            fontSize: 12,
            padding: "4px 10px",
            border: "1px solid var(--fg3, #ccc)",
            borderRadius: 4,
            background: synthesisEnabled ? "var(--bg2)" : "transparent",
            color: "var(--fg2)",
            cursor: synthesisEnabled ? "pointer" : "not-allowed",
            opacity: synthesisEnabled ? 1 : 0.55,
            fontFamily: "inherit",
          }}
        >
          📝 Get AI synthesis
        </button>
      </header>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 8,
        }}
      >
        {pages.map((p) => (
          <li
            key={`${p.scope}:${p.page_id}`}
            style={{
              border: "1px solid var(--fg3, #ddd)",
              borderRadius: 6,
              padding: "10px 12px",
              background: "var(--bg2)",
            }}
          >
            <a
              href={buildAgentWikiHref(p.page_id, p.scope, companyId)}
              style={{
                textDecoration: "none",
                color: "var(--fg1)",
                display: "block",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <strong style={{ fontSize: 13, color: "var(--fg1)" }}>{p.title}</strong>
                <small style={{ fontSize: 11, color: "var(--fg3)", flexShrink: 0 }}>
                  {p.scope}
                </small>
              </div>
              {p.summary_excerpt && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--fg2)",
                    margin: "4px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  {p.summary_excerpt}
                </p>
              )}
              <small
                style={{
                  display: "block",
                  marginTop: 4,
                  color: "var(--fg3)",
                  fontSize: 11,
                }}
              >
                {p.updated_at}
              </small>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
