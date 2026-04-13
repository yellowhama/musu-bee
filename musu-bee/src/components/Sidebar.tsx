"use client";

import type { CompanyActivationState } from "@/lib/companyActivation";
import type { DefaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";
import type { AgentsSurfaceSnapshot, Channel, ChannelId, Device } from "@/types";

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
          Channels
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
                  background: "var(--musu-status-error)",
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

      {/* Execution status surface */}
      <div style={{ marginBottom: 12 }}>
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
          Execution Status (/agents)
        </div>
        <div
          data-testid="agents-parity-surface"
          style={{
            margin: "0 4px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #242424",
            background: "#141414",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: agentsSurface?.degraded ? "#fca5a5" : "#86efac",
                background: agentsSurface?.degraded ? "rgba(239,68,68,0.16)" : "rgba(34,197,94,0.16)",
                border: `1px solid ${agentsSurface?.degraded ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)"}`,
                borderRadius: 999,
                padding: "2px 6px",
              }}
            >
              {agentsSurface?.degraded ? "DEGRADED" : "SYNC"}
            </span>
            <span style={{ fontSize: 10, color: "#6b7280" }}>
              {agentsSurface?.fetchedAt
                ? new Date(agentsSurface.fetchedAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Loading"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 5 }}>
            boss_host: <span style={{ color: "#e5e7eb" }}>{summary?.bossHost ?? "n/a"}</span>
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
            handoff target:{" "}
            <span style={{ color: "#e5e7eb" }}>{summary?.lastHandoffTarget ?? "n/a"}</span>
          </div>
          {summary?.departments.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              {summary.departments.slice(0, 6).map((department) => (
                <div
                  key={department.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: "#d1d5db",
                  }}
                >
                  <DepartmentStatusDot status={department.status} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {department.name}
                  </span>
                  <span style={{ color: "#9ca3af", textTransform: "lowercase" }}>
                    {department.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              No department status data
            </div>
          )}
          {agentsSurface?.degradedReason && (
            <div style={{ marginTop: 8, fontSize: 10, color: "#fca5a5" }}>
              {agentsSurface.degradedReason}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{ borderTop: "1px solid #1f1f1f", margin: "4px 0 12px 0" }}
      />

      <div style={{ marginBottom: 12 }}>
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
          Active Company
        </div>
        <div
          style={{
            margin: "0 4px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #242424",
            background: "#141414",
          }}
        >
          <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 600, marginBottom: 6 }}>
            {activeCompany?.companyName ?? "Draft company"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
            workspace: {workspaceId}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
            {activeCompany
              ? `${activeCompany.selectedProjects.length} starter projects · ${activeCompany.templateKey}`
              : "Apply the template to create an active company record."}
          </div>
        </div>
      </div>

      <div
        style={{ borderTop: "1px solid #1f1f1f", margin: "4px 0 12px 0" }}
      />

      <div style={{ marginBottom: 12 }}>
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
          Company Template
        </div>
        <div
          style={{
            margin: "0 4px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #242424",
            background: "#141414",
          }}
        >
          <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 600, marginBottom: 6 }}>
            {companyTemplate?.templateKey ?? "default-company-operating-system"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
            {companyTemplate?.goals.length ?? 0} goals, {companyTemplate?.defaultAgents.length ?? 0} default lanes
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
            Comment contract: {companyTemplate?.boardCommentContract.requiredFields.join(", ") ?? "Role, Command, Artifact"}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{ borderTop: "1px solid #1f1f1f", margin: "4px 0 12px 0" }}
      />

      {/* Devices */}
      <div>
        {/* Local machines */}
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
          This Machine
        </div>
        {devices.filter((d) => !d.isRemote).map((dev) => (
          <DeviceItem
            key={dev.id}
            device={dev}
            onClick={() => onDeviceSelect(dev.id)}
          />
        ))}

        {/* Remote machines — only shown when peers are discovered */}
        {devices.some((d) => d.isRemote) && (
          <>
            <div
              style={{ borderTop: "1px solid #1f1f1f", margin: "8px 0" }}
            />
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
              Remote Machines
            </div>
            {devices.filter((d) => d.isRemote).map((dev) => (
              <DeviceItem
                key={dev.id}
                device={dev}
                onClick={() => onDeviceSelect(dev.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
