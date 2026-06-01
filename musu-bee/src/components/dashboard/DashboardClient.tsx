"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RegistryNode } from "@/lib/types/node";
import { useConsoleShell } from "@/components/console/ConsoleShellContext";
import { NodeCard, nodeDisplayStatus, relativeTime } from "./NodeCard";
import { AgentGrid, CANONICAL_TEAM_SIZE } from "./AgentGrid";
import type { Agent } from "./AgentGrid";
import { ActivityFeed } from "./ActivityFeed";
import type { BridgeTask } from "./ActivityFeed";
import CompanySelector from "./CompanySelector";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

// ---- Watchdog types ----

interface WatchdogInfo {
  bridge_running: boolean;
  connectsd_ok: boolean;
}

// ---- WS relay types ----

type WsStatus = "idle" | "connecting" | "connected" | "error";

interface RelayTokenResponse {
  token: string;
  relay_ws_url: string;
}

const DASHBOARD_REFRESH_VISIBLE_MS = 30_000;
const DASHBOARD_REFRESH_HIDDEN_MS = 120_000;
const WATCHDOG_FETCH_TIMEOUT_MS = 5_000;
const DASHBOARD_REFRESH_TIMEOUT_MS = 10_000;
const RELAY_TOKEN_FETCH_TIMEOUT_MS = 5_000;

function boundedAbortSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

// ---- Section label ----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 800,
        color: "rgba(253,251,247,0.35)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
        marginBottom: "10px",
      }}
    >
      {children}
    </div>
  );
}

// ---- Runs/costs types ----

interface CostSummary { total_requests: number; by_status: Record<string, number>; period: string }
interface AgentCost { agent_name: string; total_requests: number; done: number; failed: number }

// ---- Main ----

interface Props {
  nodes: RegistryNode[];
}

export default function DashboardClient({ nodes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setActiveNode } = useConsoleShell();

  const nodeFromUrl = searchParams?.get("node");
  const initialNode =
    nodeFromUrl && nodes.find((n) => n.node_name === nodeFromUrl)
      ? nodeFromUrl
      : (nodes[0]?.node_name ?? "");

  const [selectedNode, setSelectedNode] = useState<string>(initialNode);

  useEffect(() => {
    if (initialNode) setActiveNode(initialNode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectNode = useCallback(
    (name: string) => {
      setSelectedNode(name);
      setActiveNode(name);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (name) params.set("node", name);
      else params.delete("node");
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, setActiveNode]
  );

  const [activeTab, setActiveTab] = useState<"agents" | "runs">("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentOverrides, setAgentOverrides] = useState<Map<string, Partial<Agent>>>(new Map());
  const [tasks, setTasks] = useState<BridgeTask[]>([]);
  const [agentsErr, setAgentsErr] = useState<string | null>(null);
  const [tasksErr, setTasksErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ---- Runs/costs state ----
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [agentCosts, setAgentCosts] = useState<AgentCost[]>([]);

  // ---- Watchdog state ----
  const [watchdogStatus, setWatchdogStatus] = useState<Map<string, WatchdogInfo>>(new Map());
  const [watchdogCmds, setWatchdogCmds] = useState<Map<string, string>>(new Map());

  // ---- Auto-update state: node_name → "idle" | "updating" | "ok" | "error" ----
  const [updateState, setUpdateState] = useState<Map<string, string>>(new Map());

  // ---- Relay WS — auto-connect + auto-reconnect ----
  const [relayInfo, setRelayInfo] = useState<RelayTokenResponse | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 5000;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/relay-token", {
      signal: boundedAbortSignal(controller.signal, RELAY_TOKEN_FETCH_TIMEOUT_MS),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RelayTokenResponse | null) => { if (!controller.signal.aborted && data) setRelayInfo(data); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const clearRetry = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
  }, []);

  const connectRelay = useCallback((relayInfoArg: RelayTokenResponse, node: string) => {
    if (typeof window === "undefined") return;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    clearRetry();
    setWsStatus("connecting");
    setWsError(null);
    const url = `${relayInfoArg.relay_ws_url}/ws-proxy/${encodeURIComponent(node)}/?token=${encodeURIComponent(relayInfoArg.token)}`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        retryCountRef.current = 0;
        setWsStatus("connected");
        setWsError(null);
      };
      ws.onerror = () => { /* onclose fires after onerror */ };
      ws.onclose = (e) => {
        wsRef.current = null;
        if (e.code === 1000) {
          setWsStatus("idle");
          return;
        }
        const msg = e.code === 1006 ? "musu-bridge offline" : `Closed (${e.code})`;
        setWsStatus("error");
        setWsError(msg);
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          retryRef.current = setTimeout(() => connectRelay(relayInfoArg, node), RETRY_DELAY_MS);
        }
      };
    } catch (err) {
      console.error("Relay WS init error:", err);
      setWsStatus("error");
      setWsError("Connection failed");
    }
  }, [clearRetry]);

  const disconnectRelay = useCallback(() => {
    if (typeof window === "undefined") return;
    clearRetry();
    retryCountRef.current = MAX_RETRIES; // prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setWsStatus("idle");
    setWsError(null);
  }, [clearRetry]);

  // Auto-connect when relayInfo + selectedNode are ready
  useEffect(() => {
    if (!relayInfo || !selectedNode) return;
    retryCountRef.current = 0;
    connectRelay(relayInfo, selectedNode);
    return () => {
      clearRetry();
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [relayInfo, selectedNode]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    // Agents: fetch from selected node, try company-scoped first
    if (!selectedNode) { setLoading(false); setLastRefresh(new Date()); return; }
    const nodeQ = `node=${encodeURIComponent(selectedNode)}`;

    // Try to get active company for this node
    let activeCompanyId: string | null = null;
    try {
      const wsRes = await fetch(`/api/bridge/workspace?${nodeQ}`, { signal });
      if (wsRes.ok) {
        const ws = await wsRes.json() as { active_company_id?: string };
        if (ws.active_company_id) activeCompanyId = ws.active_company_id;
      }
    } catch { /* ignore */ }

    // Fetch agents: company-scoped endpoint if available, fallback to global
    let agentUrl = `/api/bridge/agents?${nodeQ}`;
    if (activeCompanyId) {
      agentUrl = `/api/bridge/companies/${encodeURIComponent(activeCompanyId)}/agents?${nodeQ}`;
    }
    try {
      const agentRes = await fetch(agentUrl, { signal });
      if (agentRes.ok) {
        const data: unknown = await agentRes.json();
        if (Array.isArray(data)) {
          const STATUS_RANK: Record<string, number> = { active: 0, paused: 1, error: 2 };
          const sorted = (data as Agent[]).sort(
            (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3)
          );
          setAgents(sorted.slice(0, CANONICAL_TEAM_SIZE));
          setAgentOverrides(new Map());
          setAgentsErr(null);
        }
      } else {
        setAgentsErr("Could not load agents");
      }
    } catch {
      setAgentsErr("Could not load agents");
    }

    // Tasks: fetch from selected node only
    if (!selectedNode) { setLoading(false); setLastRefresh(new Date()); return; }
    const q = `?node=${encodeURIComponent(selectedNode)}`;
    const tasksRes = await fetch(`/api/bridge/tasks${q}&limit=20`, { signal }).catch(() => null);
    if (tasksRes?.ok) {
      const data: unknown = await tasksRes.json();
      setTasks(Array.isArray(data) ? (data as BridgeTask[]) : ((data as { tasks?: BridgeTask[] })?.tasks ?? []));
      setTasksErr(null);
    } else {
      setTasksErr(tasksRes ? `${tasksRes.status}` : "offline");
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, [selectedNode]);

  // ---- Runs/costs polling ----
  const fetchRuns = useCallback(async (node: string, signal?: AbortSignal) => {
    if (!node) return;
    const [summaryRes, byAgentRes] = await Promise.all([
      fetch(`/api/bridge/costs/summary?node=${encodeURIComponent(node)}`, { cache: "no-store", signal }).catch(() => null),
      fetch(`/api/bridge/costs/by-agent?node=${encodeURIComponent(node)}`, { cache: "no-store", signal }).catch(() => null),
    ]);
    if (summaryRes?.ok) {
      const data = await summaryRes.json() as CostSummary;
      setCostSummary(data);
    }
    if (byAgentRes?.ok) {
      const data = await byAgentRes.json() as AgentCost[];
      setAgentCosts(data);
    }
  }, []);

  // ---- Optimistic agent update ----
  const handleAgentUpdated = useCallback((agentId: string, patch: Partial<Agent>) => {
    setAgentOverrides((prev) => {
      const next = new Map(prev);
      next.set(agentId, { ...(prev.get(agentId) ?? {}), ...patch });
      return next;
    });
  }, []);

  // ---- Watchdog polling ----
  const fetchWatchdogAll = useCallback(async (signal?: AbortSignal) => {
    const updates = new Map<string, WatchdogInfo>();
    await Promise.allSettled(
      nodes.map(async (n) => {
        try {
          const res = await fetch(
            `/api/bridge/watchdog?node=${encodeURIComponent(n.node_name)}`,
            { signal: boundedAbortSignal(signal, WATCHDOG_FETCH_TIMEOUT_MS) }
          ).catch(() => null);
          if (res?.ok) {
            const data = (await res.json()) as WatchdogInfo;
            updates.set(n.node_name, data);
          } else {
            updates.set(n.node_name, { bridge_running: false, connectsd_ok: false });
          }
        } catch {
          updates.set(n.node_name, { bridge_running: false, connectsd_ok: false });
        }
      })
    );
    setWatchdogStatus(updates);
  }, [nodes]);

  const sendWatchdogCmd = useCallback(async (nodeName: string, command: string) => {
    setWatchdogCmds((prev) => new Map(prev).set(nodeName, command));
    try {
      await fetch(
        `/api/bridge/watchdog?node=${encodeURIComponent(nodeName)}&cmd=${encodeURIComponent(command)}`,
        { method: "POST" }
      ).catch(() => null);
      // Re-poll status after a short delay to reflect the change
      setTimeout(() => fetchWatchdogAll(), 2000);
    } finally {
      setWatchdogCmds((prev) => {
        const next = new Map(prev);
        next.delete(nodeName);
        return next;
      });
    }
  }, [fetchWatchdogAll]);

  const sendUpdate = useCallback(async (nodeName: string) => {
    setUpdateState((prev) => new Map(prev).set(nodeName, "updating"));
    try {
      const res = await fetch(`/api/bridge/system/update?node=${encodeURIComponent(nodeName)}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({})) as { exit_code?: number; output?: string };
      const ok = res.ok && (data.exit_code === 0 || data.exit_code == null);
      setUpdateState((prev) => new Map(prev).set(nodeName, ok ? "ok" : "error"));
      // Reset icon after 4s
      setTimeout(() => setUpdateState((prev) => {
        const next = new Map(prev);
        next.delete(nodeName);
        return next;
      }), 4000);
    } catch {
      setUpdateState((prev) => new Map(prev).set(nodeName, "error"));
      setTimeout(() => setUpdateState((prev) => {
        const next = new Map(prev);
        next.delete(nodeName);
        return next;
      }), 4000);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setAgents([]);
    setTasks([]);
    setAgentsErr(null);
    setTasksErr(null);
  }, [selectedNode]);

  const refreshDashboard = useCallback(
    async (signal: AbortSignal) => {
      await Promise.allSettled([
        fetchAll(signal),
        fetchWatchdogAll(signal),
        selectedNode ? fetchRuns(selectedNode, signal) : Promise.resolve(),
      ]);
    },
    [fetchAll, fetchWatchdogAll, fetchRuns, selectedNode]
  );

  useLowDutyPolling(refreshDashboard, {
    intervalMs: DASHBOARD_REFRESH_VISIBLE_MS,
    maxBackoffMs: DASHBOARD_REFRESH_HIDDEN_MS,
    taskTimeoutMs: DASHBOARD_REFRESH_TIMEOUT_MS,
  });

  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "28px",
        color: "var(--fg1)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        paddingBottom: "calc(48px + env(safe-area-inset-bottom))",
      }}
    >
      {/* Summary bar */}
      {(() => {
        const online = nodes.filter((n) => nodeDisplayStatus(n) === "online").length;
        // Count active among canonical team only (by matching id/name)
        const canonicalIds = new Set(["ceo","cto","cos","engineer","qa","vp"]);
        const activeAgents = agents.filter(a =>
          (a.status === "active") && canonicalIds.has((a.id ?? a.name ?? "").toLowerCase())
        ).length;
        return (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "10px",
            padding: "10px 16px",
            flexWrap: "wrap",
            gap: "12px",
          }}>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <span style={{ color: "rgba(253,251,247,0.5)", fontSize: "12px" }}>
                <span style={{ color: online > 0 ? "#22c55e" : "rgba(253,251,247,0.3)", fontWeight: 700 }}>{online}</span>
                <span style={{ color: "rgba(253,251,247,0.3)" }}>/{nodes.length} nodes online</span>
              </span>
              <span style={{ color: "rgba(253,251,247,0.5)", fontSize: "12px" }}>
                <span style={{ color: activeAgents > 0 ? "var(--accent)" : "rgba(253,251,247,0.3)", fontWeight: 700 }}>{activeAgents}</span>
                <span style={{ color: "rgba(253,251,247,0.3)" }}>/{CANONICAL_TEAM_SIZE} team active</span>
              </span>
              {tasks.length > 0 && (
                <span style={{ color: "rgba(253,251,247,0.3)", fontSize: "12px" }}>
                  {`${tasks.length} tasks`}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ color: "rgba(253,251,247,0.2)", fontSize: "11px" }}>
                {lastRefresh ? `updated ${relativeTime(lastRefresh.toISOString())}` : ""}
              </span>
              <button
                onClick={() => void fetchAll()}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  padding: "5px 12px",
                  color: "rgba(253,251,247,0.5)",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Refresh
              </button>
            </div>
          </div>
        );
      })()}

      {/* Company Selector */}
      {selectedNode && (
        <section style={{ marginBottom: "16px" }}>
          <CompanySelector onlineNode={selectedNode} />
        </section>
      )}

      {/* Nodes grid */}
      <section>
        <SectionLabel>Nodes ({nodes.length})</SectionLabel>
        {nodes.length === 0 ? (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "12px",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <div style={{ color: "rgba(253,251,247,0.4)", fontSize: "14px", marginBottom: "10px" }}>
              No nodes connected
            </div>
            <code style={{ color: "var(--accent)", fontSize: "12px" }}>musu-bridge start</code>
            <span style={{ color: "rgba(253,251,247,0.3)", fontSize: "12px" }}> to connect</span>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "10px",
            }}
          >
            {nodes.map((n) => {
              const wd = watchdogStatus.get(n.node_name);
              const cmdInFlight = watchdogCmds.get(n.node_name);
              const canStart = wd && !wd.bridge_running && wd.connectsd_ok;
              const canCleanup = wd?.bridge_running;
              const canStop = wd?.bridge_running && wd.connectsd_ok;
              const updState = updateState.get(n.node_name);
              return (
                <div key={n.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <NodeCard
                    node={n}
                    selected={selectedNode === n.node_name}
                    onSelect={selectNode}
                  />
                  {/* Watchdog controls */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 2px" }}>
                    {/* connectsd dot */}
                    <span
                      title={wd ? (wd.connectsd_ok ? "connectsd online" : "connectsd offline") : "watchdog status unknown"}
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: wd
                          ? (wd.connectsd_ok ? "#22c55e" : "rgba(253,251,247,0.2)")
                          : "rgba(253,251,247,0.1)",
                        display: "inline-block",
                      }}
                    />
                    <span style={{ fontSize: "10px", color: "rgba(253,251,247,0.25)", flexShrink: 0 }}>
                      {wd ? (wd.connectsd_ok ? "sidecar" : "no sidecar") : "…"}
                    </span>
                    {canStart && (
                      <button
                        disabled={!!cmdInFlight}
                        onClick={() => sendWatchdogCmd(n.node_name, "bridge:start")}
                        style={{
                          marginLeft: "auto",
                          background: "transparent",
                          border: "1px solid rgba(34,197,94,0.4)",
                          borderRadius: "5px",
                          padding: "2px 8px",
                          color: "#22c55e",
                          fontSize: "10px",
                          cursor: cmdInFlight ? "wait" : "pointer",
                          fontFamily: "inherit",
                          opacity: cmdInFlight ? 0.5 : 1,
                        }}
                      >
                        {cmdInFlight === "bridge:start" ? "…" : "Start bridge"}
                      </button>
                    )}
                    {canStop && !canStart && (
                      <button
                        disabled={!!cmdInFlight}
                        onClick={() => sendWatchdogCmd(n.node_name, "bridge:restart")}
                        style={{
                          marginLeft: "auto",
                          background: "transparent",
                          border: "1px solid rgba(255,166,2,0.3)",
                          borderRadius: "5px",
                          padding: "2px 8px",
                          color: "rgba(255,166,2,0.7)",
                          fontSize: "10px",
                          cursor: cmdInFlight ? "wait" : "pointer",
                          fontFamily: "inherit",
                          opacity: cmdInFlight ? 0.5 : 1,
                        }}
                      >
                        {cmdInFlight === "bridge:restart" ? "…" : "Restart"}
                      </button>
                    )}
                    {canCleanup && (
                      <button
                        disabled={!!cmdInFlight}
                        onClick={() => sendWatchdogCmd(n.node_name, "agents:cleanup")}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "5px",
                          padding: "2px 8px",
                          color: "rgba(253,251,247,0.35)",
                          fontSize: "10px",
                          cursor: cmdInFlight ? "wait" : "pointer",
                          fontFamily: "inherit",
                          opacity: cmdInFlight ? 0.5 : 1,
                        }}
                      >
                        {cmdInFlight === "agents:cleanup" ? "…" : "Clean agents"}
                      </button>
                    )}
                    {/* Auto-update button */}
                    <button
                      disabled={updState === "updating"}
                      onClick={() => sendUpdate(n.node_name)}
                      title="git pull + restart services (if changed)"
                      style={{
                        marginLeft: canCleanup || canStart || canStop ? undefined : "auto",
                        background: "transparent",
                        border: `1px solid ${updState === "ok" ? "rgba(34,197,94,0.4)" : updState === "error" ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: "5px",
                        padding: "2px 8px",
                        color: updState === "ok" ? "#22c55e" : updState === "error" ? "#ef4444" : "rgba(253,251,247,0.25)",
                        fontSize: "10px",
                        cursor: updState === "updating" ? "wait" : "pointer",
                        fontFamily: "inherit",
                        opacity: updState === "updating" ? 0.5 : 1,
                      }}
                    >
                      {updState === "updating" ? "…" : updState === "ok" ? "✓" : updState === "error" ? "✗" : "↑"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Management team / Runs — tab-switched */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          {(["agents", "runs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "2px 10px",
                borderRadius: "5px",
                border: activeTab === tab ? "1px solid rgba(255,166,2,0.4)" : "1px solid rgba(255,255,255,0.08)",
                background: activeTab === tab ? "rgba(255,166,2,0.08)" : "transparent",
                color: activeTab === tab ? "var(--accent)" : "rgba(253,251,247,0.35)",
                fontSize: "11px",
                fontWeight: 800,
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab === "agents" ? `Team (${CANONICAL_TEAM_SIZE})` : "Runs"}
            </button>
          ))}
        </div>

        {activeTab === "agents" && (
          <AgentGrid
            agents={agents.map((a) => ({ ...a, ...(agentOverrides.get(a.id) ?? {}) }))}
            loading={loading && agents.length === 0}
            error={agentsErr}
            onAgentUpdated={handleAgentUpdated}
          />
        )}

        {activeTab === "runs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Cost summary */}
            {costSummary && (
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { label: "Total", value: costSummary.total_requests, color: "rgba(253,251,247,0.7)" },
                  { label: "Done", value: costSummary.by_status["done"] ?? 0, color: "#22c55e" },
                  { label: "Failed", value: costSummary.by_status["failed"] ?? 0, color: "#ff6b6b" },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: "10px",
                      padding: "10px 16px",
                      minWidth: 80,
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "rgba(253,251,247,0.35)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color }}>{value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Per-agent table */}
            {agentCosts.length > 0 && (
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {["Agent", "Total", "Done", "Failed"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: h === "Agent" ? "left" : "right",
                            color: "rgba(253,251,247,0.35)",
                            fontWeight: 700,
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agentCosts.map((row) => (
                      <tr
                        key={row.agent_name}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      >
                        <td style={{ padding: "7px 12px", color: "var(--fg1)", fontWeight: 600 }}>
                          {row.agent_name}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", color: "rgba(253,251,247,0.6)" }}>
                          {row.total_requests}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", color: "#22c55e" }}>
                          {row.done}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", color: row.failed > 0 ? "#ff6b6b" : "rgba(253,251,247,0.3)" }}>
                          {row.failed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!costSummary && (
              <div style={{ color: "rgba(253,251,247,0.3)", fontSize: "13px", padding: "12px 0" }}>
                No run data — select an online node to load.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Activity feed */}
      {selectedNode && (
        <section>
          <SectionLabel>Recent tasks — {selectedNode} ({tasks.length})</SectionLabel>
          <ActivityFeed
            tasks={tasks}
            loading={loading}
            error={tasksErr}
            nodeName={selectedNode}
          />
        </section>
      )}

      {/* Relay WS */}
      {selectedNode && relayInfo && (
        <section>
          <SectionLabel>Cloud relay — {selectedNode}</SectionLabel>
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${wsStatus === "connected" ? "rgba(111,207,151,0.2)" : wsStatus === "error" ? "rgba(255,107,107,0.2)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color:
                    wsStatus === "connected" ? "#6fcf97"
                    : wsStatus === "connecting" ? "var(--accent)"
                    : wsStatus === "error" ? "#ff6b6b"
                    : "rgba(253,251,247,0.3)",
                }}
              >
                ●{" "}
                {wsStatus === "connected" && "Connected"}
                {wsStatus === "connecting" && "Connecting…"}
                {wsStatus === "error" && (wsError ?? "Error")}
                {wsStatus === "idle" && "Idle"}
              </span>
              {wsStatus === "error" && retryCountRef.current < MAX_RETRIES && (
                <span style={{ color: "rgba(253,251,247,0.3)", fontSize: "11px" }}>
                  {`Retrying in ${RETRY_DELAY_MS / 1000}s… (${retryCountRef.current}/${MAX_RETRIES})`}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {wsStatus === "error" && retryCountRef.current >= MAX_RETRIES && (
                <button
                  onClick={() => { retryCountRef.current = 0; connectRelay(relayInfo, selectedNode); }}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--accent)",
                    borderRadius: "6px",
                    padding: "5px 14px",
                    color: "var(--accent)",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 700,
                  }}
                >
                  Reconnect
                </button>
              )}
              {(wsStatus === "connected" || wsStatus === "connecting") && (
                <button
                  onClick={disconnectRelay}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    padding: "5px 14px",
                    color: "rgba(253,251,247,0.4)",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <p style={{ textAlign: "center", color: "rgba(253,251,247,0.15)", fontSize: "11px", margin: 0 }}>
        musu-relay → musu-bridge proxy
      </p>
    </div>
  );
}
