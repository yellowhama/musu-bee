"use client";

import { useEffect, useState, useCallback } from "react";

const BRIDGE_URL = process.env.NEXT_PUBLIC_MUSU_BRIDGE_URL || "http://localhost:8070";
const NEKO_PORT = 8080;
const REFRESH_INTERVAL = 15_000;

interface DeviceScreen {
  name: string;
  status: "online" | "self" | "offline";
  url: string;
  agents: string[];
  gpu: string;
  roles: string[];
  nekoUrl: string | null;
}

export default function ScreenPage() {
  const [devices, setDevices] = useState<DeviceScreen[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    try {
      const resp = await fetch(`${BRIDGE_URL}/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/dashboard`);
      if (!resp.ok) return;
      const data = await resp.json();
      const nodes = data.nodes || [];

      const screens: DeviceScreen[] = nodes.map(
        (node: { name: string; status: string; url: string; is_self: boolean; agents?: string[]; gpu?: string; roles?: string[] }) => ({
          name: node.name,
          status: node.status as DeviceScreen["status"],
          url: node.url,
          agents: node.agents || [],
          gpu: node.gpu || "",
          roles: node.roles || [],
          nekoUrl: node.is_self ? `http://localhost:${NEKO_PORT}` : null,
        })
      );

      setDevices(screens);
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

  const handleConnect = (device: DeviceScreen) => {
    if (device.nekoUrl) {
      // Open Neko in new tab (avoids iframe CSP issues)
      window.open(device.nekoUrl, `neko-${device.name}`, "noopener");
    }
  };

  // Netflix-style grid
  return (
    <div style={{
      padding: "24px",
      background: "#1a1210",
      minHeight: "100%",
    }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#FDFCF0", margin: 0, letterSpacing: "-0.02em" }}>
          Remote Screens
        </h1>
        <p style={{ fontSize: 13, color: "rgba(253,252,240,0.4)", marginTop: 4 }}>
          {devices.length} device{devices.length !== 1 ? "s" : ""} in mesh
        </p>
      </div>

      {loading && (
        <div style={{ color: "rgba(253,252,240,0.3)", fontSize: 13, padding: 20 }}>Loading devices...</div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
      }}>
        {devices.map((device) => {
          const isOnline = device.status !== "offline";
          const isSelf = device.status === "self";

          return (
            <div
              key={device.name}
              onClick={() => isOnline && handleConnect(device)}
              style={{
                position: "relative",
                background: "#261813",
                border: `2px solid ${isSelf ? "rgba(255,209,102,0.3)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 14,
                overflow: "hidden",
                cursor: isOnline && device.nekoUrl ? "pointer" : "default",
                opacity: isOnline ? 1 : 0.4,
                transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => {
                if (isOnline) {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.5)";
                  (e.currentTarget as HTMLElement).style.borderColor = "#FFD166";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "";
                (e.currentTarget as HTMLElement).style.borderColor = isSelf ? "rgba(255,209,102,0.3)" : "rgba(255,255,255,0.07)";
              }}
            >
              {/* Screen area — device info visualization */}
              <div style={{
                width: "100%",
                aspectRatio: "16/9",
                background: "linear-gradient(135deg, #1a1210 0%, #2D1D19 50%, #1a1210 100%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                gap: 8,
              }}>
                {/* Device icon */}
                <div style={{ fontSize: 36, opacity: 0.6 }}>
                  {isSelf ? "🖥" : isOnline ? "💻" : "📴"}
                </div>

                {/* GPU badge */}
                {device.gpu && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#FFD166",
                    background: "rgba(255,209,102,0.1)",
                    padding: "2px 10px",
                    borderRadius: 4,
                    letterSpacing: "0.02em",
                  }}>
                    {device.gpu}
                  </div>
                )}

                {/* Agent count */}
                {device.agents.length > 0 && (
                  <div style={{
                    fontSize: 10,
                    color: "rgba(253,252,240,0.4)",
                    fontFamily: "monospace",
                  }}>
                    {device.agents.length} agent{device.agents.length !== 1 ? "s" : ""}: {device.agents.slice(0, 4).join(", ")}{device.agents.length > 4 ? "..." : ""}
                  </div>
                )}

                {/* Connect button overlay */}
                {isOnline && device.nekoUrl && (
                  <div style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#2D1D19",
                    background: "#FFD166",
                    padding: "6px 16px",
                    borderRadius: 6,
                    opacity: 0.8,
                    transition: "opacity 0.2s",
                  }}>
                    Connect Desktop
                  </div>
                )}
              </div>

              {/* Status badge */}
              <div style={{
                position: "absolute",
                top: 10,
                right: 10,
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(4px)",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: isOnline ? "#4ade80" : "#ef4444",
                }} />
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>
                  {isSelf ? "THIS DEVICE" : device.status.toUpperCase()}
                </span>
              </div>

              {/* Roles badge */}
              {device.roles.length > 0 && (
                <div style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  display: "flex",
                  gap: 4,
                }}>
                  {device.roles.map((role) => (
                    <span key={role} style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "rgba(253,252,240,0.6)",
                      background: "rgba(0,0,0,0.6)",
                      padding: "2px 6px",
                      borderRadius: 3,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {role}
                    </span>
                  ))}
                </div>
              )}

              {/* Info bar */}
              <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#FDFCF0" }}>
                  {device.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(253,252,240,0.35)", marginTop: 2 }}>
                  {device.nekoUrl ? "WebRTC Desktop Ready" : isOnline ? "Screen view only" : "Offline"}
                </div>
              </div>
            </div>
          );
        })}

        {devices.length === 0 && !loading && (
          <div style={{ color: "rgba(253,252,240,0.3)", fontSize: 13, padding: 20, gridColumn: "1 / -1" }}>
            No devices found. Check nodes in ~/.musu/nodes.toml
          </div>
        )}
      </div>
    </div>
  );
}
