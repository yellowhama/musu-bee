"use client";

import { useMemo } from "react";

/**
 * Deterministic per-node color. Each unique node name gets a stable
 * color from the palette so the operator can see at a glance which
 * device a company runs on.
 *
 * v12-canvas C — used by CompanyCard's border (single node) or stripe
 * (multi-node spillover).
 */
const PALETTE = [
  "#3b82f6", // blue   — typical "primary" laptop / 4060
  "#a855f7", // purple — secondary GPU / 5070
  "#10b981", // green  — server / cloud relay
  "#f59e0b", // amber  — staging
  "#ec4899", // pink   — overflow node
  "#06b6d4", // cyan   — phone / edge
  "#84cc16", // lime
  "#ef4444", // red    — usually means alert/offline borrow
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Map node-name → hex color, deterministic. Same name always returns
 * the same color across sessions.
 */
export function nodeColor(name: string | null | undefined): string {
  if (!name) return "var(--border-subtle, #d1d5db)";
  return PALETTE[hashName(name) % PALETTE.length];
}

/**
 * Build a CSS border (single node) or background gradient (stripe for
 * multi-node) for a company card.
 */
export function nodeBorderStyle(primaryNode: string | null, otherNodes: string[]): {
  borderColor: string;
  background?: string;
} {
  const primary = nodeColor(primaryNode);
  if (otherNodes.length === 0) {
    return { borderColor: primary };
  }
  const colors = [primary, ...otherNodes.map(nodeColor)];
  const stops = colors
    .map((c, i, arr) => {
      const start = (i / arr.length) * 100;
      const end = ((i + 1) / arr.length) * 100;
      return `${c} ${start}%, ${c} ${end}%`;
    })
    .join(", ");
  return {
    borderColor: "transparent",
    background: `linear-gradient(var(--bg-card, #fff), var(--bg-card, #fff)) padding-box, linear-gradient(135deg, ${stops}) border-box`,
  };
}

export interface NodeBadgeData {
  name: string;
  status: string;
  color: string;
}

/**
 * Returns the array of badge entries for a card's footer (node legend).
 * Each entry includes the node's color.
 */
export function useNodeBadges(primaryNode: string | null, otherNodes: string[]): NodeBadgeData[] {
  return useMemo(() => {
    const all = [primaryNode, ...otherNodes].filter((n): n is string => Boolean(n));
    return all.map((name) => ({
      name,
      status: "online",
      color: nodeColor(name),
    }));
  }, [primaryNode, otherNodes]);
}
