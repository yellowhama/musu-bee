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
    height: "40px",
    padding: collapsed ? "0" : "0 12px",
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: "4px",
    textDecoration: "none",
    border: active ? "3px solid var(--border-default)" : "3px solid transparent",
    width: "100%",
    cursor: "pointer",
    color: active ? "var(--foreground-primary)" : "var(--foreground-inverse)",
    background: active ? "var(--accent-primary)" : "transparent",
    transition: "transform 100ms",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: "1px",
  };

  const inner = (
    <>
      <Icon size={16} strokeWidth={active ? 3 : 2} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ fontSize: "14px", fontWeight: 800, flex: 1, textAlign: "left" }}>{label}</span>
      )}
      {!collapsed && badge != null && badge > 0 && (
        <span style={{ background: "var(--foreground-primary)", color: "var(--foreground-inverse)", borderRadius: "0", border: "2px solid var(--border-default)", padding: "2px 8px", fontSize: "11px", fontWeight: 900, flexShrink: 0 }}>
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
