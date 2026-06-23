"use client";

// Machine detail page (/m/[id]). WS-A A-2: repointed off the retired Python-era
// `GET /api/machines/{id}` (musu-bridge shape, never served by musu-rs) onto the
// real `GET /api/fleet/status` (FleetDashboard), filtered by node NAME — the
// route param `id` IS the node name (the fleet page links `/m/${node.name}`;
// FleetNodeStatus has no separate id field).
//
// The 3-state (online / relay / offline) derivation is imported from
// @/lib/fleetState — the SAME helper the /fleet page uses, so the two web
// surfaces cannot drift (THREE-surface invariant; see
// docs/FLEET_RETRY_AND_LAST_SEEN_CONTRACT_2026_06_12.md).
//
// FleetNodeStatus carries no GPU/CPU/mem capacity and no active-requests list
// (those were Python-era fields), so the old Capacity bars + Active-requests
// section are gone. Refresh is 30s low-duty polling; the old
// `/api/watch/subscribe?table=machines|resource_requests` EventSources are
// removed (those watch tables do not exist in musu-rs — they only errored).

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";
import { getBridgeUrl } from "@/lib/bridge-config";
import {
  type FleetDashboard,
  type FleetNodeStatus,
  nodeState,
  stateLabel,
} from "@/lib/fleetState";

const BRIDGE_URL = getBridgeUrl();
const REFRESH_INTERVAL = 30_000;

function StatusDot({ node }: { node: FleetNodeStatus }) {
  const state = nodeState(node);
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

export default function MachinePage() {
  const params = useParams<{ id: string }>();
  const machineId = params?.id || "";
  const [node, setNode] = useState<FleetNodeStatus | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const fetchInFlightRef = useRef(false);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!machineId) return;
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      try {
        const resp = await fetch(`${BRIDGE_URL}/api/fleet/status`, { signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const dash = (await resp.json()) as FleetDashboard;
        if (signal?.aborted) return;
        // The route param is the node name. Match against this_node + peers.
        const all = [dash.this_node, ...dash.peers];
        const match = all.find((n) => n.name === machineId) ?? null;
        setNode(match);
        setNotFound(match === null);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Failed to fetch");
        if (signal) throw e;
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [machineId],
  );

  useLowDutyPolling(fetchData, {
    enabled: Boolean(machineId),
    intervalMs: REFRESH_INTERVAL,
  });

  const state = node ? nodeState(node) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg1)",
        fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
        padding: "32px 24px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 1 }}>
              Machine axis · /m/{machineId}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 0", display: "flex", alignItems: "center" }}>
              {node ? <StatusDot node={node} /> : null}
              {node?.name || machineId}
            </h1>
            {node && state && (
              <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
                {node.addr} · v{node.version} · state:{" "}
                <strong style={{ color: "var(--fg1)" }}>{stateLabel(state)}</strong>
                {node.is_self && <> · this PC</>}
              </div>
            )}
            {lastUpdated && (
              <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
                Last updated: {lastUpdated} (auto-refresh {REFRESH_INTERVAL / 1000}s)
              </div>
            )}
          </div>
          <button
            onClick={() => (window.location.href = `/m/${machineId}/workstation`)}
            style={{
              background: "var(--musu-color-brand-accent)",
              color: "var(--fg-on-accent)",
              border: "none",
              borderRadius: 6,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 0 16px rgba(255,166,2,0.15)",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(255,166,2,0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "none";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px rgba(255,166,2,0.15)";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Open Workstation
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            background: "var(--bg-card)",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 24,
            color: "var(--status-error)",
          }}
        >
          Bridge unreachable: {error}
        </div>
      )}

      {notFound && !error && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 24,
            color: "var(--fg3)",
            fontSize: 13,
          }}
        >
          No node named <strong style={{ color: "var(--fg1)" }}>{machineId}</strong> in
          the current fleet. It may be offline or removed.{" "}
          <a href="/fleet" style={{ color: "var(--musu-color-brand-accent)" }}>
            Back to fleet
          </a>
        </div>
      )}

      {node && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeader}>Status</h2>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "20px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
            }}
          >
            <Stat label="Tasks running" value={String(node.tasks_running)} />
            <Stat label="Tasks pending" value={String(node.tasks_pending)} />
            <Stat
              label="Reachable via"
              value={node.reachable_via ?? (node.healthy ? "direct" : "—")}
            />
            <Stat label="Last seen" value={node.last_seen ?? "—"} />
            {node.status_error && (
              <Stat label="Probe error" value={node.status_error} />
            )}
          </div>
        </section>
      )}

      {node && node.shared_dirs.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeader}>Shared directories</h2>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "16px 20px",
              fontSize: 13,
              color: "var(--fg2)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {node.shared_dirs.map((d) => (
              <span key={d} style={{ fontFamily: "monospace" }}>
                {d}
              </span>
            ))}
          </div>
        </section>
      )}

      {!node && !error && !notFound && (
        <div style={{ color: "var(--fg3)", textAlign: "center", padding: 48 }}>Loading...</div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg1)", marginTop: 4, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  color: "var(--fg2)",
  marginBottom: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
};
