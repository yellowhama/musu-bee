"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChannelId, Message, ChatWsMessage } from "@/types";
import { AGENT_CHANNELS } from "@/types";
import type { HistoryMessage } from "@/app/api/history/route";
import {
  makeId,
  createTaskHandler,
  createApprovalHandler,
  createRouteHandler,
  createWikiHandler,
  createRunHandler,
} from "./chatCommands";

const WS_BASE =
  process.env.NEXT_PUBLIC_MUSU_PORT_WS_URL ?? "ws://localhost:1355";

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
  sendMessage: (text: string) => void;
  isConnected: boolean;
  isAgentTyping: boolean;
  isLoadingHistory: boolean;
  hasMoreHistory: boolean;
  loadOlderMessages: () => void;
}

type ChatApiResponse = { text?: string; error?: string };

export function useChat(channel: ChannelId): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

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
      const converted = msgs.map((m) => historyMsgToMessage(m, channel));
      setMessages((prev) => [...converted, ...prev]);
      if (msgs.length > 0) oldestHistoryId.current = msgs[0].id;
      setHasMoreHistory(msgs.length === 50);
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

    const ws = new WebSocket(`${WS_BASE}/chat/ws/${channel}`);
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
            const action = approvalMatch[1].trim();
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

  // ── HTTP streaming fallback ────────────────────────────────────────────────

  const sendViaHttpFallback = useCallback(
    async (text: string) => {
      setIsAgentTyping(true);
      const msgId = makeId();

      setMessages((prev) => [
        ...prev.slice(-(499)),
        { id: msgId, channelId: channel, sender: channel, senderKind: "ai" as const, text: "", timestamp: new Date() },
      ]);

      try {
        const res = await fetch(`/api/chat/stream?message=${encodeURIComponent(text)}`, {
          headers: { Accept: "text/event-stream" },
        });

        if (!res.ok || !res.body) throw new Error(`stream request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const payload = JSON.parse(raw) as { token?: string; done?: boolean; error?: string };
              if (payload.token) {
                accumulated += payload.token;
                setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, text: accumulated } : m)));
              }
              if (payload.error && !accumulated) {
                setMessages((prev) => prev.map((m) =>
                  m.id === msgId ? { ...m, sender: "System", senderKind: "system" as const, text: payload.error! } : m
                ));
              }
            } catch { /* ignore parse errors */ }
          }
        }

        if (!accumulated) {
          setMessages((prev) => prev.map((m) =>
            m.id === msgId ? { ...m, sender: "System", senderKind: "system" as const, text: "No response from AI." } : m
          ));
        }
      } catch (err) {
        const errText = err instanceof Error ? err.message : "AI fallback request failed";
        setMessages((prev) => prev.map((m) =>
          m.id === msgId ? { ...m, sender: "System", senderKind: "system" as const, text: errText } : m
        ));
      } finally {
        setIsAgentTyping(false);
      }
    },
    [channel]
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
    (text: string) => {
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

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        void sendViaHttpFallback(text);
        return;
      }

      const payload: ChatWsMessage = {
        type: "user_message", channel, sender_id: "local-user", sender_name: "User",
        text, timestamp: Math.floor(Date.now() / 1000),
      };
      wsRef.current.send(JSON.stringify(payload));
    },
    [appendChatMessage, channel, handleApprovalCommand, handleTaskCommand, handleRouteCommand, handleRunCommand, handleWikiCommand, isAgentChannel, sendViaHttpFallback],
  );

  return { messages, sendMessage, isConnected, isAgentTyping, isLoadingHistory, hasMoreHistory, loadOlderMessages };
}
