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
  { id: "general", name: "general", unread: 0 },
  { id: "dev", name: "dev", unread: 0 },
  { id: "tasks", name: "tasks", unread: 0 },
  { id: "processes", name: "processes", unread: 0 },
  { id: "alerts", name: "alerts", unread: 0 },
  { id: "issues", name: "issues", unread: 0 },
  { id: "approvals", name: "approvals", unread: 0 },
  { id: "projects", name: "projects", unread: 0 },
  { id: "goals", name: "goals", unread: 0 },
  { id: "costs", name: "costs", unread: 0 },
  { id: "search", name: "search", unread: 0 },
  { id: "nodes", name: "nodes", unread: 0 },
  { id: "wiki", name: "wiki", unread: 0 },
  { id: "ceo", name: "ceo", unread: 0 },
  { id: "cto", name: "cto", unread: 0 },
  { id: "engineer", name: "engineer", unread: 0 },
  { id: "cos", name: "cos", unread: 0 },
  { id: "qa", name: "qa", unread: 0 },
  { id: "worker", name: "worker", unread: 0 },
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

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [activeChannel, setActiveChannel] = useState<ChannelId>("ceo");
  // 3-panel state: separate panel (center) from chat (right)
  const [activePanel, setActivePanel] = useState<PanelId>("dashboard");
  const [activeChat, setActiveChat] = useState<ChatChannelId>("ceo");
  const [displayOverlay, setDisplayOverlay] = useState<DisplayContent | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCompanyTemplate, setShowCompanyTemplate] = useState(false);
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
      setShowOnboarding(false);
    },
    [],
  );

  const handleOnboardingSkip = useCallback(() => {
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

  // ── Render ─────────────────────────────────────────────────────────────────

  // Map nodes for ConsoleShell
  const consoleNodes: RegistryNode[] = nodes.map((n: Record<string, unknown>) => ({
    node_name: (n.name as string) || "unknown",
    public_url: (n.url as string) || "",
    last_seen: new Date().toISOString(),
    gpu: (n.gpu as string) || undefined,
    roles: (n.roles as string[]) || undefined,
  }));

  const consoleUser = {
    email: userIdentity.email || "user@local",
    displayName: displayCompanyName,
    avatarUrl: null as string | null,
  };

  return (
    <ConsoleShell user={consoleUser} nodes={consoleNodes} activePanel={activePanel} onNavigate={(id) => { setActivePanel(id as any); setDisplayOverlay(null); }}>
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
          companyId={activeCompany?.companyId}
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
