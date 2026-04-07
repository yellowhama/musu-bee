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
import type { PlanTier } from "./stripe";
import { PLAN_DEVICE_LIMITS } from "./stripe";

export interface SubscriptionState {
  plan: PlanTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: "active" | "trialing" | "cancelled" | "none";
  currentPeriodEnd: string | null;
}

const KV_KEY = "subscription:state";

const DEFAULT_STATE: SubscriptionState = {
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: "none",
  currentPeriodEnd: null,
};

function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

// ── KV path ──────────────────────────────────────────────────────────────────

async function kvGet(): Promise<SubscriptionState> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<SubscriptionState>(KV_KEY);
  return stored ?? { ...DEFAULT_STATE };
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
    return JSON.parse(raw) as SubscriptionState;
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

export async function getDeviceLimit(): Promise<number> {
  const { plan } = await getSubscription();
  return PLAN_DEVICE_LIMITS[plan];
}

export async function canAddDevice(currentCount: number): Promise<boolean> {
  return currentCount < (await getDeviceLimit());
}
