"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import OnboardingModal from "@/components/OnboardingModal";
import type { Channel, ChannelId, Device, Message } from "@/types";

let msgCounter = 10;
function makeId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

const INITIAL_CHANNELS: Channel[] = [
  { id: "general", name: "general", unread: 0 },
  { id: "dev", name: "dev", unread: 2 },
  { id: "tasks", name: "tasks", unread: 1 },
  { id: "alerts", name: "alerts", unread: 0 },
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
  {
    id: "laptop",
    name: "노트북",
    label: "Musu-C",
    status: "offline",
    stats: { cpu: 0, gpu: null, ram: 0 },
    isLeader: false,
  },
];

const now = new Date();
function ts(minutesAgo: number) {
  return new Date(now.getTime() - minutesAgo * 60 * 1000);
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "msg-1",
    channelId: "general",
    sender: "Musu-A (4060Ti)",
    senderKind: "ai",
    text: "모닝 리포트입니다.\n- 4060Ti: GPU 사용률 23%, 대기 중\n- 5070Ti: 추론 작업 1건 진행 중\n- 노트북: 오프라인",
    timestamp: ts(10),
  },
  {
    id: "msg-2",
    channelId: "general",
    sender: "유저",
    senderKind: "user",
    text: "어제 만든 프레젠테이션 PDF로 만들어줘",
    timestamp: ts(8),
  },
  {
    id: "msg-3",
    channelId: "general",
    sender: "Musu-A (사장)",
    senderKind: "ai",
    text: "넵, GPU 작업은 아니라 제가 바로 처리하겠습니다.",
    timestamp: ts(8),
  },
  {
    id: "msg-4",
    channelId: "general",
    sender: "Musu-A",
    senderKind: "ai",
    text: "완료했습니다.",
    attachment: "presentation.pdf",
    timestamp: ts(7),
  },
  {
    id: "msg-5",
    channelId: "dev",
    sender: "Musu-A",
    senderKind: "ai",
    text: "5070Ti에 추론 작업 분배합니다. 예상 완료 2분.",
    timestamp: ts(15),
  },
  {
    id: "msg-6",
    channelId: "dev",
    sender: "Musu-B",
    senderKind: "ai",
    text: "수신. 큐 등록 완료.",
    timestamp: ts(14),
  },
  {
    id: "msg-7",
    channelId: "tasks",
    sender: "Musu-A",
    senderKind: "ai",
    text: "📋 현재 작업 목록\n\n[완료] presentation.pdf 변환\n[진행중] 5070Ti 추론 작업 (62%)\n[대기] 로그 분석 요청",
    timestamp: ts(5),
  },
  {
    id: "msg-8",
    channelId: "alerts",
    sender: "시스템",
    senderKind: "system",
    text: "노트북(Musu-C)이 오프라인 상태입니다.",
    timestamp: ts(30),
  },
  {
    id: "msg-9",
    channelId: "alerts",
    sender: "시스템",
    senderKind: "system",
    text: "5070Ti GPU 사용률 60% 초과 — 정상 범위입니다.",
    timestamp: ts(3),
  },
];

const AI_RESPONSES: Record<ChannelId, string[]> = {
  general: [
    "알겠습니다. 바로 처리하겠습니다.",
    "작업을 받았습니다. GPU 리소스를 확인 중입니다...",
    "완료했습니다. 결과를 확인해주세요.",
    "현재 5070Ti가 바쁘니 제가 직접 처리하겠습니다.",
    "넵. 예상 소요 시간은 약 2분입니다.",
  ],
  dev: [
    "리소스 분배 중...",
    "작업 큐 업데이트 완료.",
    "4060Ti ↔ 5070Ti 동기화 완료.",
  ],
  tasks: [
    "📋 작업 목록 업데이트됨.",
    "새 작업이 큐에 등록되었습니다.",
    "완료된 작업을 아카이브했습니다.",
  ],
  alerts: [
    "⚠️ 새 알림이 등록되었습니다.",
    "상태 변경 감지됨.",
  ],
};

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [activeChannel, setActiveChannel] = useState<ChannelId>("general");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  // Show onboarding when no devices are registered (new user flow).
  // For demo, default to false since mock devices are present.
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    INITIAL_DEVICES.length === 0
  );
  const [deviceLimit, setDeviceLimit] = useState<number>(1);

  // Fetch subscription state once on mount to get plan-based device limit.
  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { deviceLimit?: number } | null) => {
        if (data?.deviceLimit != null) setDeviceLimit(data.deviceLimit);
      })
      .catch(() => {/* keep default */});
  }, []);

  // Poll local musu-port /status every 3 seconds; update first (local) device stats.
  useEffect(() => {
    const LOCAL_DEVICE_ID = "desktop-4060";

    async function fetchStatus() {
      try {
        const res = await fetch("/api/device-status");
        if (!res.ok) {
          setDevices((prev) =>
            prev.map((d) =>
              d.id === LOCAL_DEVICE_ID ? { ...d, status: "offline" as const } : d
            )
          );
          return;
        }
        const data = (await res.json()) as { cpu: number; gpu: number | null; ram: number };
        setDevices((prev) =>
          prev.map((d) =>
            d.id === LOCAL_DEVICE_ID
              ? {
                  ...d,
                  status: "online" as const,
                  stats: {
                    cpu: Math.round(data.cpu),
                    gpu: data.gpu !== null ? Math.round(data.gpu) : null,
                    ram: Math.round(data.ram),
                  },
                }
              : d
          )
        );
      } catch {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === LOCAL_DEVICE_ID ? { ...d, status: "offline" as const } : d
          )
        );
      }
    }

    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, []);

  const handleOnboardingComplete = useCallback((deviceName: string) => {
    // Add the newly registered device to the device list
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
  }, [devices.length]);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleChannelSelect = useCallback(
    (id: ChannelId) => {
      setActiveChannel(id);
      // Clear unread for selected channel
      setChannels((prev) =>
        prev.map((ch) => (ch.id === id ? { ...ch, unread: 0 } : ch))
      );
    },
    []
  );

  const handleDeviceSelect = useCallback((id: string) => {
    // Switch to general and scroll — for now just switch to general
    setActiveChannel("general");
    setChannels((prev) =>
      prev.map((ch) => (ch.id === "general" ? { ...ch, unread: 0 } : ch))
    );
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: Message = {
        id: makeId(),
        channelId: activeChannel,
        sender: "유저",
        senderKind: "user",
        text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Route general channel messages to the real 파트장 AI via musu-port /chat.
      if (activeChannel === "general") {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
          });
          const data = (await res.json()) as { text?: string; error?: string };
          const reply = data.text ?? data.error ?? "응답을 받지 못했습니다.";
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              channelId: "general" as const,
              sender: "Musu-A (파트장)",
              senderKind: "ai" as const,
              text: reply,
              timestamp: new Date(),
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              channelId: "general" as const,
              sender: "시스템",
              senderKind: "system" as const,
              text: "AI 응답 오류: musu-port에 연결할 수 없습니다.",
              timestamp: new Date(),
            },
          ]);
        }
        return;
      }

      // Simulated responses for non-general channels.
      setTimeout(() => {
        const responses = AI_RESPONSES[activeChannel];
        const reply = responses[Math.floor(Math.random() * responses.length)];
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            channelId: activeChannel,
            sender: "Musu-A (4060Ti)",
            senderKind: "ai" as const,
            text: reply,
            timestamp: new Date(),
          },
        ]);
      }, 400);
    },
    [activeChannel]
  );

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
            title={`현재 플랜은 기기 ${deviceLimit}대까지 지원합니다. 업그레이드하세요.`}
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
        <span
          style={{
            fontSize: 13,
            color: "#6b7280",
            background: "#1a1a1a",
            border: "1px solid #2d2d2d",
            borderRadius: 6,
            padding: "4px 10px",
          }}
        >
          유저
        </span>
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
          channelId={activeChannel}
          messages={messages}
          onSend={handleSend}
        />
      </div>

      {/* Onboarding modal */}
      {showOnboarding && (
        <OnboardingModal
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </div>
  );
}
