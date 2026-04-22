"use client";

import type { CompanyActivationState } from "@/lib/companyActivation";
import type { DefaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";
import type { AgentsSurfaceSnapshot, Channel, ChannelId, Device } from "@/types";
import CompanyPanel from "@/components/CompanyPanel";
import NodePanel from "@/components/NodePanel";

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
            <ProgressBar value={device.stats.ram} color="var(--musu-status-online)" />
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
    tone === "idle" ? "#6b7280" :
    tone === "paused" ? "var(--musu-status-busy)" :
    tone === "retired" || tone === "offline" ? "var(--musu-status-offline)" :
    tone === "error" ? "var(--musu-status-error)" :
    "#6b7280";

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
      {/* Channels */}
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ padding: "0 10px", marginBottom: 10 }}>
          Channels
        </div>
        {(() => {
          const COMPANY_CHANNELS: ChannelId[] = ["issues", "approvals", "projects", "goals", "costs"];
          const hasCompany = !!activeCompany;
          let insertedDivider = false;
          return channels.map((ch) => {
            const isCompanyChannel = COMPANY_CHANNELS.includes(ch.id);
            const dimmed = isCompanyChannel && !hasCompany;
            const showDivider = isCompanyChannel && !insertedDivider;
            if (showDivider) insertedDivider = true;
            return (
              <div key={ch.id}>
                {showDivider && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "16px 10px 8px",
                    }}
                  >
                    <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                    <span className="label" style={{ fontSize: 9, color: "var(--fg4)" }}>
                      Company
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                  </div>
                )}
                <div
                  data-testid={`channel-item-${ch.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onChannelSelect(ch.id)}
                  onKeyDown={(e) => e.key === "Enter" && onChannelSelect(ch.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    background: activeChannel === ch.id ? "var(--bg-hover)" : "transparent",
                    color: activeChannel === ch.id ? "var(--accent)" : dimmed ? "var(--fg4)" : "var(--fg2)",
                    fontSize: 13,
                    marginBottom: 2,
                    fontWeight: activeChannel === ch.id ? 700 : 500,
                    transition: "all 0.15s ease",
                    borderLeft: `3px solid ${activeChannel === ch.id ? "var(--accent)" : "transparent"}`,
                  }}
                  onMouseEnter={(e) => {
                    if (activeChannel !== ch.id)
                      (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
                  }}
                  onMouseLeave={(e) => {
                    if (activeChannel !== ch.id)
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  <span style={{ marginRight: 8, opacity: 0.5, fontSize: 14 }}>#</span>
                  <span style={{ flex: 1 }}>{ch.name}</span>
                  {ch.unread > 0 && (
                    <span
                      className="pill"
                      style={{
                        background: "var(--status-error)",
                        color: "white",
                        padding: "0 6px",
                        fontSize: 10,
                        height: 16,
                      }}
                    >
                      {ch.unread}
                    </span>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>

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
