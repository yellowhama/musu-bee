"use client";

import { useEffect, useRef } from "react";

interface LowDutyPollingOptions {
  intervalMs: number;
  enabled?: boolean;
  immediate?: boolean;
  visibleOnly?: boolean;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  taskTimeoutMs?: number;
}

type PollTask = (signal: AbortSignal) => Promise<void> | void;

export const DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS = 10_000;

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function useLowDutyPolling(task: PollTask, options: LowDutyPollingOptions) {
  const taskRef = useRef(task);
  taskRef.current = task;

  const {
    intervalMs,
    enabled = true,
    immediate = true,
    visibleOnly = true,
    maxBackoffMs = Math.max(intervalMs, 120_000),
    backoffMultiplier = 2,
    taskTimeoutMs = DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS,
  } = options;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const nextDelay = () => {
      if (visibleOnly && !isDocumentVisible()) return Math.min(maxBackoffMs, intervalMs * 4);
      if (failures === 0) return intervalMs;
      return Math.min(maxBackoffMs, intervalMs * backoffMultiplier ** failures);
    };

    const schedule = (delayMs = nextDelay()) => {
      if (cancelled) return;
      clearTimer();
      timer = setTimeout(() => {
        void run();
      }, delayMs);
    };

    const run = async () => {
      if (cancelled || inFlight) return;
      if (visibleOnly && !isDocumentVisible()) {
        schedule();
        return;
      }

      inFlight = true;
      controller = new AbortController();
      const timeoutSignal =
        typeof taskTimeoutMs === "number" && taskTimeoutMs > 0
          ? AbortSignal.timeout(taskTimeoutMs)
          : null;
      const taskSignal = timeoutSignal
        ? AbortSignal.any([controller.signal, timeoutSignal])
        : controller.signal;
      try {
        await taskRef.current(taskSignal);
        failures = 0;
      } catch {
        failures = Math.min(failures + 1, 8);
      } finally {
        inFlight = false;
        controller = null;
        schedule();
      }
    };

    const handleVisibilityChange = () => {
      if (!visibleOnly || !isDocumentVisible()) return;
      clearTimer();
      void run();
    };

    if (immediate) {
      void run();
    } else {
      schedule(intervalMs);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [backoffMultiplier, enabled, immediate, intervalMs, maxBackoffMs, taskTimeoutMs, visibleOnly]);
}
