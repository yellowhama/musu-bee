"use client";
import { getBridgeUrl } from '../../lib/bridge-config';

// V23.4 T2-C — Fleet view. Repointed in F-3 (HIGH-1, Option A) from the phantom
// `GET /api/machines` (musu-bridge Python shape, never implemented in musu-rs —
// the page 404'd) to the EXISTING `GET /api/fleet/status` (musu-rs
// fleet.rs:fleet_status, returns FleetDashboard).
//
// Single-file client component: inline StatusDot, PcStatusCard, AddPcWizard +
// main FleetPage. Mirrors the single-file convention of `/c/[id]/page.tsx` and
// `/m/[id]/page.tsx`.
//
// Vocab discipline (no K8s leakage; see [[feedback-no-yagni-architecture]]):
//   musu uses PC + peer + workflow + capacity + pairing.
//
// Data source: bridge `GET /api/fleet/status` returns the FleetDashboard:
//   { this_node: FleetNodeStatus, peers: FleetNodeStatus[],
//     total_nodes, online_nodes, total_tasks_running, total_tasks_pending }
// where FleetNodeStatus = { name, addr, healthy, reachable_via?, is_self,
//   last_seen?, status_error?, tasks_running, tasks_pending, shared_dirs[],
//   version, ... }. `reachable_via` is "direct" | "relay" | absent. A node with
//   healthy=false but reachable_via="relay" has recent relay-display evidence
//   and is shown as a distinct yellow "relay" state, but is not counted in
//   online_nodes until direct or proven relay transport is available.
//
// FleetNodeStatus carries NO GPU/CPU/memory capacity (that lived only in the old
// Python machine shape), so the capacity bars are dropped here rather than
// fabricated. Per-node load is shown via tasks_running / tasks_pending instead.
//
// Refresh: low-duty 30s polling (useLowDutyPolling). The old EventSource
// subscription to `/api/watch/subscribe?table=machines` is removed — that
// endpoint does not exist in musu-rs, so it only produced errors. Fleet status
// is slow-moving; polling covers it.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DoctorStatusCard from "../../components/DoctorStatusCard";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";
import {
  type FleetNodeStatus,
  type FleetDashboard,
  type NodeState,
  nodeState,
  stateLabel,
} from "@/lib/fleetState";

const BRIDGE_URL = getBridgeUrl();
const REFRESH_INTERVAL = 30_000;

// ---- Types -----------------------------------------------------------------
// FleetNodeStatus / FleetDashboard / NodeState + nodeState()/stateLabel() now
// live in @/lib/fleetState (shared with /m/[id] so the 3-state derivation cannot
// drift between web surfaces). Page-local types stay here.

interface AgentSummary {
  id: string;
  name: string;
}

// ---- Inline primitives (StatusDot) ----------------------------------------

function StatusDot({ state }: { state: NodeState }) {
  const color =
    state === "online"
      ? "var(--status-online)"
      : state === "relay"
        ? "var(--status-warn)"
        : "var(--status-error)";
  return (
    <span
      aria-label={`status-${state}`}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
        boxShadow: `0 0 6px ${color}40`,
      }}
    />
  );
}

// ---- PcStatusCard ---------------------------------------------------------

function PcStatusCard({ node }: { node: FleetNodeStatus }) {
  const router = useRouter();
  const state = nodeState(node);

  return (
    <div
      data-testid={`pc-${node.name}`}
      onClick={() => router.push(`/m/${encodeURIComponent(node.name)}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/m/${encodeURIComponent(node.name)}`);
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--musu-color-brand-accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <StatusDot state={state} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: "var(--fg1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.name}
              {node.is_self && (
                <span style={{ fontSize: 11, color: "var(--fg3)", fontWeight: 400 }}>
                  {" "}
                  (this PC)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }}>
              {node.addr} · {stateLabel(state)}
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            background: "var(--accent-muted)",
            color: "var(--musu-color-brand-accent)",
            padding: "3px 8px",
            borderRadius: 4,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {stateLabel(state)}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "var(--fg2)",
        }}
      >
        <span>{node.tasks_running} running</span>
        <span>{node.tasks_pending} pending</span>
        <span>
          {node.shared_dirs.length} dir{node.shared_dirs.length === 1 ? "" : "s"} shared
        </span>
      </div>

      {state === "relay" && (
        <div style={{ fontSize: 11, color: "var(--status-warn)", marginTop: 8 }}>
          Recent relay heartbeat; direct route not proven.
        </div>
      )}
      {state === "offline" && node.status_error && (
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 8 }}>
          {node.status_error}
        </div>
      )}
    </div>
  );
}

// ---- AddPcWizard ----------------------------------------------------------

function AddPcWizard({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [agentsList, setAgentsList] = useState<AgentSummary[] | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsFallback, setAgentsFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per OQ-CRIT-2: fetch agents list on modal open. 503 → free-text fallback.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setName("");
    setUrl("");
    setAgents([]);
    setError(null);
    setAgentsLoading(true);
    setAgentsFallback(false);
    (async () => {
      try {
        // WS-A A-1: use the Next proxy route (relative), not the bridge directly.
        // `${BRIDGE_URL}/api/agents` is the retired Python-era shape; the canonical
        // surface is the local `/api/agents` route handler.
        const res = await fetch(`/api/agents`);
        if (!alive) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Array<{ id: string; name: string }>;
        if (!alive) return;
        setAgentsList(data.map((a) => ({ id: a.id, name: a.name })));
        setAgentsFallback(false);
      } catch {
        if (!alive) return;
        setAgentsList(null);
        setAgentsFallback(true);
      } finally {
        if (alive) setAgentsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // WS-A A-1: route through the canonical Next proxy `/api/nodes/pair`
      // (→ bridge `POST /api/nodes/add`, NodeAddRequest{name,url,tailscale_ip?,agents}).
      // The old `${BRIDGE_URL}/api/admin/pair/accept` is a Python-era path musu-rs
      // never served (the wizard's name+url+agents IS the node-add operation).
      // Body keys stay ["name","url","agents"] — already matches NodeAddRequest.
      const body = { name, url, agents };
      const res = await fetch(`/api/nodes/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add PC"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 24,
          color: "var(--fg1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
          Add a PC
        </h2>
        <p style={{ margin: 0, marginBottom: 16, fontSize: 12, color: "var(--fg3)" }}>
          Pair a new PC with this fleet. The PC must already be running a
          musu-bridge instance.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid var(--status-error)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--status-error)",
            }}
          >
            {error}
          </div>
        )}

        <label style={fieldLabel}>PC name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="workstation-1"
          disabled={submitting}
          style={fieldInput}
        />

        <label style={fieldLabel}>Bridge URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.10:8070"
          disabled={submitting}
          style={fieldInput}
        />

        <label style={fieldLabel}>Agents</label>
        {agentsLoading && (
          <div style={{ fontSize: 12, color: "var(--fg3)", padding: "6px 0" }}>
            Loading agents...
          </div>
        )}
        {!agentsLoading && agentsFallback && (
          <>
            <div
              style={{
                background: "var(--accent-tint)",
                border: "1px solid var(--status-warn)",
                borderRadius: 6,
                padding: "8px 10px",
                marginBottom: 8,
                fontSize: 12,
                color: "var(--status-warn)",
              }}
            >
              Agents list unavailable, enter comma-separated ids.
            </div>
            <input
              type="text"
              placeholder="agent-id-1, agent-id-2"
              disabled={submitting}
              onChange={(e) =>
                setAgents(
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              style={fieldInput}
            />
          </>
        )}
        {!agentsLoading && !agentsFallback && agentsList && (
          <select
            multiple
            value={agents}
            onChange={(e) =>
              setAgents(
                Array.from(e.target.selectedOptions, (o) => o.value),
              )
            }
            disabled={submitting}
            style={{ ...fieldInput, minHeight: 100, padding: 8 }}
          >
            {agentsList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id})
              </option>
            ))}
          </select>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              color: "var(--fg2)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name || !url}
            style={{
              padding: "8px 16px",
              background: "var(--musu-color-brand-accent)",
              border: "none",
              borderRadius: 6,
              color: "var(--fg-on-accent)",
              cursor: submitting || !name || !url ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 13,
              opacity: submitting || !name || !url ? 0.5 : 1,
            }}
          >
            {submitting ? "Pairing..." : "Pair PC"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- FleetPage (main) -----------------------------------------------------

export default function FleetPage() {
  const [nodes, setNodes] = useState<FleetNodeStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const fetchInFlightRef = useRef(false);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const resp = await fetch(`${BRIDGE_URL}/api/fleet/status`, { signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dashboard = (await resp.json()) as FleetDashboard;
      if (signal?.aborted) return;
      // this_node first, then peers — self always leads the list.
      const all = dashboard.this_node
        ? [dashboard.this_node, ...(dashboard.peers || [])]
        : dashboard.peers || [];
      setNodes(all);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Failed to fetch");
      if (signal) throw e;
    } finally {
      fetchInFlightRef.current = false;
    }
  }, []);

  useLowDutyPolling(fetchData, { intervalMs: REFRESH_INTERVAL });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg1)",
        fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
        padding: "32px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg3)",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Fleet view
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 0" }}>
            Your PCs
          </h1>
          {lastUpdated && (
            <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
              Last updated: {lastUpdated} (auto-refresh{" "}
              {REFRESH_INTERVAL / 1000}s)
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            padding: "10px 18px",
            background: "var(--musu-color-brand-accent)",
            border: "none",
            borderRadius: 8,
            color: "var(--fg-on-accent)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          + Add a PC
        </button>
      </header>

      <DoctorStatusCard />

      {error && (
        <div
          role="alert"
          style={{
            background: "var(--bg-card)",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
            color: "var(--status-error)",
            fontSize: 13,
          }}
        >
          Bridge unreachable: {error}
        </div>
      )}

      {nodes.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {nodes.map((n) => (
            <PcStatusCard key={n.name} node={n} />
          ))}
        </div>
      ) : !error ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px dashed var(--border-default)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--fg3)",
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 6 }}>No PCs paired yet.</div>
          <div style={{ fontSize: 12 }}>
            Click <strong>Add a PC</strong> to pair your first PC.
          </div>
        </div>
      ) : null}

      <AddPcWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          void fetchData();
        }}
      />
    </div>
  );
}

// ---- Shared inline styles -------------------------------------------------

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--fg3)",
  marginBottom: 4,
  marginTop: 8,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  color: "var(--fg1)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
