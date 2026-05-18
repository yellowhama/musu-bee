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

// V23.5 C-4 — shapes of the cos-synthesis endpoints (status + invoke).
// Mirrors musu-bridge server.py /api/cos-synthesis/status and
// /api/companies/{id}/cos-briefing-synthesize. snake_case preserved across the
// bridge ↔ frontend contract.
export interface SynthesisStatus {
  enabled: boolean;
  estimated_cost_usd: number;
}

export interface SynthesisResponse {
  synthesis: string | null;
  source_pages: RecentWikiPage[];
  degraded: boolean;
  degrade_reason?: string;
  duration_ms?: number;
}

// V23.5 C-4 — sessionStorage key for constraint (c) cost-preview ack. Kept at
// module scope so tests / other components can reset it during fixtures.
export const COS_SYNTHESIS_COST_ACK_KEY = "cos_synthesis_cost_acked";

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

// V23.5 C-4 — fetch synthesis enablement once on mount. We deliberately keep
// this as a one-shot fetch (no polling) — operators flip MUSU_USER_LLM_API_KEY
// rarely, and a stale "disabled" state for a single page load is harmless
// (it just means the button stays greyed out until the next nav). Returns a
// stable default object on failure so the UI never renders an undefined
// status (constraint a: graceful degrade applies to status too).
function useCosSynthesisStatus(): SynthesisStatus {
  const [status, setStatus] = useState<SynthesisStatus>({
    enabled: false,
    estimated_cost_usd: 0.2,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cos-synthesis/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // Accept partial payloads — keep defaults for missing fields.
        setStatus({
          enabled: Boolean(data.enabled),
          estimated_cost_usd:
            typeof data.estimated_cost_usd === "number"
              ? data.estimated_cost_usd
              : 0.2,
        });
      })
      .catch(() => {
        /* keep default disabled state — proxy already degrades to 200 */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export default function ProjectBriefing({ companyId, nodeName }: ProjectBriefingProps) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  // V23.5 C-4 — synthesis enablement state (driven by /api/cos-synthesis/status).
  const synthesisStatus = useCosSynthesisStatus();

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

      {/* V23.5 C-2/C-4: Recent wiki updates (last 24h, ≤5 entries from C-1).
          C-4 wired `synthesisEnabled` to the live /api/cos-synthesis/status
          response and pushes the estimated cost down so the section can show
          the constraint (c) cost-preview dialog on first click per session. */}
      <RecentWikiPagesSection
        pages={briefing.recent_wiki_pages ?? []}
        companyId={companyId}
        synthesisEnabled={synthesisStatus.enabled}
        estimatedCostUsd={synthesisStatus.estimated_cost_usd}
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

// V23.5 C-2/C-4 — Recent wiki updates card list with optional AI synthesis.
//
// Consumes C-1's `recent_wiki_pages` field (5-cap, 24h). Each card links to the
// W-4 agent wiki page route (`/app/wiki/agent/{page_id}`), passing the full
// `company_id` query param only when the page is company-scoped — global pages
// stay query-free so the bridge takes the global path.
//
// The "📝 Get AI synthesis" button is wired (C-4) when `synthesisEnabled` is
// true (driven by /api/cos-synthesis/status). Click flow:
//   (1) Constraint (c) cost preview — sessionStorage flag gated `window.confirm`
//       on the FIRST click per session, showing the operator's estimated cost.
//   (2) POST /api/cos-synthesis/[company_id] (musu-bee proxy → bridge).
//   (3) If response.degraded || !synthesis → render NOTHING (the C-1 cards
//       below already cover the fallback — constraint (a) graceful degrade).
//       Otherwise render the synthesis text inline above the cards.
// Failures are silent at the UI layer — the bridge already logs them locally
// per constraint (d), and the cards are still visible regardless.
export function RecentWikiPagesSection({
  pages,
  companyId,
  onSynthesize,
  synthesisEnabled,
  estimatedCostUsd,
}: {
  pages: RecentWikiPage[];
  companyId?: string | null;
  // Test-only override (kept for renderToStaticMarkup unit tests). In prod
  // we use the internal handler so the section owns its own state machine.
  onSynthesize?: () => void;
  synthesisEnabled: boolean;
  estimatedCostUsd?: number;
}) {
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [degradeReason, setDegradeReason] = useState<string | null>(null);

  const costStr =
    typeof estimatedCostUsd === "number"
      ? `~$${estimatedCostUsd.toFixed(2)}`
      : "~$0.20";

  async function handleSynthesizeInternal() {
    if (!companyId) return;
    // (c) Cost preview — show the dialog once per session. We use
    // sessionStorage so it resets on a new tab, which matches operator
    // mental model ("a tab is one work session") and avoids re-prompting on
    // every dashboard nav.
    if (typeof window !== "undefined") {
      const acked = window.sessionStorage.getItem(COS_SYNTHESIS_COST_ACK_KEY);
      if (!acked) {
        const ok = window.confirm(
          `Estimated cost: ${costStr} per synthesis. ` +
            "This is charged to YOUR configured LLM API key " +
            "(MUSU_USER_LLM_API_KEY). Proceed?",
        );
        if (!ok) return;
        window.sessionStorage.setItem(COS_SYNTHESIS_COST_ACK_KEY, "1");
      }
    }

    setBusy(true);
    setDegradeReason(null);
    try {
      const r = await fetch(`/api/cos-synthesis/${encodeURIComponent(companyId)}`, {
        method: "POST",
      });
      // Bridge always returns a structured envelope (even on 503), so we
      // try to parse the body before deciding what to do with the status.
      const data: SynthesisResponse = await r.json().catch(
        () => ({
          synthesis: null,
          source_pages: [],
          degraded: true,
          degrade_reason: "proxy_invalid_json",
        }) as SynthesisResponse,
      );
      if (data.degraded || !data.synthesis) {
        // (a) Graceful degrade — C-1 cards below are the fallback.
        setSynthesis(null);
        setDegradeReason(data.degrade_reason ?? "unknown");
      } else {
        setSynthesis(data.synthesis);
      }
    } catch {
      // Network failure → silent degrade to cards. The bridge / proxy
      // already log per constraint (d).
      setSynthesis(null);
      setDegradeReason("network_error");
    } finally {
      setBusy(false);
    }
  }

  // Prefer the test-injected onSynthesize when present so the C-2 unit
  // tests can still pass an explicit spy without us forking renderers.
  const clickHandler = onSynthesize ?? handleSynthesizeInternal;
  const buttonDisabled = !synthesisEnabled || busy || !companyId;

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
          onClick={buttonDisabled ? undefined : clickHandler}
          disabled={buttonDisabled}
          aria-disabled={buttonDisabled}
          title={
            synthesisEnabled
              ? busy
                ? "Synthesizing across recent wiki updates..."
                : `Get AI synthesis across these wiki updates (${costStr} on your API key)`
              : "AI synthesis is opt-in (V23.5 C-3, not yet enabled)"
          }
          style={{
            fontSize: 12,
            padding: "4px 10px",
            border: "1px solid var(--fg3, #ccc)",
            borderRadius: 4,
            background: synthesisEnabled && !busy ? "var(--bg2)" : "transparent",
            color: "var(--fg2)",
            cursor: buttonDisabled ? "not-allowed" : "pointer",
            opacity: buttonDisabled ? 0.55 : 1,
            fontFamily: "inherit",
          }}
        >
          {busy ? "Synthesizing…" : "📝 Get AI synthesis"}
        </button>
      </header>

      {/* C-4: render the LLM synthesis above the card list when present. On
          any degrade path we render nothing here and let the C-1 cards below
          be the user-facing fallback (constraint a). */}
      {synthesis && (
        <div
          role="region"
          aria-label="AI synthesis of recent wiki updates"
          style={{
            border: "1px solid var(--fg3, #ddd)",
            borderLeft: "3px solid var(--accent, #4f46e5)",
            borderRadius: 6,
            padding: "10px 12px",
            background: "var(--bg2)",
            marginBottom: 12,
          }}
        >
          <strong
            style={{ fontSize: 12, color: "var(--fg2)", display: "block", marginBottom: 6 }}
          >
            📝 AI synthesis
          </strong>
          <p
            style={{
              fontSize: 13,
              color: "var(--fg1)",
              margin: 0,
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {synthesis}
          </p>
          <small style={{ display: "block", marginTop: 6, color: "var(--fg3)", fontSize: 11 }}>
            Powered by your configured LLM API key.
          </small>
        </div>
      )}
      {/* When a synthesis attempt was made but degraded, show a low-key
          one-liner so the operator knows why the cards are the only output.
          We never surface raw provider errors — just the stable reason
          string from the bridge (constraint d). */}
      {!synthesis && degradeReason && (
        <p
          style={{
            fontSize: 12,
            color: "var(--fg3)",
            margin: "0 0 12px",
            fontStyle: "italic",
          }}
        >
          Synthesis unavailable ({degradeReason}). Showing recent updates below.
        </p>
      )}
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
