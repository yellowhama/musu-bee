"use client";
import { getBridgeUrl } from '../../../lib/bridge-config';

import { useCallback, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useBoundedEventSource } from "@/lib/useBoundedEventSource";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

interface InflightRequest {
  id: string;
  status: string;
  priority: number;
  bound_machine_id: string | null;
  created_at: string;
}

interface CompanyAgent {
  id: string;
  name: string;
  status: string;
  adapter_type: string;
  inflight_requests: InflightRequest[];
}

interface CompanyDispatch {
  company: { id: string; name: string };
  agents: CompanyAgent[];
  totals: {
    agents_total: number;
    agents_active: number;
    requests_pending: number;
    requests_running: number;
  };
}

const BRIDGE_URL = getBridgeUrl();
const REFRESH_INTERVAL = 30_000;

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" || status === "running" || status === "bound"
      ? "var(--status-online)"
      : status === "pending"
        ? "var(--status-warn)"
        : "var(--status-error)";
  return (
    <span
      aria-label={`status-${status}`}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
      }}
    />
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: "16px 20px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function CompanyPage() {
  const params = useParams<{ id: string }>();
  const companyId = params?.id || "";
  const [data, setData] = useState<CompanyDispatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const fetchInFlightRef = useRef(false);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const resp = await fetch(`${BRIDGE_URL}/api/companies/${companyId}/dispatch`, { signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as CompanyDispatch;
      if (signal?.aborted) return;
      setData(json);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Failed to fetch");
      if (signal) throw e;
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [companyId]);

  useLowDutyPolling(fetchData, { enabled: Boolean(companyId), intervalMs: REFRESH_INTERVAL });

  // SSE wakes a refresh as soon as the scheduler binds/runs/completes an
  // agent's request. The bounded hook closes failed streams and uses capped
  // reconnects; low-duty polling remains the safety net.
  useBoundedEventSource({
    enabled: Boolean(companyId),
    url: `${BRIDGE_URL}/api/watch/subscribe?table=resource_requests`,
    onMessage: () => {
      void fetchData();
    },
  });

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
        <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 1 }}>
          Company axis · /c/{companyId}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 0" }}>
          {data?.company.name || companyId}
        </h1>
        {lastUpdated && (
          <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
            Last updated: {lastUpdated} (auto-refresh {REFRESH_INTERVAL / 1000}s)
          </div>
        )}
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

      {data && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionHeader}>Totals</h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatCard label="Agents" value={data.totals.agents_total} color="var(--fg1)" />
              <StatCard label="Active" value={data.totals.agents_active} color="var(--status-online)" />
              <StatCard label="Pending" value={data.totals.requests_pending} color="var(--status-warn)" />
              <StatCard label="Running" value={data.totals.requests_running} color="var(--status-running)" />
            </div>
          </section>

          <section>
            <h2 style={sectionHeader}>Agents ({data.agents.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.agents.map((a) => (
                <div
                  key={a.id}
                  data-testid={`agent-${a.id}`}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 12,
                    padding: "16px 20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusDot status={a.status} />
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{a.name}</span>
                      <span style={{ fontSize: 12, color: "var(--fg3)" }}>{a.adapter_type}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--fg2)" }}>{a.status}</span>
                  </div>
                  {a.inflight_requests.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      {a.inflight_requests.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "flex",
                            gap: 12,
                            fontSize: 12,
                            color: "var(--fg2)",
                            paddingLeft: 16,
                            borderLeft: "2px solid var(--border-default)",
                          }}
                        >
                          <StatusDot status={r.status} />
                          <span style={{ fontFamily: "monospace" }}>{r.id.slice(0, 8)}</span>
                          <span>{r.status}</span>
                          {r.bound_machine_id && (
                            <a
                              href={`/m/${r.bound_machine_id}`}
                              style={{ color: "var(--musu-color-brand-accent)" }}
                            >
                              → {r.bound_machine_id}
                            </a>
                          )}
                          {r.priority !== 0 && <span>prio={r.priority}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {data.agents.length === 0 && (
                <div style={{ color: "var(--fg3)", padding: 16 }}>
                  No agents in this company.
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {!data && !error && (
        <div style={{ color: "var(--fg3)", textAlign: "center", padding: 48 }}>Loading...</div>
      )}
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
