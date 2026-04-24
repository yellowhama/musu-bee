"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toPolylinePoints } from "./costs-panel-chart";

interface CostsSummary {
  company_id: string;
  period: string;
  total_requests: number;
  by_status: Record<string, number>;
  estimated_cost_usd: number | null;
}

interface AgentCost {
  agent_name: string;
  total_requests: number;
  done: number;
  failed: number;
  estimated_cost_usd: number | null;
}

interface MetricsPoint {
  ts: string;
  cost: number;
  latency: number;
}

interface MetricsHistory {
  history: MetricsPoint[];
  total_cost_usd: number;
  avg_latency_sec: number;
  sample_count: number;
}

interface CostsPanelProps {
  companyId?: string | null;
}

export default function CostsPanel({ companyId }: CostsPanelProps) {
  const [summary, setSummary] = useState<CostsSummary | null>(null);
  const [byAgent, setByAgent] = useState<AgentCost[]>([]);
  const [metrics, setMetrics] = useState<MetricsHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const [summaryRes, byAgentRes, metricsRes] = await Promise.all([
        fetch(`/api/bridge/companies/${companyId}/costs/summary`),
        fetch(`/api/bridge/companies/${companyId}/costs/by-agent`),
        fetch(`/api/bridge/companies/${companyId}/metrics`),
      ]);
      if (!summaryRes.ok) throw new Error(`summary HTTP ${summaryRes.status}`);
      if (!byAgentRes.ok) throw new Error(`by-agent HTTP ${byAgentRes.status}`);
      const [summaryData, byAgentData] = await Promise.all([
        summaryRes.json() as Promise<CostsSummary>,
        byAgentRes.json() as Promise<AgentCost[]>,
      ]);
      const metricsData = metricsRes.ok
        ? ((await metricsRes.json()) as MetricsHistory)
        : null;
      if (mountedRef.current) {
        setSummary(summaryData);
        setByAgent(Array.isArray(byAgentData) ? byAgentData : []);
        setMetrics(metricsData);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to load costs");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    setSummary(null);
    setByAgent([]);
    void doFetch();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    void doFetch();
    const interval = setInterval(() => {
      if (mountedRef.current) void doFetch();
    }, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doneCount = summary?.by_status?.done ?? 0;
  const failedCount = summary?.by_status?.failed ?? 0;
  const successRate =
    summary && summary.total_requests > 0
      ? Math.round((doneCount / summary.total_requests) * 100)
      : null;

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
          Costs
        </span>
        {summary && (
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
            {summary.period}
          </span>
        )}
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

        {companyId && !loading && !error && summary && (
          <>
            {/* Metrics charts */}
            {metrics && metrics.history.length >= 2 ? (
              <div
                style={{
                  background: "var(--musu-bg-card)",
                  border: "1px solid var(--musu-border-dim)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 10,
                  }}
                >
                  Trends
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {/* Cost trend */}
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>
                      Cost (USD)
                    </div>
                    <svg
                      viewBox="0 0 300 80"
                      width="100%"
                      style={{ display: "block" }}
                    >
                      <polyline
                        fill="none"
                        stroke="var(--status-running)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={toPolylinePoints(
                          metrics.history.map((p) => p.cost),
                          300,
                          80,
                          6,
                        )}
                      />
                    </svg>
                  </div>
                  {/* Latency trend */}
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>
                      Latency (s)
                    </div>
                    <svg
                      viewBox="0 0 300 80"
                      width="100%"
                      style={{ display: "block" }}
                    >
                      <polyline
                        fill="none"
                        stroke="var(--status-warn)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={toPolylinePoints(
                          metrics.history.map((p) => p.latency),
                          300,
                          80,
                          6,
                        )}
                      />
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: "var(--musu-bg-card)",
                  border: "1px solid var(--musu-border-dim)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 16,
                  color: "var(--fg4)",
                  fontSize: 13,
                }}
              >
                No metrics data yet
              </div>
            )}

            {/* Summary card */}
            <div
              style={{
                background: "var(--musu-bg-card)",
                border: "1px solid var(--musu-border-dim)",
                borderRadius: 8,
                padding: "16px",
                marginBottom: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  Total Requests
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--fg1)" }}>
                  {summary.total_requests}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  Success Rate
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: successRate !== null && successRate >= 90
                      ? "var(--status-online)"
                      : successRate !== null && successRate >= 70
                      ? "var(--status-warn)"
                      : "var(--status-error)",
                  }}
                >
                  {successRate !== null ? `${successRate}%` : "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  Done
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--status-online)" }}>
                  {doneCount}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  Failed
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--status-error)" }}>
                  {failedCount}
                </div>
              </div>
            </div>

            {/* By-agent breakdown */}
            {byAgent.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--fg3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 8,
                  }}
                >
                  By Agent
                </div>
                {byAgent.map((row) => {
                  const pct =
                    summary.total_requests > 0
                      ? Math.round((row.total_requests / summary.total_requests) * 100)
                      : 0;
                  return (
                    <div
                      key={row.agent_name}
                      style={{
                        background: "var(--musu-bg-card)",
                        border: "1px solid var(--musu-border-dim)",
                        borderRadius: 6,
                        padding: "10px 12px",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{ fontSize: 12, fontWeight: 600, color: "var(--fg1)", flex: 1 }}
                        >
                          {row.agent_name}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--fg2)" }}>
                          {row.total_requests} req
                        </span>
                        <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                          {pct}%
                        </span>
                      </div>
                      {/* Mini bar */}
                      <div
                        style={{
                          height: 3,
                          background: "var(--border-default)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: "var(--status-running)",
                            borderRadius: 2,
                            transition: "width 0.4s",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {byAgent.length === 0 && (
              <p style={{ color: "var(--fg4)", fontSize: 13, padding: "8px 0" }}>
                No per-agent data yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
