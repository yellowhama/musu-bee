import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export type PlanTier = "free" | "pro" | "team";

export const STRIPE_PRICES: Record<Exclude<PlanTier, "free">, string> = {
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  team: process.env.STRIPE_PRICE_TEAM ?? "",
};

export const PLAN_DEVICE_LIMITS: Record<PlanTier, number> = {
  free: 2,
  pro: 5,
  team: Infinity,
};
