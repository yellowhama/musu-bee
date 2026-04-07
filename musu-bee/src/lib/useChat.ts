"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChannelId, Message, ChatWsMessage } from "@/types";

const WS_BASE =
  process.env.NEXT_PUBLIC_MUSU_PORT_WS_URL ?? "ws://localhost:1355";

let idCounter = 100;
function makeId() {
  return `ws-${++idCounter}-${Date.now()}`;
}

export interface UseChatReturn {
  messages: Message[];
  sendMessage: (text: string) => void;
  isConnected: boolean;
  isAgentTyping: boolean;
}

export function useChat(channel: ChannelId): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
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
  }, [channel]);

  // Connect on mount / channel change
  useEffect(() => {
    setMessages([]);
    setIsAgentTyping(false);
    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendMessage = useCallback(
    (text: string) => {
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

  return { messages, sendMessage, isConnected, isAgentTyping };
}
