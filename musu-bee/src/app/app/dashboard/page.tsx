"use client";

import { useEffect, useState } from "react";

interface DeviceNode {
  name: string;
  url: string;
  status: "online" | "self" | "offline" | "error" | "unknown";
  is_self: boolean;
  agents: string[];
}

interface DashboardData {
  company_id: string;
  company_name: string;
  nodes: DeviceNode[];
  agents: { total: number; active: number };
  tasks: { total: number; pending: number; running: number; done: number; failed: number };
}

const BRIDGE_URL = process.env.NEXT_PUBLIC_MUSU_BRIDGE_URL || "http://localhost:8070";
const REFRESH_INTERVAL = 15_000;

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" || status === "self"
      ? "#22c55e"
      : status === "offline"
        ? "#ef4444"
        : "#f59e0b";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
        boxShadow: `0 0 6px ${color}40`,
      }}
    />
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #2d2d2d",
        borderRadius: 12,
        padding: "16px 20px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchDashboard = async () => {
    try {
      const resp = await fetch(`${BRIDGE_URL}/api/companies/default/dashboard`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch dashboard");
    }
  };

  useEffect(() => {
    fetchDashboard();
    const timer = setInterval(fetchDashboard, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0d0d",
        color: "#f3f4f6",
        fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
        padding: "32px 24px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>🐝</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>MUSU Dashboard</h1>
        </div>
        {lastUpdated && (
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
            Last updated: {lastUpdated} (auto-refresh {REFRESH_INTERVAL / 1000}s)
          </div>
        )}
      </header>

      {error && (
        <div
          style={{
            background: "#1a1a1a",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 24,
            color: "#ef4444",
          }}
        >
          Bridge unreachable: {error}
        </div>
      )}

      {data && (
        <>
          {/* Task stats */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Tasks
            </h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatCard label="Pending" value={data.tasks.pending} color="#f59e0b" />
              <StatCard label="Running" value={data.tasks.running} color="#3b82f6" />
              <StatCard label="Done" value={data.tasks.done} color="#22c55e" />
              <StatCard label="Failed" value={data.tasks.failed} color="#ef4444" />
            </div>
          </section>

          {/* Devices */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Devices ({data.nodes.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.nodes.map((node) => (
                <div
                  key={node.name}
                  style={{
                    background: "#1a1a1a",
                    border: "1px solid #2d2d2d",
                    borderRadius: 12,
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusDot status={node.status} />
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{node.name}</span>
                    {node.is_self && (
                      <span
                        style={{
                          fontSize: 10,
                          background: "rgba(255,209,102,0.12)",
                          color: "#FFD166",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        THIS DEVICE
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#9ca3af" }}>
                    <span>{node.status}</span>
                    <span>agents: {node.agents.join(", ") || "none"}</span>
                  </div>
                </div>
              ))}
              {data.nodes.length === 0 && (
                <div style={{ color: "#6b7280", padding: 16 }}>
                  No devices configured. Add nodes to ~/.musu/nodes.toml
                </div>
              )}
            </div>
          </section>

          {/* Agents summary */}
          <section>
            <h2 style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Agents
            </h2>
            <div style={{ display: "flex", gap: 12 }}>
              <StatCard label="Total" value={data.agents.total} color="#f3f4f6" />
              <StatCard label="Active" value={data.agents.active} color="#22c55e" />
            </div>
          </section>
        </>
      )}

      {!data && !error && (
        <div style={{ color: "#6b7280", textAlign: "center", padding: 48 }}>Loading...</div>
      )}
    </div>
  );
}
