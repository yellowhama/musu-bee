"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { UserAvatar } from "@/components/layout/UserMenu";
import type { RegistryNode } from "@/lib/types/node";
import { useConsoleShell } from "./ConsoleShellContext";

interface ConsoleTopStripProps {
  user: { email: string; displayName: string | null; avatarUrl: string | null };
  nodes: RegistryNode[];
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

function nodeAge(lastSeen: string): "online" | "recent" | "offline" {
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 2 * 60 * 1000) return "online";
  if (diff < 15 * 60 * 1000) return "recent";
  return "offline";
}

const NODE_DOT_COLOR: Record<string, string> = {
  online: "#22c55e",
  recent: "#FFD166",
  offline: "rgba(253,252,240,0.2)",
};

export function ConsoleTopStrip({
  user,
  nodes,
  sidebarCollapsed,
  onToggleSidebar,
}: ConsoleTopStripProps) {
  const { setPaletteOpen } = useConsoleShell();

  const onlineNode = nodes.find((n) => nodeAge(n.last_seen) === "online");
  const displayNode = onlineNode ?? nodes[0] ?? null;
  const dotColor = displayNode ? NODE_DOT_COLOR[nodeAge(displayNode.last_seen)] : "rgba(253,252,240,0.2)";

  return (
    <div
      style={{
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid var(--console-sidebar-border, rgba(255,255,255,0.07))",
        background: "var(--console-sidebar-bg, #2D1D19)",
        flexShrink: 0,
      }}
    >
      {/* Left: sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
        style={{
          background: "none",
          border: "none",
          color: "var(--console-sidebar-text, rgba(253,252,240,0.7))",
          cursor: "pointer",
          padding: "4px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          transition: "color 150ms",
        }}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>

      {/* Center: active node indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {nodes.length > 0 ? (
          <>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dotColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "12px",
                color: "var(--console-sidebar-text, rgba(253,252,240,0.7))",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}
            >
              {displayNode!.node_name}
            </span>
          </>
        ) : (
          <span style={{ fontSize: "12px", color: "var(--console-sidebar-text, rgba(253,252,240,0.7))", opacity: 0.4 }}>
            No nodes connected
          </span>
        )}
      </div>

      {/* Right: ⌘K badge + user avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          onClick={() => setPaletteOpen(true)}
          title="Command palette  ⌘K"
          style={{
            background: "none",
            border: "1px solid var(--console-sidebar-border, rgba(255,255,255,0.07))",
            borderRadius: "5px",
            padding: "2px 7px",
            color: "var(--console-sidebar-text, rgba(253,252,240,0.7))",
            opacity: 0.5,
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            lineHeight: "18px",
            letterSpacing: "0.02em",
          }}
        >
          ⌘K
        </button>
        <UserAvatar
          avatarUrl={user.avatarUrl}
          displayName={user.displayName}
          email={user.email}
          size={24}
        />
      </div>
    </div>
  );
}
