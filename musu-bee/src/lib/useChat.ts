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
  createModelHandler,
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

const SSE_URL = "/api/bridge-tasks/events";
const SSE_RECONNECT_INITIAL_MS = 1_000;
const SSE_RECONNECT_MAX_MS = 10_000;
const SSE_RECONNECT_MULTIPLIER = 2;
const SSE_MAX_RETRIES = 5;

function chatDocumentIsVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

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

export interface CompanyContext {
  company?: string;
  workspace?: string;
}

export interface UseChatReturn {
  messages: Message[];
  sendMessage: (text: string, node?: string, companyCtx?: CompanyContext) => void;
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

export function useChat(
  channel: ChannelId,
  availableNodes: Array<{ name: string; status: string }> = [],
  selectedNodeId?: string
): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  // Initialize activeNode with the first online node, or "local" as fallback
  const getDefaultNode = useCallback(() => {
    if (availableNodes.length === 0) return "local";
    const onlineNode = availableNodes.find(n => n.status === "online");
    return onlineNode?.name ?? availableNodes[0]?.name ?? "local";
  }, [availableNodes]);

  // H8: initialize hydration-safe. getDefaultNode() depends on availableNodes,
  // which is empty during SSR but populated after the client fetches — using it
  // as the initial value caused a server("local")/client(other node) hydration
  // mismatch. Start from a deterministic value and resolve the real default in
  // an effect after mount (see below).
  const [activeNode, setActiveNode] = useState<string>(selectedNodeId ?? "local");
  const [selectedAdapter, setSelectedAdapter] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(SSE_RECONNECT_INITIAL_MS);
  const reconnectAttempts = useRef(0);
  const reconnectGenerationRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);
  const reconnectPendingWhenVisible = useRef(false);
  const reconnectPendingGeneration = useRef(0);
  const nextReconnectAt = useRef(0);
  const visibilityListenerInstalled = useRef(false);
  const oldestHistoryId = useRef<string | null>(null);
  const seenTaskUpdates = useRef<Set<string>>(new Set());
  const isAgentChannel = AGENT_CHANNELS.includes(channel);

  // Update activeNode when selectedNodeId changes
  useEffect(() => {
    if (selectedNodeId) {
      setActiveNode(selectedNodeId);
    }
  }, [selectedNodeId]);

  // Update activeNode when availableNodes changes (if current node is no longer available)
  useEffect(() => {
    if (availableNodes.length === 0) return;
    const currentNodeExists = availableNodes.some(n => n.name === activeNode);
    if (!currentNodeExists) {
      const newNode = selectedNodeId ?? getDefaultNode();
      setActiveNode(newNode);
    }
  }, [availableNodes, activeNode, getDefaultNode, selectedNodeId]);

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
              text: "⚠ Bridge unavailable — restored from cache",
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

  const isEmbedded = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embed") === "1";

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    nextReconnectAt.current = 0;
  }, []);

  const resetReconnectState = useCallback(() => {
    reconnectDelay.current = SSE_RECONNECT_INITIAL_MS;
    reconnectAttempts.current = 0;
    reconnectPendingWhenVisible.current = false;
    reconnectPendingGeneration.current = 0;
    nextReconnectAt.current = 0;
  }, []);

  const closeEventSource = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setIsConnected(false);
  }, []);

  const armReconnectTimer = useCallback((reconnectGeneration: number, delayMs: number) => {
    nextReconnectAt.current = Date.now() + delayMs;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      if (reconnectGenerationRef.current !== reconnectGeneration) return;
      if (!chatDocumentIsVisible()) {
        reconnectPendingWhenVisible.current = true;
        reconnectPendingGeneration.current = reconnectGeneration;
        return;
      }
      reconnectDelay.current = Math.min(
        reconnectDelay.current * SSE_RECONNECT_MULTIPLIER,
        SSE_RECONNECT_MAX_MS,
      );
      nextReconnectAt.current = 0;
      connectRef.current?.();
    }, delayMs);
  }, []);

  const reconnectWhenVisible = useCallback(() => {
    if (!reconnectPendingWhenVisible.current) return;
    if (!chatDocumentIsVisible()) return;
    const reconnectGeneration = reconnectPendingGeneration.current;
    reconnectPendingWhenVisible.current = false;
    reconnectPendingGeneration.current = 0;
    if (reconnectGenerationRef.current !== reconnectGeneration) return;
    const remainingDelayMs = Math.max(0, nextReconnectAt.current - Date.now());
    if (remainingDelayMs > 0) {
      armReconnectTimer(reconnectGeneration, remainingDelayMs);
      return;
    }
    reconnectDelay.current = Math.min(
      reconnectDelay.current * SSE_RECONNECT_MULTIPLIER,
      SSE_RECONNECT_MAX_MS,
    );
    nextReconnectAt.current = 0;
    connectRef.current?.();
  }, [armReconnectTimer]);

  const handleVisibilityChange = useCallback(() => {
    if (!chatDocumentIsVisible()) return;
    reconnectWhenVisible();
  }, [reconnectWhenVisible]);

  const ensureVisibilityListener = useCallback(() => {
    if (typeof document === "undefined" || visibilityListenerInstalled.current) return;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled.current = true;
  }, [handleVisibilityChange]);

  const removeVisibilityListener = useCallback(() => {
    if (typeof document === "undefined" || !visibilityListenerInstalled.current) return;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled.current = false;
  }, [handleVisibilityChange]);

  const connect = useCallback(() => {
    if (!isAgentChannel) return;
    if (isEmbedded) return; // Skip in iframe embed mode
    if (
      esRef.current?.readyState === EventSource.OPEN ||
      esRef.current?.readyState === EventSource.CONNECTING
    ) return;
    clearReconnectTimer();
    ensureVisibilityListener();

    const es = new EventSource(SSE_URL);
    esRef.current = es;
    const reconnectGeneration = reconnectGenerationRef.current;

    es.onopen = () => {
      setIsConnected(true);
      resetReconnectState();
    };

    es.onerror = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      setIsConnected(false);
      clearReconnectTimer();
      if (reconnectAttempts.current >= SSE_MAX_RETRIES) return;
      const delayMs = reconnectDelay.current;
      reconnectAttempts.current += 1;
      armReconnectTimer(reconnectGeneration, delayMs);
    };

    es.addEventListener("task_update", (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          task_id?: string;
          status?: string;
          channel?: string | null;
          output?: string | null;
          error?: string | null;
          assigned_pc?: string | null;
          duration_sec?: number | null;
        };
        if (data.type !== "task_update" || !data.task_id) return;
        const eventChannel = data.channel?.trim();
        if (eventChannel && eventChannel !== channel) return;
        if (data.status === "running" || data.status === "pending") {
          setIsAgentTyping(true);
          return;
        }
        if (!["done", "failed", "cancelled"].includes(data.status ?? "")) return;
        const dedupeKey = `${data.task_id}:${data.status}`;
        if (seenTaskUpdates.current.has(dedupeKey)) return;
        seenTaskUpdates.current.add(dedupeKey);

        const shortId = data.task_id.slice(0, 8);
        const text = data.output?.trim() || data.error?.trim() || `Task ${shortId} ${data.status}.`;
        appendChatMessage({
          id: makeId(),
          channelId: channel,
          sender: data.assigned_pc ? `Agent @ ${data.assigned_pc}` : "Agent",
          senderKind: data.status === "failed" ? "system" : "ai",
          text,
          timestamp: new Date(),
          meta: {
            durationSec: data.duration_sec ?? undefined,
          },
        });
        setIsAgentTyping(false);
      } catch {
        // ignore malformed messages
      }
    });
  }, [appendChatMessage, armReconnectTimer, channel, clearReconnectTimer, ensureVisibilityListener, isAgentChannel, isEmbedded, resetReconnectState]);

  connectRef.current = connect;

  useEffect(() => {
    if (!isAgentChannel) {
      reconnectGenerationRef.current += 1;
      clearReconnectTimer();
      closeEventSource();
      removeVisibilityListener();
      resetReconnectState();
      setIsAgentTyping(false);
      return;
    }
    setIsAgentTyping(false);
    connect();
    return () => {
      reconnectGenerationRef.current += 1;
      clearReconnectTimer();
      closeEventSource();
      removeVisibilityListener();
      resetReconnectState();
    };
  }, [clearReconnectTimer, closeEventSource, connect, isAgentChannel, removeVisibilityListener, resetReconnectState]);

  // Reconnect SSE when activeNode changes (LOCAL ↔ REMOTE)
  useEffect(() => {
    if (!isAgentChannel) return;
    reconnectGenerationRef.current += 1;
    clearReconnectTimer();
    closeEventSource();
    resetReconnectState();
    connect();
  }, [activeNode, clearReconnectTimer, closeEventSource, connect, isAgentChannel, resetReconnectState]);

  // ── musu-bridge agent route ────────────────────────────────────────────────

  const sendViaAgentRoute = useCallback(
    async (text: string, node?: string, companyCtx?: CompanyContext) => {
      setIsAgentTyping(true);
      // Build context prefix — prepended to the request body only, not shown in UI
      let bodyText = text;
      if (companyCtx?.company || companyCtx?.workspace) {
        const parts: string[] = [];
        if (companyCtx.company) parts.push(`Company: ${companyCtx.company}`);
        if (companyCtx.workspace) parts.push(`Workspace: ${companyCtx.workspace}`);
        bodyText = `[${parts.join(" | ")}]\n\n${text}`;
      }
      try {
        const res = await fetch("/api/agent-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            sender_id: "local-user",
            text: bodyText,
            node,
            adapter_override: selectedAdapter,
            cost_optimized: true,
          }),
        });

        const data = (await res.json()) as {
          response?: string;
          agent_id?: string;
          agent_name?: string;
          adapter_type?: string;
          duration_sec?: number;
          cost_usd?: number;
          chain?: string[];
          error?: string;
        };

        if (!res.ok || data.error) {
          const errMsg =
            data.error === "agent_timeout"
              ? "Agent response timed out (300s)."
              : data.error === "bridge_unavailable"
                ? "Cannot connect to musu-bridge. Start the service with `bash scripts/dev-start.sh`."
                : `Agent error: ${data.error ?? "unknown"}`;
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
            adapterType: data.adapter_type ?? undefined,
            durationSec: data.duration_sec ?? undefined,
            costUsd: data.cost_usd ?? undefined,
            chain: data.chain ?? undefined,
          },
          plan: plan ?? undefined,
        });
      } catch (err) {
        appendChatMessage({
          id: makeId(), channelId: channel,
          sender: "System", senderKind: "system",
          text: `Network error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        });
      } finally {
        setIsAgentTyping(false);
      }
    },
    [appendChatMessage, channel, selectedAdapter],
  );

  // ── Command handlers ───────────────────────────────────────────────────────

  const ctx = { appendChatMessage, channel, setIsAgentTyping };

  const handleTaskCommand = useCallback(createTaskHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleApprovalCommand = useCallback(createApprovalHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleRouteCommand = useCallback(createRouteHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleWikiCommand = useCallback(createWikiHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleRunCommand = useCallback(createRunHandler(ctx), [appendChatMessage, channel, setIsAgentTyping]);
  const handleModelCommand = useCallback(createModelHandler(ctx, setSelectedAdapter), [appendChatMessage, channel, setIsAgentTyping]);

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string, node?: string, companyCtx?: CompanyContext) => {
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
      if (text.startsWith("/model ")) {
        void handleModelCommand(text); return;
      }

      appendChatMessage({ id: makeId(), channelId: channel, sender: "User", senderKind: "user", text, timestamp: new Date() });
      if (!isAgentChannel) return;

      // Agent channels: route through musu-bridge for real agent execution
      void sendViaAgentRoute(text, node, companyCtx);
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
