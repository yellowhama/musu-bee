"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Inbox, Building2, ListTodo, BookOpen, BarChart3, Settings, ScreenShare, ChevronsLeft, ChevronsRight, ExternalLink, LayoutGrid } from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";
import { useConsoleShell } from "./ConsoleShellContext";
import ThemeToggle from "../ThemeToggle";

const NAV_ITEMS = [
  { id: "home",      href: "/home",      icon: Inbox,       label: "Home" },
  // v13.3 — Canvas is the D1+D3 differentiator surface. It lives inside
  // /app, so the href just stays on /app and onNavigate switches the panel.
  { id: "canvas",    href: "/app",       icon: LayoutGrid,  label: "Canvas" },
  { id: "workspace", href: "/workspace", icon: Building2,   label: "Workspace" },
  { id: "tasks",     href: "/tasks",     icon: ListTodo,    label: "Tasks" },
  { id: "dashboard", href: "/fleet",     icon: BarChart3,   label: "Dashboard" },
  { id: "wiki",      href: "/wiki",      icon: BookOpen,    label: "Wiki" },
  { id: "screen",    href: "/screen",    icon: ScreenShare, label: "Screen" },
  { id: "account",   href: "/account",   icon: Settings,    label: "Account" },
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

  const width = collapsed ? 56 : 240;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width,
        background: "var(--surface-inverse)",
        borderRight: "3px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* Logo — 72px header row */}
      <div
        style={{
          height: "88px",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0" : "0 24px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderBottom: "0px solid var(--border-default)",
          flexShrink: 0,
        }}
      >
        <Link href="/home" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          {collapsed ? (
            <span
              style={{
                color: "var(--accent-primary)",
                fontWeight: 900,
                fontSize: "24px",
                letterSpacing: "-0.02em",
              }}
            >
              M
            </span>
          ) : (
            <span
              style={{
                color: "var(--accent-primary)",
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: "32px",
                letterSpacing: "-1px",
              }}
            >
              MUSU
            </span>
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav
        style={{
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        {NAV_ITEMS.map(({ id, href, icon, label }) => {
          const active = activePanel ? activePanel === id : (pathname === href || (pathname ?? "").startsWith(href + "/"));
          return (
            <SidebarNavItem
              key={id}
              id={id}
              href={href}
              icon={icon}
              label={label}
              active={active}
              collapsed={collapsed}
              onClick={onNavigate ? () => onNavigate(id) : undefined}
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
            borderTop: "3px solid var(--border-default)",
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
          borderTop: "2px solid var(--border-default)",
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
            color: "rgba(253,251,247,0.3)",
            cursor: "pointer",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "12px",
            fontWeight: 600,
            transition: "color 150ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg1)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(253,251,247,0.3)")}
        >
          <ExternalLink size={14} />
          {!collapsed && <span>GitHub</span>}
        </a>

        {/* Theme toggle */}
        <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "0" : "0 2px" }}>
          <ThemeToggle />
        </div>

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
            color: "rgba(253,251,247,0.3)",
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
