"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
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
import type { Channel, ChannelId, Message } from "@/types";
import { AGENT_CHANNELS } from "@/types";

function makeId() {
  return `msg-${crypto.randomUUID()}`;
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
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: "#0d0d0d",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Top header bar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          background: "#0d0d0d",
          borderBottom: "1px solid #1f1f1f",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          zIndex: 10,
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>🐝</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#f3f4f6",
            letterSpacing: "-0.02em",
          }}
        >
          {displayCompanyName}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#9ca3af",
            background: "#141414",
            border: "1px solid #262626",
            borderRadius: 999,
            padding: "4px 9px",
            letterSpacing: "0.04em",
          }}
          title={`Workspace scope: ${workspaceId}`}
        >
          {workspaceId}
        </span>
        <span
          style={{
            fontSize: 11,
            color:
              companyActivation?.controlPlaneSync.status === "ready"
                ? "#86efac"
                : companyActivation?.controlPlaneSync.status === "degraded"
                  ? "#fdba74"
                  : "#9ca3af",
            background: "#141414",
            border: "1px solid #262626",
            borderRadius: 999,
            padding: "4px 9px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
          title={companyActivation?.controlPlaneSync.message ?? "No control-plane sync yet."}
        >
          {companyActivation?.controlPlaneSync.status ?? "draft"}
        </span>
        {/* Node selector */}
        {nodes.length > 0 && (
          <select
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            style={{
              fontSize: 11,
              color: "#f3f4f6",
              background: "#141414",
              border: "1px solid #374151",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              outline: "none",
            }}
            title="Select active node"
          >
            {nodes.map((node) => {
              const statusEmoji =
                node.status === "online" ? "🟢" :
                node.status === "degraded" ? "🟡" :
                node.status === "offline" ? "🔴" :
                "⚪";
              return (
                <option key={node.name} value={node.name}>
                  {statusEmoji} {node.name}
                </option>
              );
            })}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {/* Service health badges — click to see version + latency popover */}
        {(["port", "bridge", "worker"] as const).map((svc) => {
          const status = serviceHealth[svc];
          const color =
            status === "up" ? "#86efac" :
            status === "down" ? "#f87171" :
            "#6b7280";
          const labels: Record<string, string> = { port: "PORT", bridge: "BRIDGE", worker: "WORKER" };
          return (
            <button
              key={svc}
              onClick={(e) => void handleBadgeClick(svc, e)}
              title={`musu-${svc}: ${status} — click for details`}
              style={{
                fontSize: 10,
                color,
                background: "#141414",
                border: `1px solid ${color}44`,
                borderRadius: 999,
                padding: "3px 8px",
                letterSpacing: "0.06em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 8 }}>●</span>
              {labels[svc]}
            </button>
          );
        })}
        {/* Health detail popover */}
        {healthPopover && (
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: healthPopover.anchor.y,
              left: healthPopover.anchor.x,
              background: "#1e1e1e",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "12px 16px",
              zIndex: 1000,
              minWidth: 170,
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, color: "#e5e7eb", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              musu-{healthPopover.svc}
            </div>
            {healthPopover.loading ? (
              <div style={{ color: "#6b7280" }}>Loading…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#9ca3af" }}>
                <div>
                  Status:{" "}
                  <span style={{ color: healthPopover.data?.status === "up" ? "#86efac" : "#f87171", fontWeight: 500 }}>
                    {healthPopover.data?.status ?? "unknown"}
                  </span>
                </div>
                {healthPopover.data?.latency_ms !== undefined && (
                  <div>Latency: <span style={{ color: "#e5e7eb" }}>{healthPopover.data.latency_ms}ms</span></div>
                )}
                {healthPopover.data?.version && (
                  <div>Version: <span style={{ color: "#e5e7eb" }}>{healthPopover.data.version}</span></div>
                )}
              </div>
            )}
          </div>
        )}
        <a
          href="/"
          style={{
            fontSize: 12,
            color: "#9ca3af",
            background: "transparent",
            border: "1px solid #2d2d2d",
            borderRadius: 6,
            padding: "4px 10px",
            textDecoration: "none",
          }}
        >
          View site
        </a>
        <button
          type="button"
          onClick={() => setShowCompanyTemplate(true)}
          style={{
            fontSize: 12,
            color: "#9ca3af",
            background: "#1a1a1a",
            border: "1px solid #2d2d2d",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Company template
        </button>
        {devices.length >= deviceLimit ? (
          <a
            href="/pricing"
            title={`Your current plan supports up to ${deviceLimit} devices.`}
            style={{
              fontSize: 12,
              color: "var(--musu-color-brand-accent)",
              background: "rgba(250,204,21,0.08)",
              border: "1px solid rgba(250,204,21,0.25)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              marginRight: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Device limit reached — upgrade
          </a>
        ) : (
          <button
            onClick={() => setShowOnboarding(true)}
            style={{
              fontSize: 12,
              color: "#9ca3af",
              background: "#1a1a1a",
              border: "1px solid #2d2d2d",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              marginRight: 8,
            }}
          >
            + Add device
          </button>
        )}
        {authEnabled && authConfigured && userIdentity.email && (
          <span
            style={{
              fontSize: 13,
              color: "#6b7280",
              background: "#1a1a1a",
              border: "1px solid #2d2d2d",
              borderRadius: 6,
              padding: "4px 10px",
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={userIdentity.email}
          >
            {userIdentity.email}
          </span>
        )}
        {authEnabled && authConfigured && (
          <button
            onClick={async () => {
              await getSupabaseClient().auth.signOut();
              router.replace("/auth/login");
            }}
            style={{
              fontSize: 12,
              color: "#6b7280",
              background: "transparent",
              border: "1px solid #2d2d2d",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
            title="Sign out"
          >
            Sign out
          </button>
        )}
      </div>

      {/* Main content */}
      <div
        style={{
          display: "flex",
          marginTop: 48,
          height: "calc(100vh - 48px)",
          width: "100%",
        }}
      >
        <Sidebar
          channels={channels}
          devices={devices}
          companyTemplate={companyTemplate}
          activeCompany={activeCompany}
          workspaceId={workspaceId}
          agentsSurface={agentsSurface}
          activeChannel={activeChannel}
          onChannelSelect={handleChannelSelect}
          onDeviceSelect={handleDeviceSelect}
        />
        {activeChannel === "tasks" ? (
          <TasksPanel />
        ) : activeChannel === "processes" ? (
          <ProcessesPanel />
        ) : activeChannel === "issues" ? (
          <IssuesPanel companyId={activeCompany?.companyId} />
        ) : activeChannel === "approvals" ? (
          <ApprovalsPanel companyId={activeCompany?.companyId} />
        ) : activeChannel === "projects" ? (
          <ProjectsPanel companyId={activeCompany?.companyId} />
        ) : activeChannel === "search" ? (
          <SearchPanel />
        ) : activeChannel === "goals" ? (
          <GoalsPanel companyId={activeCompany?.companyId} />
        ) : activeChannel === "costs" ? (
          <CostsPanel companyId={activeCompany?.companyId} />
        ) : activeChannel === "nodes" ? (
          <NodesPanel />
        ) : (
          <ChatArea
            key={activeChannel}
            channelId={activeChannel}
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
        )}
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
    </div>
  );
}
