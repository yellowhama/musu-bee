"use client";

import type { RegistryNode } from "@/lib/types/node";

interface NodeCardProps {
  node: RegistryNode;
  selected: boolean;
  onSelect: (name: string) => void;
}

const STATUS_COLOR = {
  online: "#22c55e",
  stale: "#FFA602",
  offline: "rgba(253,251,247,0.25)",
  unknown: "rgba(253,251,247,0.18)",
};

const STATUS_BORDER = {
  online: "rgba(34,197,94,0.25)",
  stale: "rgba(255,166,2,0.2)",
  offline: "rgba(255,255,255,0.07)",
  unknown: "rgba(255,255,255,0.07)",
};

export type NodeDisplayStatus = "online" | "stale" | "offline" | "unknown";

export function nodeStatus(lastSeen: string | null | undefined): NodeDisplayStatus {
  if (!lastSeen) return "unknown";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (!Number.isFinite(diff)) return "unknown";
  if (diff < 2 * 60 * 1000) return "online";
  if (diff < 15 * 60 * 1000) return "stale";
  return "offline";
}

export function nodeDisplayStatus(node: RegistryNode): NodeDisplayStatus {
  return node.health_status ?? nodeStatus(node.last_seen);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "not observed";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "not observed";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NodeCard({ node, selected, onSelect }: NodeCardProps) {
  const ns = nodeDisplayStatus(node);
  return (
    <button
      onClick={() => onSelect(node.node_name)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: selected ? "rgba(255,166,2,0.06)" : "rgba(255,255,255,0.03)",
        border: selected
          ? "2px solid #FFA602"
          : `1px solid ${STATUS_BORDER[ns]}`,
        borderRadius: "12px",
        padding: "14px 16px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: STATUS_COLOR[ns],
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontWeight: 700,
            fontSize: "13px",
            color: "#FDFBF7",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.node_name}
        </span>
      </div>
      {node.machine_group && (
        <div style={{ fontSize: "11px", color: "rgba(253,251,247,0.35)", marginBottom: "4px" }}>
          {node.machine_group}
        </div>
      )}
      <div style={{ fontSize: "11px", color: "rgba(253,251,247,0.3)" }}>
        {relativeTime(node.last_seen)}
      </div>
      {node.public_url && (
        <div
          style={{
            fontSize: "10px",
            color: "rgba(253,251,247,0.2)",
            fontFamily: "var(--font-jetbrains), monospace",
            marginTop: "4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.public_url}
        </div>
      )}
    </button>
  );
}
