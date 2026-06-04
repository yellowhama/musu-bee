"use client";

import { useEffect, useMemo, useRef } from "react";

import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

export const BOUNDED_SSE_RECONNECT_INITIAL_MS = 1_000;
export const BOUNDED_SSE_RECONNECT_MAX_MS = 10_000;
export const BOUNDED_SSE_RECONNECT_MULTIPLIER = 2;
export const BOUNDED_SSE_MAX_RETRIES = 5;
export const BOUNDED_SSE_VISIBILITY_RECONNECT_CHECK_MS = 10_000;

type EventHandler = (event: MessageEvent) => void;
type OpenHandler = (event: Event) => void;
type ErrorHandler = (event: Event) => void;

interface BoundedEventSourceOptions {
  url: string;
  enabled?: boolean;
  visibleOnly?: boolean;
  reconnectInitialMs?: number;
  reconnectMaxMs?: number;
  reconnectMultiplier?: number;
  maxRetries?: number;
  onMessage?: EventHandler;
  onOpen?: OpenHandler;
  onError?: ErrorHandler;
  events?: Record<string, EventHandler>;
}

function documentIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function useBoundedEventSource({
  url,
  enabled = true,
  visibleOnly = true,
  reconnectInitialMs = BOUNDED_SSE_RECONNECT_INITIAL_MS,
  reconnectMaxMs = BOUNDED_SSE_RECONNECT_MAX_MS,
  reconnectMultiplier = BOUNDED_SSE_RECONNECT_MULTIPLIER,
  maxRetries = BOUNDED_SSE_MAX_RETRIES,
  onMessage,
  onOpen,
  onError,
  events,
}: BoundedEventSourceOptions) {
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  const eventsRef = useRef(events);
  const reconnectWhenVisibleRef = useRef<() => void>(() => {});
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onErrorRef.current = onError;
  eventsRef.current = events;

  const eventNames = useMemo(() => Object.keys(events ?? {}).sort(), [events]);
  const eventNamesKey = eventNames.join("\u0000");

  useLowDutyPolling(
    (signal) => {
      if (signal.aborted) return;
      reconnectWhenVisibleRef.current();
    },
    {
      intervalMs: BOUNDED_SSE_VISIBILITY_RECONNECT_CHECK_MS,
      enabled: enabled && visibleOnly,
      immediate: false,
      visibleOnly: true,
      maxBackoffMs: BOUNDED_SSE_VISIBILITY_RECONNECT_CHECK_MS,
      taskTimeoutMs: 1_000,
    },
  );

  useEffect(() => {
    if (!enabled || !url || typeof window === "undefined") return;

    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let generation = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const closeSource = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const nextReconnectDelay = () => {
      const exponent = Math.max(0, reconnectAttempts - 1);
      return Math.min(
        reconnectMaxMs,
        reconnectInitialMs * reconnectMultiplier ** exponent,
      );
    };

    const connect = () => {
      if (cancelled) return;
      if (visibleOnly && !documentIsVisible()) return;

      clearReconnectTimer();
      closeSource();

      const connectionGeneration = ++generation;
      const es = new EventSource(url);
      source = es;

      es.onopen = (event) => {
        if (cancelled || generation !== connectionGeneration) return;
        reconnectAttempts = 0;
        onOpenRef.current?.(event);
      };

      es.onmessage = (event) => {
        if (cancelled || generation !== connectionGeneration) return;
        onMessageRef.current?.(event);
      };

      for (const name of eventNames) {
        es.addEventListener(name, (event) => {
          if (cancelled || generation !== connectionGeneration) return;
          eventsRef.current?.[name]?.(event as MessageEvent);
        });
      }

      es.onerror = (event) => {
        if (cancelled || generation !== connectionGeneration) return;
        onErrorRef.current?.(event);
        es.close();
        if (source === es) {
          source = null;
        }
        if (maxRetries >= 0 && reconnectAttempts >= maxRetries) return;
        reconnectAttempts += 1;
        const delayMs = nextReconnectDelay();
        clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (cancelled || generation !== connectionGeneration) return;
          connect();
        }, delayMs);
      };
    };

    reconnectWhenVisibleRef.current = () => {
      if (cancelled || source) return;
      reconnectAttempts = 0;
      connect();
    };

    connect();

    return () => {
      cancelled = true;
      generation += 1;
      reconnectWhenVisibleRef.current = () => {};
      clearReconnectTimer();
      closeSource();
    };
  }, [
    enabled,
    eventNamesKey,
    maxRetries,
    reconnectInitialMs,
    reconnectMaxMs,
    reconnectMultiplier,
    url,
    visibleOnly,
  ]);
}
