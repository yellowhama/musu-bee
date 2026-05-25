"use client";
import { getBridgeUrl } from '../../../lib/bridge-config';

import { useEffect, useState, useCallback } from "react";

const BRIDGE_URL = getBridgeUrl();
const REFRESH_INTERVAL = 15_000;

interface NodeInfo {
  name: string;
  status: "online" | "self" | "offline" | "unknown" | "error";
  url: string;
  agents: string[];
  machine: string;
  os: string;
  gpu: string;
  roles: string[];
  rustdesk_id: string;
  is_self: boolean;
}

interface MachineGroup {
  machine: string;
  gpu: string;
  nodes: NodeInfo[];
  hasOnline: boolean;
  rustdesk_id: string;
}

export default function ScreenPage() {
  const [machines, setMachines] = useState<MachineGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    try {
      // Get active company dynamically
      let companyId = "";
      try {
        const wsResp = await fetch(`${BRIDGE_URL}/api/workspace`);
        if (wsResp.ok) {
          const ws = await wsResp.json();
          companyId = ws.active_company_id || "";
        }
      } catch { /* */ }
      if (!companyId) {
        try {
          const coResp = await fetch(`${BRIDGE_URL}/api/companies`);
          if (coResp.ok) {
            const cos = await coResp.json();
            if (Array.isArray(cos) && cos.length > 0) companyId = cos[0].id;
          }
        } catch { /* */ }
      }
      // Try dashboard first, fallback to direct node list
      let data: Record<string, unknown> = {};
      if (companyId) {
        try {
          const resp = await fetch(`${BRIDGE_URL}/api/companies/${companyId}/dashboard`);
          if (resp.ok) data = await resp.json();
        } catch { /* */ }
      }
      // Fallback: direct node-info if dashboard didn't return nodes
      if (!data.nodes || !(data.nodes as unknown[]).length) {
        try {
          const nodeResp = await fetch(`${BRIDGE_URL}/api/admin/node-info`);
          if (nodeResp.ok) {
            const info = await nodeResp.json();
            // Wrap single node info as array for compatibility
            data = { nodes: [info] };
          }
        } catch { /* */ }
      }
      const nodes: NodeInfo[] = ((data.nodes || []) as Record<string, unknown>[]).map((n) => ({
        name: n.name as string || "",
        status: ((n.status as string) || "unknown") as NodeInfo["status"],
        url: n.url as string || "",
        agents: (n.agents as string[]) || [],
        machine: (n.machine as string) || (n.name as string) || "",
        os: (n.os as string) || "linux",
        gpu: (n.gpu as string) || "",
        roles: (n.roles as string[]) || [],
        rustdesk_id: (n.rustdesk_id as string) || "",
        is_self: n.is_self as boolean || false,
      }));

      // Group by physical machine
      const machineMap = new Map<string, MachineGroup>();
      for (const node of nodes) {
        const key = node.machine;
        if (!machineMap.has(key)) {
          machineMap.set(key, {
            machine: key,
            gpu: node.gpu,
            nodes: [],
            hasOnline: false,
            rustdesk_id: node.rustdesk_id,
          });
        }
        const group = machineMap.get(key)!;
        group.nodes.push(node);
        if (node.status === "online" || node.status === "self") group.hasOnline = true;
        if (!group.gpu && node.gpu) group.gpu = node.gpu;
        if (!group.rustdesk_id && node.rustdesk_id) group.rustdesk_id = node.rustdesk_id;
      }

      setMachines(Array.from(machineMap.values()));
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const timer = setInterval(fetchDevices, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchDevices]);

  const handleConnect = (rustdesk_id: string) => {
    if (rustdesk_id && rustdesk_id.length >= 6) {
      window.open(`rustdesk://connection/new/${rustdesk_id}`, "_self");
    }
  };

  const osLabel = (os: string) => {
    switch (os) {
      case "wsl2": return "WSL2 (Linux)";
      case "windows": return "Windows";
      case "linux": return "Linux";
      case "macos": return "macOS";
      default: return os;
    }
  };

  const osIcon = (os: string) => {
    switch (os) {
      case "wsl2": return "🐧";
      case "windows": return "🪟";
      case "linux": return "🐧";
      case "macos": return "🍎";
      default: return "💻";
    }
  };

  return (
    <div style={{ padding: "24px", background: "var(--bg-inset)", minHeight: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--fg1)", margin: 0, letterSpacing: "-0.02em" }}>
          Remote Screens
        </h1>
        <p style={{ fontSize: 13, color: "rgba(253,251,247,0.4)", marginTop: 4 }}>
          {machines.length} machine{machines.length !== 1 ? "s" : ""} in mesh
        </p>
      </div>

      {loading && (
        <div style={{ color: "rgba(253,251,247,0.3)", fontSize: 13, padding: 20 }}>Loading machines...</div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
        gap: 20,
      }}>
        {machines.map((machine) => (
          <div
            key={machine.machine}
            style={{
              background: "var(--bg-elevated)",
              border: `2px solid ${machine.hasOnline ? "var(--accent-glow)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 16,
              overflow: "hidden",
              opacity: machine.hasOnline ? 1 : 0.4,
              transition: "border-color 0.2s",
            }}
          >
            {/* Machine header */}
            <div style={{
              padding: "16px 18px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--fg1)", letterSpacing: "-0.01em" }}>
                  {machine.machine}
                </div>
                {machine.gpu && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "var(--accent)", marginTop: 3,
                    background: "var(--accent-muted)", padding: "1px 8px", borderRadius: 3,
                    display: "inline-block",
                  }}>
                    {machine.gpu}
                  </div>
                )}
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: 4,
                background: machine.hasOnline ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: machine.hasOnline ? "#4ade80" : "#ef4444",
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: machine.hasOnline ? "#4ade80" : "#ef4444",
                }}>
                  {machine.hasOnline ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>

            {/* Nodes inside this machine */}
            <div style={{
              display: "flex", gap: 8, padding: "0 18px 14px",
              flexWrap: "wrap",
            }}>
              {machine.nodes.map((node) => (
                <div
                  key={node.name}
                  style={{
                    flex: "1 1 140px",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{osIcon(node.os)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg1)" }}>
                      {osLabel(node.os)}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(253,251,247,0.35)", marginBottom: 4 }}>
                    {node.name}
                  </div>
                  {node.agents.length > 0 && (
                    <div style={{ fontSize: 10, color: "rgba(253,251,247,0.3)" }}>
                      {node.agents.length} agent{node.agents.length !== 1 ? "s" : ""}
                    </div>
                  )}
                  {node.roles.length > 0 && (
                    <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                      {node.roles.map((r) => (
                        <span key={r} style={{
                          fontSize: 8, fontWeight: 700, color: "rgba(253,251,247,0.5)",
                          background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 2,
                          textTransform: "uppercase", letterSpacing: "0.05em",
                        }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Connect button */}
            {machine.hasOnline && (
              <div style={{
                padding: "0 18px 16px",
                display: "flex", gap: 8,
              }}>
                {machine.rustdesk_id ? (
                  <button
                    onClick={() => handleConnect(machine.rustdesk_id)}
                    style={{
                      flex: 1,
                      background: "var(--accent)",
                      color: "var(--fg-on-accent)",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 0",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  >
                    Connect Desktop (RustDesk)
                  </button>
                ) : (
                  <div style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    padding: "10px 0",
                    textAlign: "center",
                    fontSize: 11,
                    color: "rgba(253,251,247,0.3)",
                  }}>
                    Install RustDesk on this machine to enable remote desktop
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {machines.length === 0 && !loading && (
          <div style={{ color: "rgba(253,251,247,0.3)", fontSize: 13, padding: 20, gridColumn: "1 / -1" }}>
            No machines found. Check nodes in ~/.musu/nodes.toml
          </div>
        )}
      </div>
    </div>
  );
}
