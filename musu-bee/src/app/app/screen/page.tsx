"use client";

import { useEffect, useState, useCallback } from "react";

const BRIDGE_URL = process.env.NEXT_PUBLIC_MUSU_BRIDGE_URL || "http://localhost:8070";
const NEKO_PORT = 8080;
const REFRESH_INTERVAL = 10_000;

interface DeviceScreen {
  name: string;
  status: "online" | "self" | "offline";
  url: string;
  thumbnail: string | null;
  nekoUrl: string | null;
}

export default function ScreenPage() {
  const [devices, setDevices] = useState<DeviceScreen[]>([]);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    try {
      // Get node list from dashboard
      const resp = await fetch(`${BRIDGE_URL}/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/dashboard`);
      if (!resp.ok) return;
      const data = await resp.json();
      const nodes = data.nodes || [];

      const screens: DeviceScreen[] = await Promise.all(
        nodes.map(async (node: { name: string; status: string; url: string; is_self: boolean }) => {
          let thumbnail: string | null = null;

          // Try to get screenshot from each node
          if (node.status === "online" || node.status === "self") {
            try {
              const snapUrl = node.is_self
                ? `${BRIDGE_URL}/api/screen/snapshot`
                : `${node.url}/api/screen/snapshot`;
              const snapResp = await fetch(snapUrl, { signal: AbortSignal.timeout(5000) });
              if (snapResp.ok) {
                const snapData = await snapResp.json();
                thumbnail = snapData.snapshot || null;
              }
            } catch { /* timeout or unreachable */ }
          }

          // Neko URL (only if self node for now)
          const nekoUrl = node.is_self ? `http://localhost:${NEKO_PORT}` : null;

          return {
            name: node.name,
            status: node.status as DeviceScreen["status"],
            url: node.url,
            thumbnail,
            nekoUrl,
          };
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

  // Full screen Neko view
  if (activeDevice) {
    const device = devices.find((d) => d.name === activeDevice);
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
        {/* Header bar */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveDevice(null)}
            style={{
              background: "none",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              color: "var(--fg2)",
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg1)" }}>
            {activeDevice}
          </span>
          <span style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            background: device?.status === "offline" ? "var(--status-error-bg)" : "var(--status-online-bg)",
            color: device?.status === "offline" ? "var(--status-error)" : "var(--status-online)",
            fontWeight: 600,
          }}>
            {device?.status || "unknown"}
          </span>
        </div>

        {/* Neko iframe */}
        <div style={{ flex: 1, position: "relative" }}>
          {device?.nekoUrl ? (
            <iframe
              src={device.nekoUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="autoplay; clipboard-write; clipboard-read"
            />
          ) : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", color: "var(--fg3)", fontSize: 14,
            }}>
              Remote desktop not available for this device.
              <br />
              Neko needs to be running on the target machine.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Thumbnail grid (Netflix style)
  return (
    <div style={{
      padding: "24px",
      background: "var(--bg-base)",
      minHeight: "100%",
    }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--fg1)", margin: 0 }}>
          Remote Screens
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg2)", marginTop: 4 }}>
          Click a device to connect via WebRTC remote desktop.
        </p>
      </div>

      {loading && (
        <div style={{ color: "var(--fg3)", fontSize: 13, padding: 20 }}>Loading devices...</div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16,
      }}>
        {devices.map((device) => (
          <button
            key={device.name}
            onClick={() => device.status !== "offline" && setActiveDevice(device.name)}
            style={{
              position: "relative",
              background: "var(--bg-card)",
              border: "2px solid var(--border-default)",
              borderRadius: 12,
              overflow: "hidden",
              cursor: device.status === "offline" ? "not-allowed" : "pointer",
              opacity: device.status === "offline" ? 0.5 : 1,
              transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
              textAlign: "left",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              if (device.status !== "offline") {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--musu-color-brand-accent)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "";
              (e.currentTarget as HTMLElement).style.boxShadow = "";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
            }}
          >
            {/* Thumbnail area */}
            <div style={{
              width: "100%",
              aspectRatio: "16/9",
              background: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}>
              {device.thumbnail ? (
                <img
                  src={device.thumbnail}
                  alt={`${device.name} screen`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{
                  color: "var(--fg4)",
                  fontSize: 40,
                  opacity: 0.3,
                }}>
                  🖥
                </div>
              )}

              {/* Status badge overlay */}
              <div style={{
                position: "absolute",
                top: 8,
                right: 8,
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
                  background: device.status === "offline" ? "var(--status-error)" : "var(--status-online)",
                }} />
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>
                  {device.status === "self" ? "THIS DEVICE" : device.status.toUpperCase()}
                </span>
              </div>

              {/* Play button overlay on hover */}
              {device.status !== "offline" && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0)",
                  transition: "background 0.2s",
                  pointerEvents: "none",
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: "rgba(255,209,102,0.9)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: 0,
                    transition: "opacity 0.2s",
                    fontSize: 20, color: "#2D1D19",
                  }}
                    className="play-icon"
                  >
                    ▶
                  </div>
                </div>
              )}
            </div>

            {/* Info bar */}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg1)" }}>
                {device.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>
                {device.nekoUrl ? "WebRTC Remote Desktop" : "Screenshot Only"}
              </div>
            </div>
          </button>
        ))}

        {devices.length === 0 && !loading && (
          <div style={{ color: "var(--fg3)", fontSize: 13, padding: 20, gridColumn: "1 / -1" }}>
            No devices found. Add nodes to ~/.musu/nodes.toml
          </div>
        )}
      </div>

      <style>{`
        button:hover .play-icon { opacity: 1 !important; }
        button:hover > div:last-of-type > div:first-child { background: rgba(0,0,0,0.3) !important; }
      `}</style>
    </div>
  );
}
