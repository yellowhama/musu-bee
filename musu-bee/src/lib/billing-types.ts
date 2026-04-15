export type PlanTier = "free" | "pro" | "team";

export const PLAN_DEVICE_LIMITS: Record<PlanTier, number> = {
  free: 2,
  pro: 5,
  team: Infinity,
};
