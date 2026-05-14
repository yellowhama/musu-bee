"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface MachineCapacity {
  gpu_models: string[];
  gpu_vram_total_gb: number;
  gpu_vram_free_gb: number;
  cpu_cores: number;
  cpu_idle_pct: number;
  mem_total_gb: number;
  mem_free_gb: number;
  runtime_classes: string[];
  last_heartbeat_at: string | null;
}

interface ActiveRequest {
  id: string;
  agent_id: string;
  company_id: string | null;
  priority: number;
  status: string;
  bound_at: string | null;
  created_at: string;
}

interface MachineDetail {
  id: string;
  hostname: string;
  os: string;
  arch: string;
  status: string;
  last_seen_at: string | null;
  capacity: MachineCapacity | null;
  active_requests: ActiveRequest[];
}

const BRIDGE_URL = process.env.NEXT_PUBLIC_MUSU_BRIDGE_URL || "http://localhost:8070";
const REFRESH_INTERVAL = 5_000;

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" || status === "running" || status === "bound"
      ? "var(--status-online)"
      : status === "draining" || status === "pending"
        ? "var(--status-warn)"
        : "var(--status-error)";
  return (
    <span
      aria-label={`status-${status}`}
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

function Bar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg2)" }}>
        <span>{label}</span>
        <span>
          {used.toFixed(1)} / {total.toFixed(1)} {unit} ({pct}%)
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--border-default)",
          borderRadius: 3,
          overflow: "hidden",
          marginTop: 4,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct > 90 ? "var(--status-error)" : pct > 60 ? "var(--status-warn)" : "var(--status-online)",
            transition: "width 200ms",
          }}
        />
      </div>
    </div>
  );
}

export default function MachinePage() {
  const params = useParams<{ id: string }>();
  const machineId = params?.id || "";
  const [data, setData] = useState<MachineDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    if (!machineId) return;
    let alive = true;
    const fetchData = async () => {
      try {
        const resp = await fetch(`${BRIDGE_URL}/api/machines/${machineId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = (await resp.json()) as MachineDetail;
        if (!alive) return;
        setData(json);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to fetch");
      }
    };
    fetchData();
    const timer = setInterval(fetchData, REFRESH_INTERVAL);

    // v21.F — subscribe to two streams that affect this machine:
    //   resource_requests  — binds / runs / completes on this machine
    //   machines           — capacity heartbeat + status flips
    const esReq = new EventSource(
      `${BRIDGE_URL}/api/watch/subscribe?table=resource_requests`,
    );
    const esMch = new EventSource(
      `${BRIDGE_URL}/api/watch/subscribe?table=machines`,
    );
    const wake = () => { if (alive) fetchData(); };
    esReq.onmessage = wake;
    esMch.onmessage = wake;

    return () => {
      alive = false;
      clearInterval(timer);
      esReq.close();
      esMch.close();
    };
  }, [machineId]);

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
          Machine axis · /m/{machineId}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 0", display: "flex", alignItems: "center" }}>
          {data ? <StatusDot status={data.status} /> : null}
          {data?.hostname || machineId}
        </h1>
        {data && (
          <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
            {data.os} · {data.arch} · status: <strong style={{ color: "var(--fg1)" }}>{data.status}</strong>
          </div>
        )}
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

      {data?.capacity && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeader}>Capacity</h2>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "20px",
            }}
          >
            {data.capacity.gpu_vram_total_gb > 0 && (
              <Bar
                label={`GPU VRAM${data.capacity.gpu_models.length ? ` (${data.capacity.gpu_models.join(", ")})` : ""}`}
                used={data.capacity.gpu_vram_total_gb - data.capacity.gpu_vram_free_gb}
                total={data.capacity.gpu_vram_total_gb}
                unit="GB"
              />
            )}
            <Bar
              label="Memory"
              used={data.capacity.mem_total_gb - data.capacity.mem_free_gb}
              total={data.capacity.mem_total_gb}
              unit="GB"
            />
            <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 8 }}>
              CPU: {data.capacity.cpu_cores} cores · idle {data.capacity.cpu_idle_pct.toFixed(0)}%
              {data.capacity.runtime_classes.length > 0 && (
                <> · runtimes: {data.capacity.runtime_classes.join(", ")}</>
              )}
            </div>
          </div>
        </section>
      )}

      {data?.capacity === null && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionHeader}>Capacity</h2>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "16px 20px",
              color: "var(--fg3)",
              fontSize: 13,
            }}
          >
            No capacity heartbeat received yet. Bridge will report on next tick.
          </div>
        </section>
      )}

      {data && (
        <section>
          <h2 style={sectionHeader}>
            Active requests ({data.active_requests.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.active_requests.map((r) => (
              <div
                key={r.id}
                data-testid={`request-${r.id}`}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <StatusDot status={r.status} />
                  <span style={{ fontFamily: "monospace", color: "var(--fg2)" }}>{r.id.slice(0, 8)}</span>
                  <span style={{ color: "var(--fg1)", fontWeight: 600 }}>{r.status}</span>
                  {r.priority !== 0 && <span style={{ color: "var(--fg2)" }}>prio={r.priority}</span>}
                </div>
                <div style={{ display: "flex", gap: 12, color: "var(--fg3)" }}>
                  {r.company_id && (
                    <a
                      href={`/c/${r.company_id}`}
                      style={{ color: "var(--musu-color-brand-accent)" }}
                    >
                      {r.company_id}
                    </a>
                  )}
                  <span>{r.agent_id}</span>
                </div>
              </div>
            ))}
            {data.active_requests.length === 0 && (
              <div style={{ color: "var(--fg3)", padding: 16 }}>
                No active requests on this machine.
              </div>
            )}
          </div>
        </section>
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
