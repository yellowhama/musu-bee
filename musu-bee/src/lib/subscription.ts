import fs from "fs";
import path from "path";
import type { PlanTier } from "./stripe";
import { PLAN_DEVICE_LIMITS } from "./stripe";

export interface SubscriptionState {
  plan: PlanTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: "active" | "trialing" | "cancelled" | "none";
  currentPeriodEnd: string | null;
}

const STATE_FILE = path.join(process.cwd(), "data", "subscription.json");

const DEFAULT_STATE: SubscriptionState = {
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: "none",
  currentPeriodEnd: null,
};

export function getSubscription(): SubscriptionState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as SubscriptionState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveSubscription(state: SubscriptionState): void {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function getDeviceLimit(): number {
  const { plan } = getSubscription();
  return PLAN_DEVICE_LIMITS[plan];
}

export function canAddDevice(currentCount: number): boolean {
  return currentCount < getDeviceLimit();
}
