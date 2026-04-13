/**
 * Subscription state persistence.
 *
 * Production (Vercel): uses @vercel/kv (Upstash Redis) — atomic, serverless-safe.
 * Local dev: falls back to an atomic file write (tmp + rename) when KV_REST_API_URL
 * is not configured, fixing the race-condition that existed with plain writeFileSync.
 *
 * Deployment constraint: if running on a persistent Node.js server without Vercel KV,
 * the file fallback is safe. Do NOT use the file path on stateless serverless runtimes
 * (Vercel, Lambda) without KV_REST_API_URL configured.
 */
import type { PlanTier } from "./billing-types";
import { PLAN_DEVICE_LIMITS } from "./billing-types";

export type { PlanTier };
export { PLAN_DEVICE_LIMITS };

export interface SubscriptionState {
  plan: PlanTier;
  customerId: string | null;
  subscriptionId: string | null;
  provider: "stripe" | "paddle" | "none";
  status: "active" | "trialing" | "cancelled" | "none";
  currentPeriodEnd: string | null;
  _processedEventIds: string[];
}

const KV_KEY = "subscription:state";
const MAX_PROCESSED_EVENTS = 200;
const SUBSCRIPTION_LOCK_KEY = `${KV_KEY}:lock`;

// @vercel/kv doesn't expose .eval() in its TypeScript types but ioredis (the
// underlying client) supports raw Lua evaluation at runtime.
interface KvWithEval {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}
const SUBSCRIPTION_LOCK_TTL_SECONDS = 10;
const SUBSCRIPTION_LOCK_WAIT_MS = 1500;
const SUBSCRIPTION_LOCK_RETRY_MS = 50;

let localLockQueue: Promise<void> = Promise.resolve();

const DEFAULT_STATE: SubscriptionState = {
  plan: "free",
  customerId: null,
  subscriptionId: null,
  provider: "none",
  status: "none",
  currentPeriodEnd: null,
  _processedEventIds: [],
};

function normalizeState(state: any): SubscriptionState {
  if (!state || typeof state !== "object") return { ...DEFAULT_STATE };

  // Migration from Stripe fields
  const customerId = state.customerId ?? state.stripeCustomerId ?? null;
  const subscriptionId =
    state.subscriptionId ?? state.stripeSubscriptionId ?? null;

  let provider = state.provider ?? "none";
  if (
    provider === "none" &&
    (state.stripeCustomerId || state.stripeSubscriptionId)
  ) {
    provider = "stripe";
  }

  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  const _processedEventIds = Array.from(
    new Set([
      ...toStringArray(state._processedEventIds),
      ...toStringArray(state._processedPaddleEventIds),
      ...toStringArray(state._processedStripeEventIds),
    ])
  ).slice(-MAX_PROCESSED_EVENTS);

  return {
    ...DEFAULT_STATE,
    ...state,
    customerId,
    subscriptionId,
    provider: provider as SubscriptionState["provider"],
    _processedEventIds,
  };
}

function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

// ── KV path ──────────────────────────────────────────────────────────────────

async function kvGet(): Promise<SubscriptionState> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<SubscriptionState>(KV_KEY);
  return stored ? normalizeState(stored) : { ...DEFAULT_STATE };
}

async function kvSet(state: SubscriptionState): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(KV_KEY, state);
}

// ── File fallback path (local dev only) ──────────────────────────────────────

function fileGet(): SubscriptionState {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const stateFile = path.join(process.cwd(), "data", "subscription.json");
  try {
    const raw = fs.readFileSync(stateFile, "utf-8");
    return normalizeState(JSON.parse(raw) as Partial<SubscriptionState>);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function fileSet(state: SubscriptionState): void {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const stateFile = path.join(process.cwd(), "data", "subscription.json");
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Atomic write: write to a temp file then rename to avoid partial-write corruption.
  const tmp = path.join(os.tmpdir(), `subscription-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, stateFile);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getSubscription(): Promise<SubscriptionState> {
  if (useKv()) return kvGet();
  return fileGet();
}

export async function saveSubscription(state: SubscriptionState): Promise<void> {
  if (useKv()) return kvSet(state);
  fileSet(state);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withLocalSubscriptionLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: (() => void) | undefined;
  const previous = localLockQueue;
  localLockQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

async function withKvSubscriptionLock<T>(fn: () => Promise<T>): Promise<T> {
  const { kv } = await import("@vercel/kv");
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deadline = Date.now() + SUBSCRIPTION_LOCK_WAIT_MS;
  let acquired = false;

  while (Date.now() < deadline) {
    const lockResult = await kv.set(SUBSCRIPTION_LOCK_KEY, owner, {
      nx: true,
      ex: SUBSCRIPTION_LOCK_TTL_SECONDS,
    });
    if (lockResult === "OK") {
      acquired = true;
      break;
    }
    await wait(SUBSCRIPTION_LOCK_RETRY_MS);
  }

  if (!acquired) {
    throw new Error("subscription_lock_timeout");
  }

  try {
    return await fn();
  } finally {
    // Atomic compare-and-delete release to avoid deleting another owner's lock.
    await (kv as unknown as KvWithEval).eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      [SUBSCRIPTION_LOCK_KEY],
      [owner]
    );
  }
}

export async function withSubscriptionStateLock<T>(
  fn: () => Promise<T>
): Promise<T> {
  if (useKv()) {
    return withKvSubscriptionLock(fn);
  }
  return withLocalSubscriptionLock(fn);
}

export function hasProcessedEvent(
  state: SubscriptionState,
  eventId: string
): boolean {
  return state._processedEventIds.includes(eventId);
}

export function markEventProcessed(
  state: SubscriptionState,
  eventId: string
): SubscriptionState {
  if (state._processedEventIds.includes(eventId)) return state;

  const next = [...state._processedEventIds, eventId];
  if (next.length > MAX_PROCESSED_EVENTS) {
    next.splice(0, next.length - MAX_PROCESSED_EVENTS);
  }

  return {
    ...state,
    _processedEventIds: next,
  };
}

export function toPublicSubscriptionState(
  state: SubscriptionState
): Omit<SubscriptionState, "_processedEventIds"> {
  const {
    _processedEventIds: _ignored,
    ...publicState
  } = state;
  return publicState;
}

export async function getDeviceLimit(): Promise<number> {
  const { plan } = await getSubscription();
  return PLAN_DEVICE_LIMITS[plan];
}

export async function canAddDevice(currentCount: number): Promise<boolean> {
  return currentCount < (await getDeviceLimit());
}
