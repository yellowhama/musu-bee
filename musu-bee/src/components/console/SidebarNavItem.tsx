"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  badge?: number;
}

export function SidebarNavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  badge,
}: SidebarNavItemProps) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        height: "36px",
        padding: collapsed ? "0" : "0 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: "6px",
        textDecoration: "none",
        color: active ? "#FDFCF0" : "rgba(253,252,240,0.5)",
        background: active ? "rgba(255,209,102,0.10)" : "transparent",
        borderLeft: active ? "2px solid #FFD166" : "2px solid transparent",
        transition: "color 150ms, background 150ms",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ fontSize: "13px", fontWeight: 600, flex: 1 }}>{label}</span>
      )}
      {!collapsed && badge != null && badge > 0 && (
        <span
          style={{
            background: "#FFD166",
            color: "#2D1D19",
            borderRadius: "10px",
            padding: "1px 6px",
            fontSize: "10px",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
