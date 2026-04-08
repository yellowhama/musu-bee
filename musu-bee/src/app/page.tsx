"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import OnboardingModal from "@/components/OnboardingModal";
import { useChat } from "@/lib/useChat";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Channel, ChannelId, Device, Message } from "@/types";
import { AGENT_CHANNELS } from "@/types";

let msgCounter = 10;
function makeId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

const CHANNEL_DESCRIPTIONS: Partial<Record<ChannelId, string>> = {
  general: "모든 대화가 여기서 시작됩니다",
  dev: "기기 간 내부 대화 (AI 협의)",
  tasks: "진행 중인 작업 목록",
  alerts: "기기 상태 변경, 에러, 완료 알림",
  ceo: "CEO 에이전트",
  cto: "CTO 에이전트",
  engineer: "엔지니어 에이전트",
  cos: "참모 에이전트",
  qa: "QA 에이전트",
  worker: "워커 에이전트",
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

export default function Home() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [activeChannel, setActiveChannel] = useState<ChannelId>("ceo");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState<number>(3);

  // Auth session — reads Supabase session and updates user email.
  // When NEXT_PUBLIC_AUTH_ENABLED=true (production), redirects to /auth/login if no session.
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
  const authConfigured = isSupabaseConfigured();
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

  // WebSocket chat for agent channels
  const isAgentChannel = AGENT_CHANNELS.includes(activeChannel);
  const chat = useChat(activeChannel);

  // Fetch subscription state once on mount.
  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { deviceLimit?: number } | null) => {
        if (data?.deviceLimit != null) setDeviceLimit(data.deviceLimit);
      })
      .catch(() => {});
  }, []);

  // Poll device status every 3 seconds.
  // Uses device_id returned by musu-portd /status so hardcoded IDs are not needed.
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/device-status");
        if (!res.ok) {
          // Mark first device offline when portd is unreachable
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
          // Match by device_id if portd provides it, otherwise fall back to first device
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

  const handleChannelSelect = useCallback((id: ChannelId) => {
    setActiveChannel(id);
    setChannels((prev) =>
      prev.map((ch) => (ch.id === id ? { ...ch, unread: 0 } : ch)),
    );
  }, []);

  const handleDeviceSelect = useCallback((_id: string) => {
    setActiveChannel("general");
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (isAgentChannel) {
        // Send via WebSocket
        chat.sendMessage(text);
      } else {
        // Local message for non-agent channels
        const userMsg: Message = {
          id: makeId(),
          channelId: activeChannel,
          sender: "유저",
          senderKind: "user",
          text,
          timestamp: new Date(),
        };
        setLocalMessages((prev) => [...prev, userMsg]);
      }
    },
    [activeChannel, isAgentChannel, chat],
  );

  // Merge local messages with WebSocket messages for the active channel
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
          "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
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
          MUSU
        </span>
        <div style={{ flex: 1 }} />
        {devices.length >= deviceLimit ? (
          <a
            href="/pro#pricing"
            title={`현재 플랜은 기기 ${deviceLimit}대까지 지원합니다.`}
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
            기기 한도 도달 — 업그레이드
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
            + 기기 추가
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
            title="로그아웃"
          >
            로그아웃
          </button>
        )}
      </div>

      {/* Body: sidebar + chat */}
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
    </div>
  );
}
