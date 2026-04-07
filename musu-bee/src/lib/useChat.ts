"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChannelId, Message, ChatWsMessage } from "@/types";
import { AGENT_CHANNELS } from "@/types";
import type { HistoryMessage } from "@/app/api/history/route";

const WS_BASE =
  process.env.NEXT_PUBLIC_MUSU_PORT_WS_URL ?? "ws://localhost:1355";

let idCounter = 100;
function makeId() {
  return `ws-${++idCounter}-${Date.now()}`;
}

function historyMsgToMessage(hm: HistoryMessage, channel: ChannelId): Message {
  return {
    id: `hist-${hm.id}`,
    channelId: channel,
    sender:
      hm.role === "user"
        ? "유저"
        : hm.role === "assistant"
          ? channel
          : "시스템",
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

export function useChat(channel: ChannelId): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(1000);
  // id of the oldest history message — cursor for loading older pages
  const oldestHistoryId = useRef<string | null>(null);
  const isAgentChannel = AGENT_CHANNELS.includes(channel);

  // ── History fetch ──────────────────────────────────────────────────────────

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

  // Initial history load on channel mount
  useEffect(() => {
    if (!isAgentChannel) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    oldestHistoryId.current = null;
    setMessages([]);
    setIsLoadingHistory(true);

    fetchHistory().then((msgs) => {
      if (cancelled) return;
      const converted = msgs.map((m) => historyMsgToMessage(m, channel));
      setMessages(converted);
      if (msgs.length > 0) {
        oldestHistoryId.current = msgs[0].id;
      }
      setHasMoreHistory(msgs.length === 50);
      setIsLoadingHistory(false);
    });

    return () => {
      cancelled = true;
    };
  }, [channel, isAgentChannel, fetchHistory]);

  // Load older messages (infinite scroll upward)
  const loadOlderMessages = useCallback(() => {
    if (isLoadingHistory || !hasMoreHistory || !oldestHistoryId.current) return;
    setIsLoadingHistory(true);

    fetchHistory(oldestHistoryId.current).then((msgs) => {
      const converted = msgs.map((m) => historyMsgToMessage(m, channel));
      setMessages((prev) => [...converted, ...prev]);
      if (msgs.length > 0) {
        oldestHistoryId.current = msgs[0].id;
      }
      setHasMoreHistory(msgs.length === 50);
      setIsLoadingHistory(false);
    });
  }, [channel, fetchHistory, hasMoreHistory, isLoadingHistory]);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!isAgentChannel) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE}/chat/ws/${channel}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectDelay.current = 1000;
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsAgentTyping(false);
      // Reconnect with backoff
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data: ChatWsMessage = JSON.parse(event.data);

        if (data.type === "typing") {
          setIsAgentTyping(true);
          return;
        }

        // Skip server echo of our own messages — already shown optimistically.
        if (data.type === "user_message" && data.sender_id === "local-user") {
          return;
        }

        if (data.type === "agent_response") {
          setIsAgentTyping(false);
        }

        const msg: Message = {
          id: makeId(),
          channelId: channel,
          sender:
            data.type === "user_message"
              ? data.sender_name || "유저"
              : data.type === "agent_response"
                ? data.sender_name || channel
                : "시스템",
          senderKind:
            data.type === "user_message"
              ? "user"
              : data.type === "agent_response"
                ? "ai"
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

  // Connect / disconnect on channel change
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

  const sendMessage = useCallback(
    (text: string) => {
      // Optimistic: show the user's own message immediately regardless of WS state.
      const optimisticMsg: Message = {
        id: makeId(),
        channelId: channel,
        sender: "유저",
        senderKind: "user",
        text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev.slice(-(500 - 1)), optimisticMsg]);

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const payload: ChatWsMessage = {
        type: "user_message",
        channel,
        sender_id: "local-user",
        sender_name: "유저",
        text,
        timestamp: Math.floor(Date.now() / 1000),
      };

      wsRef.current.send(JSON.stringify(payload));
    },
    [channel],
  );

  return {
    messages,
    sendMessage,
    isConnected,
    isAgentTyping,
    isLoadingHistory,
    hasMoreHistory,
    loadOlderMessages,
  };
}
