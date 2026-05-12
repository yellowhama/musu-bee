"use client";

import type { CSSProperties } from "react";

export interface CompanyCardAgent {
  id: string;
  name: string;
  role: string;
  /** Latest known status. */
  status: "working" | "idle" | "blocked" | "paused";
  /** Optional avatar emoji / character (e.g. 👑 / 🐝). */
  avatar?: string;
}

export interface CompanyCardData {
  companyId: string;
  companyName: string;
  /** One-line mission (truncated). */
  mission: string;
  /** Primary node id this company runs on (used by C for the border color). */
  primaryNode: string | null;
  /** Other nodes the company spills onto (for stripe). C uses this. */
  otherNodes: string[];
  agents: CompanyCardAgent[];
  /** Number of currently blocked issues, surfaces a red badge. */
  blockedCount: number;
}

export interface CompanyCardProps {
  data: CompanyCardData;
  /** Canvas-space position (already converted from tldraw coords). */
  style: CSSProperties;
  /** Clicked → AppShell can decide to zoom (v12-canvas E) or switch panel. */
  onClick?: (companyId: string) => void;
}

const STATUS_DOT_STYLE: Record<CompanyCardAgent["status"], CSSProperties> = {
  working: {
    background: "var(--status-online, #10b981)",
    boxShadow: "0 0 0 0 rgba(16,185,129,0.6)",
    animation: "agent-pulse 1.6s ease-out infinite",
  },
  idle: {
    background: "var(--fg4, #9ca3af)",
  },
  blocked: {
    background: "var(--status-error, #ef4444)",
  },
  paused: {
    background: "var(--status-warn, #f59e0b)",
  },
};

/**
 * Single company card — v12-canvas B.
 *
 * Renders 1차 정보 per wiki 295 §6 P0 + 사용자 결정 2026-05-12:
 *   - Company name + mission (1 line)
 *   - Agent list with status pulse (working = glow, idle = grey,
 *     blocked = red dot)
 *
 * Border color (C) and edge endpoints (D) come from parent props later.
 */
export default function CompanyCard({ data, style, onClick }: CompanyCardProps) {
  return (
    <div
      className="company-card"
      style={style}
      data-company-id={data.companyId}
      onClick={() => onClick?.(data.companyId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.(data.companyId);
      }}
    >
      <header className="company-card-header">
        <h3 className="company-card-name">{data.companyName}</h3>
        {data.blockedCount > 0 ? (
          <span className="company-card-blocked" title={`${data.blockedCount} blocked`}>
            {data.blockedCount}
          </span>
        ) : null}
      </header>
      <p className="company-card-mission">{data.mission}</p>
      <ul className="company-card-agents">
        {data.agents.slice(0, 8).map((a) => (
          <li key={a.id} className="company-card-agent" title={`${a.name} · ${a.role} · ${a.status}`}>
            <span className="company-card-agent-dot" style={STATUS_DOT_STYLE[a.status]} />
            <span className="company-card-agent-name">{a.avatar ?? a.role[0]?.toUpperCase() ?? "•"}</span>
          </li>
        ))}
        {data.agents.length > 8 ? (
          <li className="company-card-agent more">+{data.agents.length - 8}</li>
        ) : null}
      </ul>
    </div>
  );
}
