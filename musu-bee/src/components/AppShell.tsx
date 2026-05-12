"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect } from "react";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import type { RegistryNode } from "@/lib/types/node";
import AIDisplay from "@/components/AIDisplay";
import type { DisplayContent } from "@/components/AIDisplay";
import ChatArea from "@/components/ChatArea";
import CompanyTemplateModal from "@/components/CompanyTemplateModal";
import OnboardingModal from "@/components/OnboardingModal";
import CompanyOnboardingModal from "@/components/CompanyOnboardingModal";
import type { InboxJumpTarget } from "@/components/inbox/InboxBell";
import { useInbox } from "@/lib/useInbox";
import CommandPalette from "@/components/CommandPalette";
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
import { useAuth } from "@/lib/useAuth";
import { useDeviceDiscovery } from "@/lib/useDeviceDiscovery";
import { useAgentsSurface } from "@/lib/useAgentsSurface";
import { useCompanyState } from "@/lib/useCompanyState";
import { useChat } from "@/lib/useChat";
import { useServiceHealth } from "@/lib/useServiceHealth";
import { useHealthPopover } from "@/lib/useHealthPopover";
import { useNodes } from "@/lib/useNodes";
import { getSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { Channel, ChannelId, ChatChannelId, PanelId, Message } from "@/types";
import { AGENT_CHANNELS } from "@/types";

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const CHANNEL_DESCRIPTIONS: Partial<Record<ChannelId, string>> = {
  general: "Everything starts here",
  dev: "Internal device-to-device discussion",
  tasks: "Work currently in progress",
  alerts: "Device state changes, errors, and completion alerts",
  issues: "Company issue tracker",
  approvals: "Pending approval requests",
  projects: "Company project index",
  goals: "Company goals tracker",
  costs: "Request cost analytics",
  search: "Search the indexed codebase",
  nodes: "Multi-machine mesh nodes",
  wiki: "Company knowledge base",
  ceo: "CEO agent",
  cto: "CTO agent",
  engineer: "Engineer agent",
  cos: "Chief of staff agent",
  qa: "QA agent",
  worker: "Worker agent",
};

const INITIAL_CHANNELS: Channel[] = [
  // 집사
  { id: "ceo", name: "ceo", displayName: "집사 (이 기기)", avatar: "🤵", category: "butler", unread: 0, status: "online" },
  // 단체방
  { id: "general", name: "general", displayName: "#ceo-board", avatar: "📢", category: "group", unread: 0 },
  { id: "dev", name: "dev", displayName: "#dev", avatar: "💻", category: "group", unread: 0 },
  { id: "alerts", name: "alerts", displayName: "#alerts", avatar: "🔔", category: "group", unread: 0 },
  // 직접 대화 (에이전트)
  { id: "cto", name: "cto", displayName: "CTO", avatar: "🔧", category: "agent", unread: 0 },
  { id: "engineer", name: "engineer", displayName: "Engineer", avatar: "👨‍💻", category: "agent", unread: 0 },
  { id: "qa", name: "qa", displayName: "QA", avatar: "🔍", category: "agent", unread: 0 },
  { id: "cos", name: "cos", displayName: "Chief of Staff", avatar: "📋", category: "agent", unread: 0 },
  { id: "worker", name: "worker", displayName: "Worker", avatar: "⚙️", category: "agent", unread: 0 },
  // 패널 (회사/관리)
  { id: "dashboard", name: "dashboard", displayName: "대시보드", avatar: "📊", category: "panel", unread: 0 },
  { id: "tasks", name: "tasks", displayName: "태스크", avatar: "✅", category: "panel", unread: 0 },
  { id: "issues", name: "issues", displayName: "이슈", avatar: "🎯", category: "panel", unread: 0 },
  { id: "wiki", name: "wiki", displayName: "위키", avatar: "📖", category: "panel", unread: 0 },
  { id: "nodes", name: "nodes", displayName: "기기", avatar: "🖥️", category: "panel", unread: 0 },
  { id: "processes", name: "processes", displayName: "프로세스", avatar: "⚡", category: "panel", unread: 0 },
  { id: "approvals", name: "approvals", displayName: "승인", avatar: "✋", category: "panel", unread: 0 },
  { id: "projects", name: "projects", displayName: "프로젝트", avatar: "📁", category: "panel", unread: 0 },
  { id: "goals", name: "goals", displayName: "목표", avatar: "🎯", category: "panel", unread: 0 },
  { id: "costs", name: "costs", displayName: "비용", avatar: "💰", category: "panel", unread: 0 },
  { id: "search", name: "search", displayName: "검색", avatar: "🔎", category: "panel", unread: 0 },
];

export default function AppShell() {
  const router = useRouter();

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { userIdentity, authEnabled, authConfigured } = useAuth();
  const { devices } = useDeviceDiscovery();
  const { nodes } = useNodes();

  const handleHandoff = useCallback((newBoss: string) => {
    const sysMsg: Message = {
      id: `handoff-${Date.now()}`,
      channelId: "general",
      sender: "System",
      senderKind: "system",
      text: `🔄 Leader handoff → **${newBoss}**`,
      timestamp: new Date(),
    };
    setLocalMessages((prev) => [...prev, sysMsg]);
  }, []);

  const { agentsSurface } = useAgentsSurface(handleHandoff);
  const {
    companyTemplate,
    companySetup,
    companyActivation,
    companyRegistry,
    deviceLimit,
    workspaceId,
    activeCompany,
    displayCompanyName,
    displaySelectedProjects,
    handleSaveCompanySetup,
    handleApplyCompanyTemplate,
    handleSelectActiveCompany,
    handleSyncCompany,
    handleDeleteCompany,
  } = useCompanyState(userIdentity);

  // ── Bridge company fallback (when musu-bee company system has no data) ────
  const [bridgeCompanyId, setBridgeCompanyId] = useState<string | null>(null);
  useEffect(() => {
    if (activeCompany?.companyId) return; // Already have company from musu-bee system
    fetch("/api/bridge/workspace")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.active_company_id) setBridgeCompanyId(d.active_company_id); })
      .catch(() => {});
  }, [activeCompany?.companyId]);
  const effectiveCompanyId = activeCompany?.companyId ?? bridgeCompanyId;

  // ── v12-inbox: shared attention surface — TopBar bell + canvas flash ──────
  const inbox = useInbox(effectiveCompanyId, userIdentity.id);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [activeChannel, setActiveChannel] = useState<ChannelId>("ceo");
  // 3-panel state: separate panel (center) from chat (right)
  const [activePanel, setActivePanel] = useState<PanelId>("canvas");
  const [activeChat, setActiveChat] = useState<ChatChannelId>("ceo");
  const [displayOverlay, setDisplayOverlay] = useState<DisplayContent | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === "undefined") return false;
    // Skip onboarding in embed mode (iframe from musu.pro)
    if (new URLSearchParams(window.location.search).get("embed") === "1") return false;
    return !localStorage.getItem("musu_onboarded");
  });
  const [showCompanyTemplate, setShowCompanyTemplate] = useState(false);
  const [showCompanyOnboarding, setShowCompanyOnboarding] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteInjection, setPaletteInjection] = useState("");

  const { healthPopover, setHealthPopover, popoverRef, handleBadgeClick } = useHealthPopover();

  const isAgentChannel = AGENT_CHANNELS.includes(activeChannel);

  // ── Node selection state ───────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    const onlineNode = nodes.find(n => n.status === "online");
    return onlineNode?.name ?? nodes[0]?.name ?? "local";
  });

  // Update selectedNodeId when nodes change
  useEffect(() => {
    if (nodes.length === 0) return;
    const currentNodeExists = nodes.some(n => n.name === selectedNodeId);
    if (!currentNodeExists) {
      const onlineNode = nodes.find(n => n.status === "online");
      setSelectedNodeId(onlineNode?.name ?? nodes[0]?.name ?? "local");
    }
  }, [nodes, selectedNodeId]);

  const chat = useChat(activeChannel, nodes, selectedNodeId);
  const serviceHealth = useServiceHealth();

  // ── Command palette keyboard shortcut ──────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleChannelSelect = useCallback((id: ChannelId) => {
    setActiveChannel(id);
    setChannels((prev) => prev.map((ch) => (ch.id === id ? { ...ch, unread: 0 } : ch)));
  }, []);

  const handleDeviceSelect = useCallback((_id: string) => {
    setActiveChannel("general");
  }, []);

  const handleOnboardingComplete = useCallback(
    (_deviceName: string) => {
      // musu-port discovers devices automatically — no manual registration needed
      localStorage.setItem("musu_onboarded", "true");
      setShowOnboarding(false);
    },
    [],
  );

  const handleOnboardingSkip = useCallback(() => {
    localStorage.setItem("musu_onboarded", "true");
    setShowOnboarding(false);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (isAgentChannel) {
        const companyCtx =
          displayCompanyName || workspaceId
            ? { company: displayCompanyName ?? undefined, workspace: workspaceId ?? undefined }
            : undefined;
        chat.sendMessage(text, chat.activeNode, companyCtx);
      } else {
        const userMsg: Message = {
          id: makeId(),
          channelId: activeChannel,
          sender: "User",
          senderKind: "user",
          text,
          timestamp: new Date(),
        };
        setLocalMessages((prev) => [...prev, userMsg]);
      }
    },
    [activeChannel, isAgentChannel, chat],
  );

  const displayMessages = isAgentChannel
    ? chat.messages
    : localMessages.filter((m) => m.channelId === activeChannel);

  // Update channel lastMessage when messages change
  useEffect(() => {
    if (displayMessages.length > 0) {
      const last = displayMessages[displayMessages.length - 1];
      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === activeChannel
            ? { ...ch, lastMessage: { text: last.text.slice(0, 60), timestamp: last.timestamp } }
            : ch
        )
      );
    }
  }, [displayMessages.length, activeChannel]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Map nodes for ConsoleShell
  const consoleNodes: RegistryNode[] = nodes.map((n: Record<string, unknown>) => ({
    id: (n.id as string) || `node-${n.name}`,
    user_id: (n.user_id as string) || "local",
    node_name: (n.name as string) || "unknown",
    public_url: (n.url as string) || "",
    last_seen: n.status === "online" ? new Date().toISOString() : null,
    health_status: n.status === "online" ? "online" : "offline",
    meta: (n.meta as Record<string, unknown>) || {},
    gpu: (n.gpu as string) || undefined,
    roles: (n.roles as string[]) || undefined,
  }));

  const consoleUser = {
    email: userIdentity.email || "user@local",
    displayName: displayCompanyName,
    avatarUrl: null as string | null,
  };

  const handleInboxJump = useCallback((target: InboxJumpTarget) => {
    if (target.kind === "approvals") {
      setActivePanel("approvals");
    } else if (target.kind === "issues") {
      setActivePanel("issues");
    } else if (target.kind === "channel") {
      // Company boards land on the general agent channel; specific channel
      // names route directly if they match a known ChatChannelId.
      const known = AGENT_CHANNELS.includes(target.channelId as ChannelId);
      setActiveChat((known ? target.channelId : "general") as ChatChannelId);
    }
    setDisplayOverlay(null);
  }, []);

  return (
    <ConsoleShell
      user={consoleUser}
      nodes={consoleNodes}
      activePanel={activePanel}
      onNavigate={(id) => { setActivePanel(id as PanelId); setDisplayOverlay(null); }}
      inbox={inbox}
      onInboxJump={handleInboxJump}
    >
      {/* Main content below — ConsoleShell provides sidebar + topbar */}
      {/* Main content — panels + chat (ConsoleShell provides sidebar+topbar) */}
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
        }}
      >
        {/* Center: AI Display (tabbed panels + AI content) */}
        <AIDisplay
          activePanel={activePanel}
          companyId={effectiveCompanyId}
          onTriggerOnboarding={() => setShowCompanyOnboarding(true)}
          flashCompanyIds={inbox.flashCompanyIds}
          onFlashConsumed={inbox.clearFlash}
        />

        {/* Right: Chat (always visible) */}
        <div style={{ width: 420, minWidth: 360, maxWidth: 520, borderLeft: "1px solid var(--border-subtle, rgba(255,255,255,0.06))" }}>
          <ChatArea
            key={activeChat}
            channelId={activeChat}
            messages={displayMessages}
            onSend={handleSend}
            isAgentTyping={isAgentChannel ? chat.isAgentTyping : false}
            isConnected={isAgentChannel ? chat.isConnected : undefined}
            channelDescription={CHANNEL_DESCRIPTIONS[activeChannel]}
            activeCompanyName={displayCompanyName}
            workspaceId={workspaceId}
            selectedProjects={displaySelectedProjects}
            isLoadingHistory={isAgentChannel ? chat.isLoadingHistory : false}
            hasMoreHistory={isAgentChannel ? chat.hasMoreHistory : false}
            loadOlderMessages={isAgentChannel ? chat.loadOlderMessages : undefined}
            agentsSurface={agentsSurface}
            onApprovePlan={isAgentChannel ? chat.approvePlan : undefined}
            onRejectPlan={isAgentChannel ? chat.rejectPlan : undefined}
            externalInput={paletteInjection}
            onExternalInputConsumed={() => setPaletteInjection("")}
            onNodeChange={isAgentChannel ? chat.setActiveNode : undefined}
            activeNode={isAgentChannel ? chat.activeNode : undefined}
            availableNodes={nodes}
          />
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onChannelSelect={(id) => {
          handleChannelSelect(id);
          setShowPalette(false);
        }}
        onInjectText={(text) => {
          setPaletteInjection(text);
          setShowPalette(false);
        }}
      />

      {/* Modals */}
      {showOnboarding && (
        <OnboardingModal
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
      {showCompanyOnboarding && (
        <CompanyOnboardingModal
          availableNodes={nodes.map((n: Record<string, unknown>) => ({
            name: (n.name as string) ?? "unknown",
            status: (n.status as string) ?? "offline",
          }))}
          onClose={() => setShowCompanyOnboarding(false)}
        />
      )}
      {showCompanyTemplate && (
        <CompanyTemplateModal
          template={companyTemplate}
          companySetup={companySetup}
          companyActivation={companyActivation}
          companyRegistry={companyRegistry}
          onSave={handleSaveCompanySetup}
          onApply={handleApplyCompanyTemplate}
          onSelectActive={handleSelectActiveCompany}
          onSync={handleSyncCompany}
          onDelete={handleDeleteCompany}
          onClose={() => setShowCompanyTemplate(false)}
        />
      )}
    </ConsoleShell>
  );
}
