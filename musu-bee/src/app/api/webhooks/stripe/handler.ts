import type Stripe from "stripe";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import {
  getSubscription,
  saveSubscription,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  withSubscriptionStateLock,
} from "@/lib/subscription";
import type { SubscriptionState } from "@/lib/subscription";
import type { PlanTier } from "@/lib/stripe";

/**
 * Resolve tier from the actual Stripe price ID on a subscription.
 * This is authoritative — we never trust client-supplied metadata for billing tier.
 * Unknown price IDs are fail-closed to avoid accidental entitlement escalation.
 */
function tierFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICES.team) return "team";
  if (priceId === STRIPE_PRICES.pro) return "pro";
  return null;
}

function sameSubscriptionState(a: SubscriptionState, b: SubscriptionState): boolean {
  if (
    a.plan !== b.plan ||
    a.stripeCustomerId !== b.stripeCustomerId ||
    a.stripeSubscriptionId !== b.stripeSubscriptionId ||
    a.status !== b.status ||
    a.currentPeriodEnd !== b.currentPeriodEnd
  ) {
    return false;
  }
  if (a._processedStripeEventIds.length !== b._processedStripeEventIds.length) {
    return false;
  }
  return a._processedStripeEventIds.every(
    (value, index) => value === b._processedStripeEventIds[index]
  );
}

export interface StripeWebhookDeps {
  webhookSecret?: string;
  constructEvent: (
    payload: Buffer,
    signature: string,
    webhookSecret: string
  ) => Stripe.Event;
  listLineItemPriceId: (sessionId: string) => Promise<string | null>;
  getSubscription: typeof getSubscription;
  saveSubscription: typeof saveSubscription;
  withSubscriptionStateLock: typeof withSubscriptionStateLock;
}

interface EventResult {
  applied: boolean;
  duplicate: boolean;
  retryable: boolean;
  ignoredReason?: string;
}

function mismatchClassification(
  currentSubscriptionId: string | null
): Pick<EventResult, "retryable" | "ignoredReason"> {
  if (!currentSubscriptionId) {
    return {
      retryable: true,
      ignoredReason: "subscription_id_mismatch",
    };
  }
  return {
    retryable: false,
    ignoredReason: "subscription_id_mismatch_stale",
  };
}

function isStripeServerMisconfiguration(err: unknown): err is Error {
  return err instanceof Error && err.message === "STRIPE_SECRET_KEY is not set";
}

export function defaultStripeWebhookDeps(): StripeWebhookDeps {
  let stripeClient: ReturnType<typeof getStripe> | null = null;
  const getStripeClient = () => {
    if (!stripeClient) {
      stripeClient = getStripe();
    }
    return stripeClient;
  };

  return {
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    constructEvent: (payload, signature, webhookSecret) =>
      getStripeClient().webhooks.constructEvent(payload, signature, webhookSecret),
    listLineItemPriceId: async (sessionId) => {
      const lineItems = await getStripeClient().checkout.sessions.listLineItems(
        sessionId,
        {
          limit: 1,
        }
      );
      return lineItems.data[0]?.price?.id ?? null;
    },
    getSubscription,
    saveSubscription,
    withSubscriptionStateLock,
  };
}

async function applyStripeEvent(
  event: Stripe.Event,
  deps: Pick<
    StripeWebhookDeps,
    "listLineItemPriceId" | "getSubscription" | "saveSubscription"
  >
): Promise<EventResult> {
  const current = await deps.getSubscription();
  if (hasProcessedStripeEvent(current, event.id)) {
    return {
      applied: false,
      duplicate: true,
      retryable: false,
      ignoredReason: "duplicate_event",
    };
  }

  let next = current;
  let applied = false;
  let retryable = false;
  let ignoredReason: string | undefined;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") {
        ignoredReason = "non_subscription_checkout";
        break;
      }
      if (!session.id || !session.customer || !session.subscription) {
        ignoredReason = "missing_checkout_fields";
        break;
      }

      const priceId = await deps.listLineItemPriceId(session.id);
      const tier = tierFromPriceId(priceId);
      if (!tier) {
        ignoredReason = "unknown_price_id";
        retryable = true;
        break;
      }

      next = {
        ...current,
        plan: tier,
        stripeCustomerId: String(session.customer),
        stripeSubscriptionId: String(session.subscription),
        status: "active",
      };
      applied = !sameSubscriptionState(current, next);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      if (current.stripeSubscriptionId !== sub.id) {
        const mismatch = mismatchClassification(current.stripeSubscriptionId);
        ignoredReason = mismatch.ignoredReason;
        retryable = mismatch.retryable;
        break;
      }

      const priceId = sub.items.data[0]?.price?.id ?? null;
      const plan = tierFromPriceId(priceId);
      if (!plan) {
        ignoredReason = "unknown_price_id";
        retryable = true;
        break;
      }

      const status =
        sub.status === "active" || sub.status === "trialing"
          ? sub.status
          : "cancelled";

      next = {
        ...current,
        plan,
        status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      };
      applied = !sameSubscriptionState(current, next);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (current.stripeSubscriptionId !== sub.id) {
        const mismatch = mismatchClassification(current.stripeSubscriptionId);
        ignoredReason = mismatch.ignoredReason;
        retryable = mismatch.retryable;
        break;
      }

      next = {
        ...current,
        plan: "free",
        status: "cancelled",
        stripeSubscriptionId: null,
      };
      applied = !sameSubscriptionState(current, next);
      break;
    }

    default:
      ignoredReason = "event_not_handled";
      break;
  }

  const finalState = retryable
    ? next
    : markStripeEventProcessed(next, event.id);
  if (!sameSubscriptionState(current, finalState)) {
    await deps.saveSubscription(finalState);
  }

  return { applied, duplicate: false, retryable, ignoredReason };
}

export async function handleStripeWebhook(
  rawBody: ArrayBuffer,
  signature: string | null,
  deps: StripeWebhookDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!deps.webhookSecret) {
    return {
      status: 500,
      body: { error: "STRIPE_WEBHOOK_SECRET not set" },
    };
  }
  if (!signature) {
    return {
      status: 400,
      body: { error: "Missing stripe-signature" },
    };
  }

  let event: Stripe.Event;
  try {
    event = deps.constructEvent(
      Buffer.from(rawBody),
      signature,
      deps.webhookSecret
    );
  } catch (err) {
    if (isStripeServerMisconfiguration(err)) {
      return { status: 500, body: { error: err.message } };
    }
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return { status: 400, body: { error: msg } };
  }

  try {
    const result = await deps.withSubscriptionStateLock(() =>
      applyStripeEvent(event, deps)
    );
    const responseStatus = result.retryable ? 503 : 200;
    return {
      status: responseStatus,
      body: {
        received: true,
        applied: result.applied,
        duplicate: result.duplicate,
        retryable: result.retryable,
        ignoredReason: result.ignoredReason,
        eventType: event.type,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === "subscription_lock_timeout") {
      return {
        status: 503,
        body: {
          error: "Webhook processing lock timeout",
          retryable: true,
        },
      };
    }
    return {
      status: 500,
      body: {
        error: "Webhook processing failed",
        retryable: true,
      },
    };
  }
}
