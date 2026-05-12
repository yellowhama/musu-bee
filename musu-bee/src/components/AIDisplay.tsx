"use client";

import { useState, useCallback, useEffect } from "react";
import type { PanelId } from "@/types";
import ProjectBriefing from "@/components/ProjectBriefing";
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
import CompanyCanvasPanel from "@/components/CompanyCanvasPanel";

// ── Tab types ────────────────────────────────────────────────────────────────

export type DisplayContent =
  | { type: "dashboard" }
  | { type: "files" }
  | { type: "panel"; panel: PanelId }
  | { type: "document"; title: string; markdown: string }
  | { type: "code"; filename: string; code: string; language?: string }
  | { type: "image"; url: string; alt?: string };

interface Tab {
  id: string;
  label: string;
  icon: string;
  content: DisplayContent;
  pinned: boolean;
}

const PINNED_TABS: Tab[] = [
  { id: "__files", label: "Files", icon: "📁", content: { type: "files" }, pinned: true },
  { id: "__dashboard", label: "Briefing", icon: "⊞", content: { type: "dashboard" }, pinned: true },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface AIDisplayProps {
  activePanel: PanelId;
  companyId?: string | null;
  /** External request to open a tab (from NavTab click or AI push) */
  openRequest?: DisplayContent | null;
  onOpenHandled?: () => void;
  /** v12-canvas F — open onboarding from the empty-canvas trigger. */
  onTriggerOnboarding?: () => void;
  /** v12-inbox D — company ids to yellow-ring flash on the canvas. */
  flashCompanyIds?: string[];
  /** v12-inbox D — clear a company's flash once the animation ends. */
  onFlashConsumed?: (companyId: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AIDisplay({ activePanel, companyId, openRequest, onOpenHandled, onTriggerOnboarding, flashCompanyIds, onFlashConsumed }: AIDisplayProps) {
  const [tabs, setTabs] = useState<Tab[]>([...PINNED_TABS]);
  const [activeTabId, setActiveTabId] = useState("__dashboard");

  // Handle external open requests (from NavTab or AI)
  const openTab = useCallback((content: DisplayContent) => {
    const id = tabId(content);
    const existing = tabs.find((t) => t.id === id);
    if (existing) {
      setActiveTabId(id);
      return;
    }
    const newTab: Tab = {
      id,
      label: tabLabel(content),
      icon: tabIcon(content),
      content,
      pinned: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs]);

  // v13-visual P0-3 — Sync activePanel → tab as an effect (was: setTimeout
  // inside the render function, which violated React's no-side-effect rule
  // and caused hydration mismatches + missing canvas surface on /app load).
  useEffect(() => {
    if (activePanel === "dashboard") return;
    const panelTabId = `panel-${activePanel}`;
    const exists = tabs.some((t) => t.id === panelTabId);
    if (!exists || activeTabId !== panelTabId) {
      openTab({ type: "panel", panel: activePanel });
    }
  }, [activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  // v13-visual P0-3 — Same pattern for AI push requests.
  useEffect(() => {
    if (!openRequest || !onOpenHandled) return;
    openTab(openRequest);
    onOpenHandled();
  }, [openRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id);
        const next = filtered[Math.min(idx, filtered.length - 1)];
        if (next) setActiveTabId(next.id);
      }
      return filtered;
    });
  }, [activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-surface, #111)", overflow: "hidden" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          background: "var(--bg-base, var(--bg-base))",
          flexShrink: 0,
          overflowX: "auto",
          overflowY: "hidden",
          height: 36,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              border: "none",
              borderBottom: activeTabId === tab.id ? "2px solid var(--musu-yellow, #FFD166)" : "2px solid transparent",
              background: activeTabId === tab.id ? "var(--bg-surface, #111)" : "transparent",
              color: activeTabId === tab.id ? "var(--fg1, #F3F4F6)" : "var(--fg3, #6B7280)",
              fontSize: 12,
              fontWeight: activeTabId === tab.id ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              fontFamily: "inherit",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            <span style={{ fontSize: 13 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            {!tab.pinned && (
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{
                  fontSize: 10,
                  color: "var(--fg4, var(--fg4))",
                  cursor: "pointer",
                  marginLeft: 4,
                  padding: "2px 4px",
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "var(--fg2)"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "var(--fg4)"; }}
              >
                ✕
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab && (
          <TabContent
            content={activeTab.content}
            companyId={companyId}
            onTriggerOnboarding={onTriggerOnboarding}
            flashCompanyIds={flashCompanyIds}
            onFlashConsumed={onFlashConsumed}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab Content Renderer ─────────────────────────────────────────────────────

function TabContent({
  content,
  companyId,
  onTriggerOnboarding,
  flashCompanyIds,
  onFlashConsumed,
}: {
  content: DisplayContent;
  companyId?: string | null;
  onTriggerOnboarding?: () => void;
  flashCompanyIds?: string[];
  onFlashConsumed?: (companyId: string) => void;
}) {
  switch (content.type) {
    case "dashboard":
      return <ProjectBriefing companyId={companyId} />;
    case "files":
      return <FilesView />;
    case "panel":
      return (
        <PanelView
          panel={content.panel}
          companyId={companyId}
          onTriggerOnboarding={onTriggerOnboarding}
          flashCompanyIds={flashCompanyIds}
          onFlashConsumed={onFlashConsumed}
        />
      );
    case "document":
      return <DocumentView title={content.title} markdown={content.markdown} />;
    case "code":
      return <CodeView filename={content.filename} code={content.code} language={content.language} />;
    case "image":
      return <ImageView url={content.url} alt={content.alt} />;
    default:
      return null;
  }
}

// ── Panel View (existing panels) ─────────────────────────────────────────────

function PanelView({
  panel,
  companyId,
  onTriggerOnboarding,
  flashCompanyIds,
  onFlashConsumed,
}: {
  panel: PanelId;
  companyId?: string | null;
  onTriggerOnboarding?: () => void;
  flashCompanyIds?: string[];
  onFlashConsumed?: (companyId: string) => void;
}) {
  const cid = companyId ?? undefined;
  switch (panel) {
    case "canvas":
      return (
        <CompanyCanvasPanel
          companyId={cid ?? null}
          onTriggerOnboarding={onTriggerOnboarding}
          flashCompanyIds={flashCompanyIds}
          onFlashConsumed={onFlashConsumed}
        />
      );
    case "tasks": return <TasksPanel />;
    case "processes": return <ProcessesPanel />;
    case "issues": return <IssuesPanel companyId={cid} />;
    case "approvals": return <ApprovalsPanel companyId={cid} />;
    case "projects": return <ProjectsPanel companyId={cid} />;
    case "goals": return <GoalsPanel companyId={cid} />;
    case "costs": return <CostsPanel companyId={cid} />;
    case "search": return <SearchPanel />;
    case "nodes": return <NodesPanel />;
    case "wiki": return <WikiPanel companyId={cid} />;
    default: return <DashboardView companyId={companyId} />;
  }
}

// ── Built-in Views ───────────────────────────────────────────────────────────

function DashboardView({ companyId }: { companyId?: string | null }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 48, opacity: 0.12 }}>⊞</span>
      <span style={{ fontSize: 13, color: "var(--fg3, #6B7280)" }}>
        {companyId ? "Company Dashboard" : "No company selected"}
      </span>
      <span style={{ fontSize: 11, color: "var(--fg4, var(--fg4))" }}>
        Select a panel from the left, or wait for AI to show something here
      </span>
    </div>
  );
}

function FilesView() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 48, opacity: 0.12 }}>📁</span>
      <span style={{ fontSize: 13, color: "var(--fg3, #6B7280)" }}>File Explorer</span>
      <span style={{ fontSize: 11, color: "var(--fg4, var(--fg4))" }}>
        Browse project files, docs, wiki pages
      </span>
    </div>
  );
}

function DocumentView({ title, markdown }: { title: string; markdown: string }) {
  return (
    <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--fg1)", marginBottom: 16 }}>{title}</h2>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--fg2, #9CA3AF)", lineHeight: 1.6, fontFamily: "inherit" }}>
        {markdown}
      </pre>
    </div>
  );
}

function CodeView({ filename, code, language }: { filename: string; code: string; language?: string }) {
  return (
    <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8, fontFamily: "var(--font-jetbrains, monospace)" }}>
        {filename} {language && <span style={{ opacity: 0.5 }}>({language})</span>}
      </div>
      <pre style={{
        background: "var(--bg-card, var(--bg-card))", borderRadius: 8, padding: 16,
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
    <div style={{ display: "flex", justifyContent: "center", padding: 20, overflow: "auto", flex: 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt || ""} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tabId(content: DisplayContent): string {
  switch (content.type) {
    case "dashboard": return "__dashboard";
    case "files": return "__files";
    case "panel": return `panel-${content.panel}`;
    case "document": return `doc-${content.title.slice(0, 20)}`;
    case "code": return `code-${content.filename}`;
    case "image": return `img-${content.url.slice(-20)}`;
  }
}

function tabLabel(content: DisplayContent): string {
  switch (content.type) {
    case "dashboard": return "Dashboard";
    case "files": return "Files";
    case "panel": return content.panel.charAt(0).toUpperCase() + content.panel.slice(1);
    case "document": return content.title.slice(0, 20);
    case "code": return content.filename.split("/").pop() || content.filename;
    case "image": return content.alt || "Image";
  }
}

function tabIcon(content: DisplayContent): string {
  switch (content.type) {
    case "dashboard": return "⊞";
    case "files": return "📁";
    case "panel": {
      const icons: Record<string, string> = {
        tasks: "☰", issues: "!", goals: "◎", wiki: "◧",
        costs: "$", search: "⌕", nodes: "⬡", projects: "▣",
        approvals: "✓", processes: "⚡",
      };
      return icons[content.panel] || "▪";
    }
    case "document": return "📄";
    case "code": return "⟨⟩";
    case "image": return "🖼";
  }
}
