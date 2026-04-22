"use client";

import type { PanelId } from "@/types";
import TasksPanel from "@/components/TasksPanel";
import ProcessesPanel from "@/components/ProcessesPanel";
import IssuesPanel from "@/components/IssuesPanel";
import ApprovalsPanel from "@/components/ApprovalsPanel";
import ProjectsPanel from "@/components/ProjectsPanel";
import CostsPanel from "@/components/CostsPanel";
import GoalsPanel from "@/components/GoalsPanel";
import SearchPanel from "@/components/SearchPanel";
import NodesPanel from "@/components/NodesPanel";
import WikiPanel from "@/components/WikiPanel";

/** Content the AI can push to the display */
export type DisplayContent =
  | { type: "dashboard" }
  | { type: "panel"; panel: PanelId }
  | { type: "document"; title: string; markdown: string }
  | { type: "code"; filename: string; code: string; language?: string }
  | { type: "image"; url: string; alt?: string };

interface AIDisplayProps {
  activePanel: PanelId;
  companyId?: string | null;
  /** AI-pushed content overrides activePanel when set */
  overlay?: DisplayContent | null;
  onOverlayClose?: () => void;
}

export default function AIDisplay({ activePanel, companyId, overlay, onOverlayClose }: AIDisplayProps) {
  // If AI pushed an overlay, show that instead
  if (overlay && overlay.type !== "dashboard" && overlay.type !== "panel") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-surface, #111)", overflow: "hidden" }}>
        <OverlayHeader title={overlayTitle(overlay)} onClose={onOverlayClose} />
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {overlay.type === "document" && <DocumentView title={overlay.title} markdown={overlay.markdown} />}
          {overlay.type === "code" && <CodeView filename={overlay.filename} code={overlay.code} language={overlay.language} />}
          {overlay.type === "image" && <ImageView url={overlay.url} alt={overlay.alt} />}
        </div>
      </div>
    );
  }

  // Normal panel rendering
  const panel = overlay?.type === "panel" ? overlay.panel : activePanel;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-surface, #111)", overflow: "hidden" }}>
      {panel === "dashboard" && <DashboardView companyId={companyId} />}
      {panel === "tasks" && <TasksPanel />}
      {panel === "processes" && <ProcessesPanel />}
      {panel === "issues" && <IssuesPanel companyId={companyId ?? undefined} />}
      {panel === "approvals" && <ApprovalsPanel companyId={companyId ?? undefined} />}
      {panel === "projects" && <ProjectsPanel companyId={companyId ?? undefined} />}
      {panel === "goals" && <GoalsPanel companyId={companyId ?? undefined} />}
      {panel === "costs" && <CostsPanel companyId={companyId ?? undefined} />}
      {panel === "search" && <SearchPanel />}
      {panel === "nodes" && <NodesPanel />}
      {panel === "wiki" && <WikiPanel companyId={companyId ?? undefined} />}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DashboardView({ companyId }: { companyId?: string | null }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 48, opacity: 0.15 }}>⊞</span>
      <span style={{ fontSize: 13, color: "var(--fg3, #6B7280)" }}>
        {companyId ? "Select a panel from the left" : "No company selected"}
      </span>
    </div>
  );
}

function OverlayHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg1, #F3F4F6)" }}>{title}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: "var(--fg3, #6B7280)",
            cursor: "pointer", fontSize: 16, padding: "2px 6px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function DocumentView({ title, markdown }: { title: string; markdown: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--fg1)", marginBottom: 16 }}>{title}</h2>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--fg2, #9CA3AF)", lineHeight: 1.6, fontFamily: "inherit" }}>
        {markdown}
      </pre>
    </div>
  );
}

function CodeView({ filename, code, language }: { filename: string; code: string; language?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8, fontFamily: "var(--font-jetbrains, monospace)" }}>
        {filename} {language && <span style={{ opacity: 0.5 }}>({language})</span>}
      </div>
      <pre style={{
        background: "var(--bg-card, #1a1a1a)", borderRadius: 8, padding: 16,
        fontSize: 12, lineHeight: 1.5, overflowX: "auto",
        fontFamily: "var(--font-jetbrains, monospace)", color: "var(--fg1)",
      }}>
        {code}
      </pre>
    </div>
  );
}

function ImageView({ url, alt }: { url: string; alt?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt || ""} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} />
    </div>
  );
}

function overlayTitle(content: DisplayContent): string {
  switch (content.type) {
    case "document": return content.title;
    case "code": return content.filename;
    case "image": return content.alt || "Image";
    default: return "";
  }
}
