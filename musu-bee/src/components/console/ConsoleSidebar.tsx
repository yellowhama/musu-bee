"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Inbox, BookOpen, BarChart3, Settings, ScreenShare, ChevronsLeft, ChevronsRight, ExternalLink } from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";
import { useConsoleShell } from "./ConsoleShellContext";

const NAV_ITEMS = [
  { id: "dashboard", href: "/app", icon: Inbox, label: "Home" },
  { id: "tasks", href: "/app", icon: BarChart3, label: "Tasks" },
  { id: "issues", href: "/app", icon: Settings, label: "Issues" },
  { id: "wiki", href: "/app", icon: BookOpen, label: "Wiki" },
  { id: "costs", href: "/app", icon: BarChart3, label: "Costs" },
  { id: "nodes", href: "/app", icon: Settings, label: "Nodes" },
  { id: "screen", href: "/app/screen", icon: ScreenShare, label: "Screen" },
];

interface ConsoleSidebarProps {
  contextPanel?: React.ReactNode;
  onNavigate?: (id: string) => void;
  activePanel?: string;
}

export function ConsoleSidebar({ contextPanel, onNavigate, activePanel }: ConsoleSidebarProps) {
  const { collapsed, setCollapsed } = useConsoleShell();
  const pathname = usePathname();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "[") return;
      const target = e.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable]")) return;
      setCollapsed(!collapsed);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [collapsed, setCollapsed]);

  const width = collapsed ? 56 : 220;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width,
        background: "#261813",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* Logo — 40px header row */}
      <div
        style={{
          height: "40px",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0" : "0 14px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <Link href="/home" style={{ display: "flex", alignItems: "center" }}>
          {collapsed ? (
            <span
              style={{
                color: "#FFD166",
                fontWeight: 900,
                fontSize: "15px",
                letterSpacing: "-0.02em",
              }}
            >
              M
            </span>
          ) : (
            <Image
              src="/images/logos/favicon-header.png"
              alt="MUSU"
              width={612}
              height={200}
              style={{ width: 72, height: "auto" }}
              priority
            />
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav
        style={{
          padding: "8px 6px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          flexShrink: 0,
        }}
      >
        {NAV_ITEMS.map(({ id, href, icon, label }) => {
          const active = activePanel ? activePanel === id : (pathname === href || (pathname ?? "").startsWith(href + "/"));
          return (
            <SidebarNavItem
              key={id || href}
              id={id}
              href={href}
              icon={icon}
              label={label}
              active={active}
              collapsed={collapsed}
              onClick={onNavigate && id ? () => onNavigate(id) : undefined}
            />
          );
        })}
      </nav>

      {/* Context slot (wiki tree, etc.) */}
      {!collapsed && contextPanel && (
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {contextPanel}
        </div>
      )}

      {/* Spacer when no context panel */}
      {(!contextPanel || collapsed) && <div style={{ flex: 1 }} />}

      {/* Bottom actions: GitHub + collapse */}
      <div
        style={{
          padding: "8px 6px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {/* GitHub link */}
        <a
          href="https://github.com/yellowhama/musu-bee"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          style={{
            width: "100%",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            padding: collapsed ? "0" : "0 10px",
            gap: "10px",
            background: "none",
            border: "none",
            color: "rgba(253,252,240,0.3)",
            cursor: "pointer",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "12px",
            fontWeight: 600,
            transition: "color 150ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#FDFCF0")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(253,252,240,0.3)")}
        >
          <ExternalLink size={14} />
          {!collapsed && <span>GitHub</span>}
        </a>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar [" : "Collapse sidebar ["}
          style={{
            width: "100%",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-end",
            padding: collapsed ? "0" : "0 8px",
            background: "none",
            border: "none",
            color: "rgba(253,252,240,0.3)",
            cursor: "pointer",
            borderRadius: "6px",
            transition: "color 150ms",
          }}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>
    </div>
  );
}
