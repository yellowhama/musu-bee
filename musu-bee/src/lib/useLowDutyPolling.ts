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

export const MIN_LOW_DUTY_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS = 10_000;
export const LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER = 4;
const MAX_FAILURE_BACKOFF_EXPONENT = 8;

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
  const effectiveIntervalMs = Math.max(intervalMs, MIN_LOW_DUTY_POLL_INTERVAL_MS);
  const effectiveMaxBackoffMs = Math.max(maxBackoffMs, effectiveIntervalMs);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let nextAllowedRunAt = 0;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const nextDelay = () => {
      if (visibleOnly && !isDocumentVisible()) {
        return Math.min(effectiveMaxBackoffMs, effectiveIntervalMs * LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER);
      }
      if (failures === 0) return effectiveIntervalMs;
      return Math.min(effectiveMaxBackoffMs, effectiveIntervalMs * backoffMultiplier ** failures);
    };

    const schedule = (delayMs = nextDelay()) => {
      if (cancelled) return;
      clearTimer();
      nextAllowedRunAt = Date.now() + delayMs;
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
        failures = Math.min(failures + 1, MAX_FAILURE_BACKOFF_EXPONENT);
      } finally {
        inFlight = false;
        controller = null;
        schedule();
      }
    };

    const handleVisibilityChange = () => {
      if (!visibleOnly || !isDocumentVisible()) return;
      clearTimer();
      const remainingDelayMs = Math.max(0, nextAllowedRunAt - Date.now());
      if (remainingDelayMs > 0) {
        schedule(remainingDelayMs);
        return;
      }
      void run();
    };

    if (immediate) {
      void run();
    } else {
      schedule(effectiveIntervalMs);
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [
    backoffMultiplier,
    effectiveIntervalMs,
    effectiveMaxBackoffMs,
    enabled,
    immediate,
    intervalMs,
    taskTimeoutMs,
    visibleOnly,
  ]);
}
