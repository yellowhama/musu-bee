"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChannelId, Message, ChatWsMessage } from "@/types";
import { AGENT_CHANNELS } from "@/types";
import type { HistoryMessage } from "@/app/api/history/route";
import type { MessagePlan, PlanStep } from "@/types";
import {
  makeId,
  createTaskHandler,
  createApprovalHandler,
  createRouteHandler,
  createWikiHandler,
  createRunHandler,
} from "./chatCommands";

// ── Plan parser ────────────────────────────────────────────────────────────
// Detects numbered execution plans in agent responses.
// Triggers when: ≥2 numbered list items AND at least one action keyword.

const ACTION_KEYWORDS = /execut|run|deploy|commit|apply|실행|배포|커밋|적용|수행/i;

function parsePlan(msgId: string, text: string): MessagePlan | null {
  const lines = text.split("\n");
  const steps: PlanStep[] = [];
  for (const line of lines) {
    const m = /^\s*(\d+)[.)]\s+(.{8,})/.exec(line);
    if (m) {
      steps.push({ id: `step-${msgId}-${steps.length}`, text: m[2].trim() });
    }
  }
  if (steps.length < 2) return null;
  if (!ACTION_KEYWORDS.test(text)) return null;
  return { steps, status: "pending" };
}

const WS_BASE =
  process.env.NEXT_PUBLIC_MUSU_PORT_WS_URL ?? "ws://localhost:1355";

const WS_REMOTE_BASE =
  process.env.NEXT_PUBLIC_MUSU_PORT_WS_REMOTE_URL ?? null;

// ── History localStorage cache ─────────────────────────────────────────────
// Restores the last 50 messages per channel when musu-bridge is unreachable.

const HISTORY_CACHE_MAX = 50;

function historyCacheKey(ch: ChannelId): string {
  return `musu:history:${ch}`;
}

function saveHistoryCache(ch: ChannelId, msgs: Message[]): void {
  try {
    localStorage.setItem(historyCacheKey(ch), JSON.stringify(msgs.slice(-HISTORY_CACHE_MAX)));
  } catch { /* localStorage unavailable (SSR / private mode) */ }
}

function loadHistoryCache(ch: ChannelId): Message[] {
  try {
    const raw = localStorage.getItem(historyCacheKey(ch));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Message, "timestamp"> & { timestamp: string }>;
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function historyMsgToMessage(hm: HistoryMessage, channel: ChannelId): Message {
  return {
    id: `hist-${hm.id}`,
    channelId: channel,
    sender:
      hm.role === "user"
        ? "User"
        : hm.role === "assistant"
          ? channel
          : "System",
    senderKind:
      hm.role === "user" ? "user" : hm.role === "assistant" ? "ai" : "system",
    text: hm.content,
    timestamp: new Date(hm.created_at),
  };
}

export interface UseChatReturn {
  messages: Message[];
  sendMessage: (text: string, node?: string) => void;
  approvePlan: (msgId: string) => void;
  rejectPlan: (msgId: string) => void;
  isConnected: boolean;
  isAgentTyping: boolean;
  isLoadingHistory: boolean;
  hasMoreHistory: boolean;
  loadOlderMessages: () => void;
  activeNode: string;
  setActiveNode: (node: string) => void;
}

type ChatApiResponse = { text?: string; error?: string };

export function useChat(channel: ChannelId): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [activeNode, setActiveNode] = useState<string>("local");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(1000);
  const oldestHistoryId = useRef<string | null>(null);
  const isAgentChannel = AGENT_CHANNELS.includes(channel);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const appendChatMessage = useCallback((msg: Message) => {
    const MAX_MESSAGES = 500;
    setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
  }, []);

  // ── History ────────────────────────────────────────────────────────────────

  const fetchHistory = useCallback(
    async (beforeId?: string): Promise<HistoryMessage[]> => {
      if (!isAgentChannel) return [];
      const url = new URL("/api/history", window.location.origin);
      url.searchParams.set("session_id", channel);
      url.searchParams.set("limit", "50");
      if (beforeId) url.searchParams.set("before_id", beforeId);
      try {
        const res = await fetch(url.toString());
        if (!res.ok) return [];
        return (await res.json()) as HistoryMessage[];
      } catch {
        return [];
      }
    },
    [channel, isAgentChannel],
  );

  useEffect(() => {
    if (!isAgentChannel) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    oldestHistoryId.current = null;

    setMessages(prev => prev.filter(m => m.channelId === channel));
    setIsLoadingHistory(true);

    fetchHistory().then((msgs) => {
      if (cancelled) return;
      if (msgs.length > 0) {
        const converted = msgs.map((m) => historyMsgToMessage(m, channel));
        setMessages((prev) => {
          const next = [...converted, ...prev];
          saveHistoryCache(channel, next);
          return next;
        });
        oldestHistoryId.current = msgs[0].id;
        setHasMoreHistory(msgs.length === 50);
      } else {
        // Bridge unreachable or no history — restore from localStorage cache
        const cached = loadHistoryCache(channel);
        if (cached.length > 0) {
          setMessages((prev) => [
            ...cached,
            {
              id: `sys-cache-${Date.now()}`,
              channelId: channel,
              sender: "System",
              senderKind: "system" as const,
              text: "⚠ 브릿지 연결 없음 — 캐시에서 복원됨",
              timestamp: new Date(),
            },
            ...prev,
          ]);
        }
        setHasMoreHistory(false);
      }
      setIsLoadingHistory(false);
    });

    return () => { cancelled = true; };
  }, [channel, isAgentChannel, fetchHistory]);

  const loadOlderMessages = useCallback(() => {
    if (isLoadingHistory || !hasMoreHistory || !oldestHistoryId.current) return;
    setIsLoadingHistory(true);

    fetchHistory(oldestHistoryId.current).then((msgs) => {
      const converted = msgs.map((m) => historyMsgToMessage(m, channel));
      setMessages((prev) => [...converted, ...prev]);
      if (msgs.length > 0) oldestHistoryId.current = msgs[0].id;
      setHasMoreHistory(msgs.length === 50);
      setIsLoadingHistory(false);
    });
  }, [channel, fetchHistory, hasMoreHistory, isLoadingHistory]);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!isAgentChannel) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsBase = activeNode === "remote" && WS_REMOTE_BASE ? WS_REMOTE_BASE : WS_BASE;
    const ws = new WebSocket(`${wsBase}/chat/ws/${channel}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectDelay.current = 1000;
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsAgentTyping(false);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => { ws.close(); };

    ws.onmessage = (event) => {
      try {
        const data: ChatWsMessage = JSON.parse(event.data);

        if (data.type === "typing") { setIsAgentTyping(true); return; }
        if (data.type === "user_message" && data.sender_id === "local-user") return;

        if (data.type === "agent_response") {
          setIsAgentTyping(false);
          const approvalMatch = /\[APPROVAL_REQUIRED:\s*([^\]]+)\]/i.exec(data.text ?? "");
          if (approvalMatch) {
            const action = approvalMatch[1].trim().slice(0, 200).replace(/[<>]/g, "");
            setMessages((prev) => [
              ...prev.slice(-(499)),
              {
                id: makeId(), channelId: channel, sender: "System", senderKind: "system" as const,
                text: `⚠ **승인 필요**: ${action}\n\`/approve <task_id>\` 또는 \`/reject <task_id>\`로 응답하세요.`,
                timestamp: new Date(),
              },
            ]);
          }
        }

        const msg: Message = {
          id: makeId(), channelId: channel,
          sender:
            data.type === "user_message" ? data.sender_name || "User"
            : data.type === "agent_response" ? data.sender_name || channel
            : "System",
          senderKind:
            data.type === "user_message" ? "user"
            : data.type === "agent_response" ? "ai"
            : "system",
          text: data.text,
          timestamp: new Date(data.timestamp * 1000),
        };

        const MAX_MESSAGES = 500;
        setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
      } catch {
        // ignore malformed messages
      }
    };
  }, [channel, isAgentChannel]);

  useEffect(() => {
    if (!isAgentChannel) {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      setIsAgentTyping(false);
      return;
    }
    setIsAgentTyping(false);
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, isAgentChannel]);

  // Reconnect WS when activeNode changes (LOCAL ↔ REMOTE)
  useEffect(() => {
    if (!isAgentChannel) return;
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    reconnectDelay.current = 1000;
    connect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode]);

  // ── musu-bridge agent route ────────────────────────────────────────────────

  const sendViaAgentRoute = useCallback(
    async (text: string, node?: string) => {
      setIsAgentTyping(true);
      try {
        const res = await fetch("/api/agent-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, sender_id: "local-user", text, node }),
        });

        const data = (await res.json()) as {
          response?: string;
          agent_id?: string;
          agent_name?: string;
          chain?: string[];
          error?: string;
        };

        if (!res.ok || data.error) {
          const errMsg =
            data.error === "agent_timeout"
              ? "에이전트 응답 시간 초과 (300s)."
              : data.error === "bridge_unavailable"
                ? "musu-bridge에 연결할 수 없습니다. `bash scripts/dev-start.sh`로 서비스를 시작하세요."
                : `에이전트 오류: ${data.error ?? "unknown"}`;
          appendChatMessage({
            id: makeId(), channelId: channel,
            sender: "System", senderKind: "system",
            text: errMsg, timestamp: new Date(),
          });
          return;
        }

        const msgId = makeId();
        const responseText = data.response ?? "";
        const plan = parsePlan(msgId, responseText);
        appendChatMessage({
          id: msgId, channelId: channel,
          sender: data.agent_name ?? channel,
          senderKind: "ai",
          text: responseText,
          timestamp: new Date(),
          meta: {
            agentId: data.agent_id ?? undefined,
            chain: data.chain ?? undefined,
          },
          plan: plan ?? undefined,
        });
      } catch (err) {
        appendChatMessage({
          id: makeId(), channelId: channel,
          sender: "System", senderKind: "system",
          text: `네트워크 오류: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        });
      } finally {
        setIsAgentTyping(false);
      }
    },
    [appendChatMessage, channel],
  );

  // ── Command handlers ───────────────────────────────────────────────────────

  const ctx = { appendChatMessage, channel, setIsAgentTyping };

  const handleTaskCommand = useCallback(createTaskHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleApprovalCommand = useCallback(createApprovalHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleRouteCommand = useCallback(createRouteHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleWikiCommand = useCallback(createWikiHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleRunCommand = useCallback(createRunHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string, node?: string) => {
      if (text.startsWith("/task ") || text === "/tasks" || text.startsWith("/done ") || text.startsWith("/block ")) {
        void handleTaskCommand(text); return;
      }
      if (text.startsWith("/approve ") || text.startsWith("/reject ")) {
        void handleApprovalCommand(text); return;
      }
      if (text.startsWith("@route ")) {
        void handleRouteCommand(text); return;
      }
      if (text.startsWith("/learn ") || text.startsWith("@wiki ")) {
        void handleWikiCommand(text); return;
      }
      if (text.startsWith("/run ")) {
        void handleRunCommand(text); return;
      }

      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      if (!isAgentChannel) return;

      // Agent channels: route through musu-bridge for real agent execution
      void sendViaAgentRoute(text, node);
    },
    [appendChatMessage, channel, handleApprovalCommand, handleTaskCommand, handleRouteCommand, handleRunCommand, handleWikiCommand, isAgentChannel, sendViaAgentRoute],
  );

  // ── Plan gate ──────────────────────────────────────────────────────────────

  const approvePlan = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.plan
          ? { ...m, plan: { ...m.plan, status: "approved" as const } }
          : m,
      ),
    );
    // Notify agent that the plan was approved
    void sendViaAgentRoute(`/approve ${msgId}`);
  }, [sendViaAgentRoute]);

  const rejectPlan = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.plan
          ? { ...m, plan: { ...m.plan, status: "rejected" as const } }
          : m,
      ),
    );
    appendChatMessage({
      id: makeId(), channelId: channel,
      sender: "System", senderKind: "system",
      text: "Plan rejected. The agent will not proceed.",
      timestamp: new Date(),
    });
  }, [appendChatMessage, channel]);

  return { messages, sendMessage, approvePlan, rejectPlan, isConnected, isAgentTyping, isLoadingHistory, hasMoreHistory, loadOlderMessages, activeNode, setActiveNode };
}
