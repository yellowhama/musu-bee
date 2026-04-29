"use client";

import type { CompanyActivationState } from "@/lib/companyActivation";
import type { DefaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";
import type { AgentsSurfaceSnapshot, Channel, ChannelId, Device } from "@/types";
import CompanyPanel from "@/components/CompanyPanel";
import NodePanel from "@/components/NodePanel";

function _relativeTime(d: Date): string {
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간`;
  const day = Math.floor(hr / 24);
  return `${day}일`;
}

interface SidebarProps {
  channels: Channel[];
  devices: Device[];
  companyTemplate?: DefaultCompanyTemplate | null;
  activeCompany?: CompanyActivationState | null;
  workspaceId: string;
  agentsSurface?: AgentsSurfaceSnapshot | null;
  activeChannel: ChannelId;
  onChannelSelect: (id: ChannelId) => void;
  onDeviceSelect: (id: string) => void;
}

function StatusDot({ status }: { status: Device["status"] }) {
  const colors: Record<Device["status"], string> = {
    online: "var(--musu-status-online)",
    offline: "var(--musu-status-offline)",
    busy: "var(--musu-status-busy)",
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
        background: "var(--border-default)",
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
        ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-overlay)")
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
          color: device.status === "offline" ? "var(--fg3)" : "var(--fg1)",
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
            Leader
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
            <span style={{ fontSize: 10, color: "var(--fg2)", width: 30 }}>
              CPU
            </span>
            <ProgressBar value={device.stats.cpu} color="var(--status-running)" />
            <span style={{ fontSize: 10, color: "var(--fg2)", width: 28, textAlign: "right" }}>
              {device.stats.cpu}%
            </span>
          </div>
          {device.stats.gpu !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--fg2)", width: 30 }}>
                GPU
              </span>
              <ProgressBar value={device.stats.gpu} color="#a855f7" />
              <span style={{ fontSize: 10, color: "var(--fg2)", width: 28, textAlign: "right" }}>
                {device.stats.gpu}%
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--fg2)", width: 30 }}>
              RAM
            </span>
            <ProgressBar value={device.stats.ram} color="var(--musu-status-online)" />
            <span style={{ fontSize: 10, color: "var(--fg2)", width: 28, textAlign: "right" }}>
              {device.stats.ram}%
            </span>
          </div>
        </div>
      )}
      {device.status === "offline" && (
        <div
          style={{ paddingLeft: 14, fontSize: 11, color: "var(--fg4)" }}
        >
          Offline
        </div>
      )}
    </div>
  );
}

function DepartmentStatusDot({ status }: { status: string }) {
  const tone = status.toLowerCase();
  const color =
    tone === "active" || tone === "running" ? "var(--musu-status-online)" :
    tone === "idle" ? "var(--fg3)" :
    tone === "paused" ? "var(--musu-status-busy)" :
    tone === "retired" || tone === "offline" ? "var(--musu-status-offline)" :
    tone === "error" ? "var(--musu-status-error)" :
    "var(--fg3)";

  const animClass =
    tone === "paused" ? "musu-dot-working" :
    tone === "active" || tone === "running" ? "musu-dot-active" :
    undefined;

  return (
    <span
      className={animClass}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

export default function Sidebar({
  channels,
  devices,
  companyTemplate,
  activeCompany,
  workspaceId,
  agentsSurface,
  activeChannel,
  onChannelSelect,
  onDeviceSelect,
}: SidebarProps) {
  const summary = agentsSurface?.summary;

  return (
    <div
      style={{
        width: 240,
        minWidth: 240,
        background: "var(--bg-base)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "16px 8px",
      }}
    >
      {/* Conversation List (Slack/KakaoTalk style) */}
      {(["butler", "group", "agent", "panel"] as const).map((cat) => {
        const label = { butler: "📌 집사", group: "💬 단체방", agent: "👤 직접 대화", panel: "📊 관리" }[cat];
        const items = channels.filter((ch) => (ch.category || "panel") === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div className="label" style={{ padding: "0 10px", marginBottom: 6, fontSize: 10 }}>
              {label}
            </div>
            {items.map((ch) => {
              const isActive = activeChannel === ch.id;
              const preview = ch.lastMessage?.text || "";
              const timeStr = ch.lastMessage?.timestamp
                ? _relativeTime(ch.lastMessage.timestamp)
                : "";
              return (
                <div
                  key={ch.id}
                  data-testid={`channel-item-${ch.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onChannelSelect(ch.id)}
                  onKeyDown={(e) => e.key === "Enter" && onChannelSelect(ch.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`,
                    marginBottom: 2,
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    fontSize: 18, width: 32, height: 32, display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                    borderRadius: "50%", background: "var(--bg-card)",
                    position: "relative",
                  }}>
                    {ch.avatar || "#"}
                    {ch.status === "online" && (
                      <div style={{
                        position: "absolute", bottom: 0, right: 0, width: 8, height: 8,
                        borderRadius: "50%", background: "var(--status-online)",
                        border: "2px solid var(--bg-base)",
                      }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{
                        fontWeight: isActive || ch.unread > 0 ? 700 : 500,
                        color: isActive ? "var(--accent)" : "var(--fg1)",
                        fontSize: 13,
                      }}>
                        {ch.displayName || ch.name}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--fg3)", flexShrink: 0 }}>
                        {timeStr}
                      </span>
                    </div>
                    {preview && (
                      <div style={{
                        fontSize: 11, color: "var(--fg3)", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {preview.slice(0, 60)}
                      </div>
                    )}
                  </div>
                  {/* Unread badge */}
                  {ch.unread > 0 && (
                    <span className="pill" style={{
                      background: "var(--status-error)", color: "white",
                      padding: "0 6px", fontSize: 10, height: 16, flexShrink: 0,
                    }}>
                      {ch.unread}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Execution status surface */}
      <div style={{ marginBottom: 16 }}>
        <div className="label" style={{ padding: "0 10px", marginBottom: 10 }}>
          Execution Status
        </div>
        <div
          data-testid="agents-parity-surface"
          className="card"
          style={{ margin: "0 6px", padding: "10px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span
              className="pill"
              style={{
                fontSize: 9,
                background: agentsSurface?.degraded ? "var(--status-error-bg)" : "var(--status-online-bg)",
                color: agentsSurface?.degraded ? "var(--status-error)" : "var(--status-online)",
                border: `1px solid ${agentsSurface?.degraded ? "var(--status-error)" : "var(--status-online-br)"}`,
              }}
            >
              {agentsSurface?.degraded ? "DEGRADED" : "SYNC"}
            </span>
            <span style={{ fontSize: 10, color: "var(--fg3)", marginLeft: "auto" }}>
              {agentsSurface?.fetchedAt ? new Date(agentsSurface.fetchedAt).toLocaleTimeString() : "..."}
            </span>
          </div>
          
          <div style={{ display: "grid", gap: 6 }}>
              {summary?.departments.slice(0, 5).map((department) => (
                <div key={department.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg2)" }}>
                  <DepartmentStatusDot status={department.status} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{department.name}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 10px", marginBottom: 20 }}>
          <CompanyPanel />
      </div>

      <div style={{ padding: "0 10px", marginBottom: 20 }}>
          <NodePanel />
      </div>

      {/* Devices */}
      <div style={{ marginTop: "auto", borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
        <div className="label" style={{ padding: "0 10px", marginBottom: 10 }}>
          This Machine
        </div>
        {devices.filter((d) => !d.isRemote).map((dev) => (
          <DeviceItem key={dev.id} device={dev} onClick={() => onDeviceSelect(dev.id)} />
        ))}
      </div>
    </div>
  );
}
