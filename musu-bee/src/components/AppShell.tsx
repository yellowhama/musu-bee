"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import CompanyTemplateModal from "@/components/CompanyTemplateModal";
import OnboardingModal from "@/components/OnboardingModal";
import type { CompanyActivationState, CompanyRegistryState } from "@/lib/companyActivation";
import {
  defaultCompanyTemplate,
  type DefaultCompanyTemplate,
} from "@/lib/templates/defaultCompanyTemplate";
import {
  getDefaultCompanySetupState,
  type CompanySetupState,
} from "@/lib/companySetup";
import { useChat } from "@/lib/useChat";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { AgentsSurfaceSnapshot, Channel, ChannelId, Device, Message } from "@/types";
import { AGENT_CHANNELS } from "@/types";

let msgCounter = 10;
function makeId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

const CHANNEL_DESCRIPTIONS: Partial<Record<ChannelId, string>> = {
  general: "Everything starts here",
  dev: "Internal device-to-device discussion",
  tasks: "Work currently in progress",
  alerts: "Device state changes, errors, and completion alerts",
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
  { id: "alerts", name: "alerts", unread: 0 },
  { id: "ceo", name: "ceo", unread: 0 },
  { id: "cto", name: "cto", unread: 0 },
  { id: "engineer", name: "engineer", unread: 0 },
  { id: "cos", name: "cos", unread: 0 },
  { id: "qa", name: "qa", unread: 0 },
  { id: "worker", name: "worker", unread: 0 },
];

const INITIAL_DEVICES: Device[] = [
  {
    id: "desktop-4060",
    name: "4060Ti Desktop",
    label: "Musu-A",
    status: "online",
    stats: { cpu: 48, gpu: 23, ram: 62 },
    isLeader: true,
  },
  {
    id: "desktop-5070",
    name: "5070Ti Desktop",
    label: "Musu-B",
    status: "busy",
    stats: { cpu: 72, gpu: 61, ram: 45 },
    isLeader: false,
  },
];

export default function AppShell() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [agentsSurface, setAgentsSurface] = useState<AgentsSurfaceSnapshot | null>(null);
  const [activeChannel, setActiveChannel] = useState<ChannelId>("ceo");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCompanyTemplate, setShowCompanyTemplate] = useState(false);
  const [companyTemplate, setCompanyTemplate] =
    useState<DefaultCompanyTemplate>(defaultCompanyTemplate);
  const [companySetup, setCompanySetup] = useState<CompanySetupState>(
    getDefaultCompanySetupState(defaultCompanyTemplate)
  );
  const [companyActivation, setCompanyActivation] = useState<CompanyActivationState | null>(null);
  const [companyRegistry, setCompanyRegistry] = useState<CompanyRegistryState | null>(null);
  const [deviceLimit, setDeviceLimit] = useState<number>(3);

  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
  const authConfigured = isSupabaseConfigured();
  const workspaceId = "default-workspace";
  const userKey = userEmail?.trim().toLowerCase() || "anonymous";
  const companyScopeQuery = new URLSearchParams({
    workspaceId,
    userKey,
  }).toString();

  useEffect(() => {
    if (!authEnabled) {
      setUserEmail(null);
      return;
    }

    if (!authConfigured) {
      setUserEmail(null);
      router.replace("/auth/login");
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      if (data.session?.user) {
        setUserEmail(data.session.user.email ?? null);
      } else if (authEnabled) {
        router.replace("/auth/login");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email ?? null);
      } else if (authEnabled) {
        router.replace("/auth/login");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authConfigured, authEnabled, router]);

  const isAgentChannel = AGENT_CHANNELS.includes(activeChannel);
  const chat = useChat(activeChannel);

  useEffect(() => {
    fetch(`/api/company-setup?${companyScopeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CompanySetupState | null) => {
        if (data?.templateKey) {
          setCompanySetup(data);
        }
      })
      .catch(() => {});
  }, [companyScopeQuery]);

  useEffect(() => {
    fetch("/api/company-template")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DefaultCompanyTemplate | null) => {
        if (data?.templateKey) {
          setCompanyTemplate(data);
        }
      })
      .catch(() => {});
  }, []);

  const refreshCompanyActivation = useCallback(async () => {
    const response = await fetch(`/api/company-activation?${companyScopeQuery}`);
    if (!response.ok) {
      setCompanyActivation(null);
      setCompanyRegistry(null);
      return;
    }
    const payload = (await response.json()) as {
      activation?: CompanyActivationState | null;
      registry?: CompanyRegistryState | null;
    };
    setCompanyActivation(payload.activation ?? null);
    setCompanyRegistry(payload.registry ?? null);
  }, [companyScopeQuery]);

  useEffect(() => {
    void refreshCompanyActivation().catch(() => {
      setCompanyActivation(null);
      setCompanyRegistry(null);
    });
  }, [refreshCompanyActivation]);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { deviceLimit?: number } | null) => {
        if (data?.deviceLimit != null) setDeviceLimit(data.deviceLimit);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/device-status");
        if (!res.ok) {
          setDevices((prev) =>
            prev.map((d, i) => (i === 0 ? { ...d, status: "offline" as const } : d)),
          );
          return;
        }
        const data = (await res.json()) as {
          cpu: number;
          gpu: number | null;
          ram: number;
          device_id?: string;
          physical_host_id?: string | null;
        };
        setDevices((prev) => {
          const targetId = data.device_id ?? prev[0]?.id;
          return prev.map((d) =>
            d.id === targetId
              ? {
                  ...d,
                  status: "online" as const,
                  stats: {
                    cpu: Math.round(data.cpu),
                    gpu: data.gpu !== null ? Math.round(data.gpu) : null,
                    ram: Math.round(data.ram),
                  },
                }
              : d,
          );
        });
      } catch {
        setDevices((prev) =>
          prev.map((d, i) => (i === 0 ? { ...d, status: "offline" as const } : d)),
        );
      }
    }

    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchAgentsSurface() {
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) {
          setAgentsSurface((prev) => ({
            fetchedAt: new Date().toISOString(),
            degraded: true,
            degradedReason: `agents_route_http_${res.status}`,
            stale: true,
            summary: prev?.summary ?? {
              bossHost: null,
              lastHandoffTarget: null,
              handoffReasonCode: null,
              handoffRecordedAtMs: null,
              departments: [],
              statusCounts: {},
            },
            snapshot: prev?.snapshot ?? [],
          }));
          return;
        }
        const payload = (await res.json()) as AgentsSurfaceSnapshot;
        setAgentsSurface(payload);
      } catch {
        setAgentsSurface((prev) => ({
          fetchedAt: new Date().toISOString(),
          degraded: true,
          degradedReason: "agents_route_fetch_error",
          stale: true,
          summary: prev?.summary ?? {
            bossHost: null,
            lastHandoffTarget: null,
            handoffReasonCode: null,
            handoffRecordedAtMs: null,
            departments: [],
            statusCounts: {},
          },
          snapshot: prev?.snapshot ?? [],
        }));
      }
    }

    fetchAgentsSurface();
    const id = setInterval(fetchAgentsSurface, 5000);
    return () => clearInterval(id);
  }, []);

  const handleOnboardingComplete = useCallback(
    (deviceName: string) => {
      const newDevice: Device = {
        id: `device-${Date.now()}`,
        name: deviceName,
        label: `Musu-${String.fromCharCode(65 + devices.length)}`,
        status: "online",
        stats: { cpu: 0, gpu: null, ram: 0 },
        isLeader: devices.length === 0,
      };
      setDevices((prev) => [...prev, newDevice]);
      setShowOnboarding(false);
    },
    [devices.length],
  );

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleSaveCompanySetup = useCallback(
    async (next: { companyName: string; selectedProjects: string[] }) => {
      const res = await fetch(`/api/company-setup?${companyScopeQuery}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      const data = (await res.json()) as CompanySetupState | { error?: string };
      if (!res.ok) {
        throw new Error(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Could not save company setup."
        );
      }

      setCompanySetup(data as CompanySetupState);
    },
    [companyScopeQuery]
  );

  const handleApplyCompanyTemplate = useCallback(
    async (next: { companyName: string; selectedProjects: string[] }) => {
      await handleSaveCompanySetup(next);
      const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
        method: "POST",
      });
      const payload = (await res.json()) as
        | { activation?: CompanyActivationState | null; registry?: CompanyRegistryState | null; error?: string }
        | null;
      if (!res.ok || !payload?.activation) {
        throw new Error(payload?.error ?? "Could not apply company template.");
      }
      setCompanyActivation(payload.activation);
      setCompanyRegistry(payload.registry ?? null);
      setShowCompanyTemplate(false);
    },
    [companyScopeQuery, handleSaveCompanySetup]
  );

  const handleSelectActiveCompany = useCallback(
    async (companyId: string) => {
      const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", companyId }),
      });
      const payload = (await res.json()) as
        | { activation?: CompanyActivationState | null; registry?: CompanyRegistryState | null; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not set active company.");
      }
      setCompanyActivation(payload?.activation ?? null);
      setCompanyRegistry(payload?.registry ?? null);
    },
    [companyScopeQuery]
  );

  const handleSyncCompany = useCallback(
    async (companyId: string) => {
      const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", companyId }),
      });
      const payload = (await res.json()) as
        | { activation?: CompanyActivationState | null; registry?: CompanyRegistryState | null; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not sync company.");
      }
      setCompanyActivation(payload?.activation ?? null);
      setCompanyRegistry(payload?.registry ?? null);
    },
    [companyScopeQuery]
  );

  const handleDeleteCompany = useCallback(
    async (companyId: string) => {
      const res = await fetch(
        `/api/company-activation?${companyScopeQuery}&companyId=${encodeURIComponent(companyId)}`,
        {
          method: "DELETE",
        }
      );
      const payload = (await res.json()) as
        | { activation?: CompanyActivationState | null; registry?: CompanyRegistryState | null; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not delete company.");
      }
      setCompanyActivation(payload?.activation ?? null);
      setCompanyRegistry(payload?.registry ?? null);
    },
    [companyScopeQuery]
  );

  const handleChannelSelect = useCallback((id: ChannelId) => {
    setActiveChannel(id);
    setChannels((prev) => prev.map((ch) => (ch.id === id ? { ...ch, unread: 0 } : ch)));
  }, []);

  const handleDeviceSelect = useCallback((_id: string) => {
    setActiveChannel("general");
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (isAgentChannel) {
        chat.sendMessage(text);
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

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: "#0d0d0d",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
      }}
    >
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
          {companySetup.companyName}
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
        <div style={{ flex: 1 }} />
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
              color: "#facc15",
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
        {authEnabled && authConfigured && userEmail && (
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
            title={userEmail}
          >
            {userEmail}
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
        agentsSurface={agentsSurface}
        activeChannel={activeChannel}
        onChannelSelect={handleChannelSelect}
          onDeviceSelect={handleDeviceSelect}
        />
        <ChatArea
          key={activeChannel}
          channelId={activeChannel}
          messages={displayMessages}
          onSend={handleSend}
          isAgentTyping={isAgentChannel ? chat.isAgentTyping : false}
          isConnected={isAgentChannel ? chat.isConnected : undefined}
          channelDescription={CHANNEL_DESCRIPTIONS[activeChannel]}
          isLoadingHistory={isAgentChannel ? chat.isLoadingHistory : false}
          hasMoreHistory={isAgentChannel ? chat.hasMoreHistory : false}
          loadOlderMessages={isAgentChannel ? chat.loadOlderMessages : undefined}
        />
      </div>

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
