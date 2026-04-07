"use client";

import type { Channel, ChannelId, Device } from "@/types";

interface SidebarProps {
  channels: Channel[];
  devices: Device[];
  activeChannel: ChannelId;
  onChannelSelect: (id: ChannelId) => void;
  onDeviceSelect: (id: string) => void;
}

function StatusDot({ status }: { status: Device["status"] }) {
  const colors: Record<Device["status"], string> = {
    online: "#22c55e",
    offline: "#6b7280",
    busy: "#f59e0b",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[status],
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        height: 4,
        background: "#2d2d2d",
        borderRadius: 2,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

function DeviceItem({
  device,
  onClick,
}: {
  device: Device;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 12px",
        cursor: "pointer",
        borderRadius: 6,
        marginBottom: 2,
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = "#1e1e1e")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = "transparent")
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 13,
          fontWeight: 600,
          color: device.status === "offline" ? "#6b7280" : "#e5e7eb",
          marginBottom: 4,
        }}
      >
        <StatusDot status={device.status} />
        <span>🖥 {device.name}</span>
        {device.isLeader && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              background: "#7c3aed",
              color: "#fff",
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            사장
          </span>
        )}
      </div>
      {device.status !== "offline" && (
        <div
          style={{
            paddingLeft: 14,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", width: 30 }}>
              CPU
            </span>
            <ProgressBar value={device.stats.cpu} color="#3b82f6" />
            <span style={{ fontSize: 10, color: "#9ca3af", width: 28, textAlign: "right" }}>
              {device.stats.cpu}%
            </span>
          </div>
          {device.stats.gpu !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#9ca3af", width: 30 }}>
                GPU
              </span>
              <ProgressBar value={device.stats.gpu} color="#a855f7" />
              <span style={{ fontSize: 10, color: "#9ca3af", width: 28, textAlign: "right" }}>
                {device.stats.gpu}%
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", width: 30 }}>
              RAM
            </span>
            <ProgressBar value={device.stats.ram} color="#10b981" />
            <span style={{ fontSize: 10, color: "#9ca3af", width: 28, textAlign: "right" }}>
              {device.stats.ram}%
            </span>
          </div>
        </div>
      )}
      {device.status === "offline" && (
        <div
          style={{ paddingLeft: 14, fontSize: 11, color: "#4b5563" }}
        >
          오프라인
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  channels,
  devices,
  activeChannel,
  onChannelSelect,
  onDeviceSelect,
}: SidebarProps) {
  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        background: "#111111",
        borderRight: "1px solid #1f1f1f",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "12px 8px",
      }}
    >
      {/* Channels */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "0 8px",
            marginBottom: 6,
          }}
        >
          채널
        </div>
        {channels.map((ch) => (
          <div
            key={ch.id}
            data-testid={`channel-item-${ch.id}`}
            role="button"
            tabIndex={0}
            onClick={() => onChannelSelect(ch.id)}
            onKeyDown={(e) => e.key === "Enter" && onChannelSelect(ch.id)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
              background: activeChannel === ch.id ? "#1d1d1d" : "transparent",
              color: activeChannel === ch.id ? "#f3f4f6" : "#9ca3af",
              fontSize: 14,
              marginBottom: 1,
              fontWeight: activeChannel === ch.id ? 600 : 400,
            }}
            onMouseEnter={(e) => {
              if (activeChannel !== ch.id)
                (e.currentTarget as HTMLDivElement).style.background = "#181818";
            }}
            onMouseLeave={(e) => {
              if (activeChannel !== ch.id)
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <span style={{ marginRight: 6, opacity: 0.6 }}>#</span>
            <span style={{ flex: 1 }}>{ch.name}</span>
            {ch.unread > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {ch.unread}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div
        style={{ borderTop: "1px solid #1f1f1f", margin: "4px 0 12px 0" }}
      />

      {/* Devices */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "0 8px",
            marginBottom: 6,
          }}
        >
          부서
        </div>
        {devices.map((dev) => (
          <DeviceItem
            key={dev.id}
            device={dev}
            onClick={() => onDeviceSelect(dev.id)}
          />
        ))}
      </div>
    </div>
  );
}
