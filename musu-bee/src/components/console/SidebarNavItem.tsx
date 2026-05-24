"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  href: string;
  id?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
  onClick?: () => void;
}

export function SidebarNavItem({
  href,
  id,
  icon: Icon,
  label,
  active,
  collapsed,
  badge,
  onClick,
}: SidebarNavItemProps) {
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    height: "36px",
    padding: collapsed ? "0" : "0 12px",
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: "6px",
    textDecoration: "none",
    border: "none",
    width: "100%",
    cursor: "pointer",
    color: active ? "var(--musu-color-brand-canvas, #FDFBF7)" : "var(--console-sidebar-text, rgba(253,251,247,0.7))",
    background: active ? "var(--console-sidebar-active, rgba(255,166,2,0.10))" : "transparent",
    borderLeft: active ? "2px solid var(--accent, #FFA602)" : "2px solid transparent",
    transition: "color 150ms, background 150ms",
    overflow: "hidden",
    whiteSpace: "nowrap",
    fontSize: "inherit",
    fontFamily: "inherit",
  };

  const inner = (
    <>
      <Icon size={16} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ fontSize: "13px", fontWeight: 600, flex: 1, textAlign: "left" }}>{label}</span>
      )}
      {!collapsed && badge != null && badge > 0 && (
        <span style={{ background: "var(--accent, #FFA602)", color: "var(--fg-on-accent, #432c1c)", borderRadius: "10px", padding: "1px 6px", fontSize: "10px", fontWeight: 800, flexShrink: 0 }}>
          {badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} title={collapsed ? label : undefined} style={style}>{inner}</button>;
  }
  return <Link href={href} title={collapsed ? label : undefined} style={style}>{inner}</Link>;
}
