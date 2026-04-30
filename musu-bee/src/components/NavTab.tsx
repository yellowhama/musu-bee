"use client";

import { useState, useEffect } from "react";
import type { PanelId, ChatChannelId } from "@/types";

interface NavTabProps {
  activePanel: PanelId;
  activeChat: ChatChannelId;
  onPanelSelect: (id: PanelId) => void;
  onChatSelect: (id: ChatChannelId) => void;
  companyName?: string | null;
}

interface NavItem {
  id: string;
  icon: string;
  label: string;
  type: "panel" | "chat";
}

const PANEL_ITEMS: NavItem[] = [
  { id: "dashboard", icon: "⊞", label: "Home", type: "panel" },
  { id: "tasks", icon: "☰", label: "Tasks", type: "panel" },
  { id: "issues", icon: "!", label: "Issues", type: "panel" },
  { id: "goals", icon: "◎", label: "Goals", type: "panel" },
  { id: "wiki", icon: "◧", label: "Wiki", type: "panel" },
  { id: "costs", icon: "$", label: "Costs", type: "panel" },
  { id: "nodes", icon: "⬡", label: "Nodes", type: "panel" },
  { id: "screen", icon: "🖥", label: "Screen", type: "panel" },
  { id: "search", icon: "⌕", label: "Search", type: "panel" },
];

const CHAT_ITEMS: NavItem[] = [
  { id: "general", icon: "#", label: "Chat", type: "chat" },
];

const AGENT_ITEMS: NavItem[] = [
  { id: "ceo", icon: "CE", label: "CEO", type: "chat" },
  { id: "cto", icon: "CT", label: "CTO", type: "chat" },
  { id: "engineer", icon: "EN", label: "Eng", type: "chat" },
  { id: "qa", icon: "QA", label: "QA", type: "chat" },
];

export default function NavTab({
  activePanel,
  activeChat,
  onPanelSelect,
  onChatSelect,
  companyName,
}: NavTabProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("musu_sidebar_v1") === "collapsed";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("musu_sidebar_v1", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  // Keyboard shortcut: [ to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const width = collapsed ? 56 : 220;

  const isActive = (item: NavItem) =>
    item.type === "panel" ? activePanel === item.id : activeChat === item.id;

  const handleClick = (item: NavItem) => {
    if (item.type === "panel") onPanelSelect(item.id as PanelId);
    else onChatSelect(item.id as ChatChannelId);
  };

  return (
    <nav
      style={{
        width,
        minWidth: width,
        height: "100%",
        background: "var(--console-sidebar-bg)",
        borderRight: "1px solid var(--console-sidebar-border)",
        display: "flex",
        flexDirection: "column",
        padding: collapsed ? "12px 4px" : "12px 8px",
        gap: 2,
        overflowY: "auto",
        overflowX: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease, padding 0.2s ease",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: collapsed ? "4px 0" : "4px 8px",
          marginBottom: 12,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <img src="/images/favicon-header.png" alt="MUSU" style={{ height: 20, width: "auto" }} />
        {!collapsed && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--musu-color-brand-accent)",
              letterSpacing: "-0.02em",
            }}
          >
            MUSU
          </span>
        )}
      </div>

      {/* Company badge */}
      {companyName && !collapsed && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--console-sidebar-text)",
            padding: "4px 8px",
            marginBottom: 4,
            opacity: 0.5,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {companyName}
        </div>
      )}

      {/* Panel items */}
      <SectionLabel collapsed={collapsed}>Panels</SectionLabel>
      {PANEL_ITEMS.map((item) => (
        <SidebarItem
          key={item.id}
          item={item}
          active={isActive(item)}
          collapsed={collapsed}
          onClick={() => handleClick(item)}
        />
      ))}

      <Divider />

      {/* Chat */}
      <SectionLabel collapsed={collapsed}>Chat</SectionLabel>
      {CHAT_ITEMS.map((item) => (
        <SidebarItem
          key={item.id}
          item={item}
          active={isActive(item)}
          collapsed={collapsed}
          onClick={() => handleClick(item)}
        />
      ))}

      <Divider />

      {/* Agents */}
      <SectionLabel collapsed={collapsed}>Agents</SectionLabel>
      {AGENT_ITEMS.map((item) => (
        <SidebarItem
          key={item.id}
          item={item}
          active={isActive(item)}
          collapsed={collapsed}
          onClick={() => handleClick(item)}
          isAgent
        />
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar [" : "Collapse sidebar ["}
        style={{
          width: "100%",
          height: 36,
          border: "none",
          borderRadius: 8,
          background: "transparent",
          color: "var(--console-sidebar-text)",
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? 0 : "0 8px",
          gap: 8,
          opacity: 0.5,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
      >
        <span>{collapsed ? "»" : "«"}</span>
        {!collapsed && <span style={{ fontSize: 11 }}>Collapse</span>}
      </button>
    </nav>
  );
}

function SidebarItem({
  item,
  active,
  collapsed,
  onClick,
  isAgent,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  isAgent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={item.label}
      style={{
        width: "100%",
        height: collapsed ? 40 : 32,
        border: "none",
        borderRadius: 8,
        background: active ? "var(--console-sidebar-active)" : "transparent",
        color: active ? "var(--musu-color-brand-accent)" : "var(--console-sidebar-text)",
        fontSize: isAgent ? 11 : (collapsed ? 16 : 13),
        fontWeight: active ? 700 : (isAgent ? 600 : 400),
        fontFamily: isAgent ? "var(--font-mono)" : "inherit",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? 0 : "0 8px",
        gap: 8,
        position: "relative",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 3,
            borderRadius: "0 2px 2px 0",
            background: "var(--musu-color-brand-accent)",
          }}
        />
      )}
      <span style={{ fontSize: isAgent ? 11 : 16, lineHeight: 1, width: collapsed ? "auto" : 20, textAlign: "center", flexShrink: 0 }}>
        {item.icon}
      </span>
      {!collapsed && (
        <span style={{ fontSize: 13, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.label}
        </span>
      )}
    </button>
  );
}

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (collapsed) return null;
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: "var(--console-sidebar-text)",
        padding: "8px 8px 2px",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        opacity: 0.4,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--console-sidebar-border)",
        margin: "6px 8px",
      }}
    />
  );
}
