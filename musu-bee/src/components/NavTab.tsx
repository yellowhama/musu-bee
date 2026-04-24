"use client";

import type { PanelId, ChatChannelId } from "@/types";
import { AGENT_CHANNELS } from "@/types";

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
  { id: "search", icon: "⌕", label: "Search", type: "panel" },
  { id: "nodes", icon: "⬡", label: "Nodes", type: "panel" },
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
  const isActive = (item: NavItem) =>
    item.type === "panel"
      ? activePanel === item.id
      : activeChat === item.id;

  const handleClick = (item: NavItem) => {
    if (item.type === "panel") onPanelSelect(item.id as PanelId);
    else onChatSelect(item.id as ChatChannelId);
  };

  return (
    <nav
      style={{
        width: 64,
        minWidth: 64,
        height: "100%",
        background: "var(--bg-base, var(--bg-base))",
        borderRight: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        gap: 2,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Company badge */}
      {companyName && (
        <div
          title={companyName}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--musu-yellow, #FFD166)",
            color: "var(--musu-cocoa-brown, #2D1D19)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 800,
            marginBottom: 8,
            cursor: "default",
          }}
        >
          {companyName.slice(0, 2).toUpperCase()}
        </div>
      )}

      {/* Panel items */}
      {PANEL_ITEMS.map((item) => (
        <NavButton key={item.id} item={item} active={isActive(item)} onClick={() => handleClick(item)} />
      ))}

      <Divider />

      {/* Chat */}
      {CHAT_ITEMS.map((item) => (
        <NavButton key={item.id} item={item} active={isActive(item)} onClick={() => handleClick(item)} />
      ))}

      <Divider />

      {/* Agents */}
      {AGENT_ITEMS.map((item) => (
        <NavButton key={item.id} item={item} active={isActive(item)} onClick={() => handleClick(item)} isAgent />
      ))}
    </nav>
  );
}

function NavButton({
  item,
  active,
  onClick,
  isAgent,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  isAgent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={item.label}
      style={{
        width: 48,
        height: 40,
        border: "none",
        borderRadius: 8,
        background: active ? "var(--bg-hover, #2a2a2a)" : "transparent",
        color: active ? "var(--fg1, #F3F4F6)" : "var(--fg3, #6B7280)",
        fontSize: isAgent ? 11 : 16,
        fontWeight: isAgent ? 700 : 400,
        fontFamily: isAgent ? "var(--font-jetbrains, monospace)" : "inherit",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        position: "relative",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: "0 2px 2px 0",
            background: "var(--musu-yellow, #FFD166)",
          }}
        />
      )}
      <span style={{ fontSize: isAgent ? 11 : 16, lineHeight: 1 }}>{item.icon}</span>
      <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.6 }}>{item.label}</span>
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 32,
        height: 1,
        background: "var(--border-subtle, rgba(255,255,255,0.06))",
        margin: "6px 0",
      }}
    />
  );
}
