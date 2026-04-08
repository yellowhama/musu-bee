import type { PlanTier } from "@/lib/stripe";
import {
  extractPaddlePriceId,
  PADDLE_PRICE_IDS,
  verifyPaddleWebhookSignature,
} from "@/lib/paddle";
import {
  getSubscription,
  saveSubscription,
  hasProcessedPaddleEvent,
  markPaddleEventProcessed,
  withSubscriptionStateLock,
} from "@/lib/subscription";
import type { SubscriptionState } from "@/lib/subscription";

interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  data: Record<string, unknown>;
}

export interface PaddleWebhookDeps {
  webhookSecret?: string;
  verifySignature: (
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ) => boolean;
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

export function defaultPaddleWebhookDeps(): PaddleWebhookDeps {
  return {
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
    verifySignature: verifyPaddleWebhookSignature,
    getSubscription,
    saveSubscription,
    withSubscriptionStateLock,
  };
}

function tierFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === PADDLE_PRICE_IDS.team) return "team";
  if (priceId === PADDLE_PRICE_IDS.pro) return "pro";
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
  if (a._processedPaddleEventIds.length !== b._processedPaddleEventIds.length) {
    return false;
  }
  return a._processedPaddleEventIds.every(
    (value, index) => value === b._processedPaddleEventIds[index]
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function extractSubscriptionId(data: Record<string, unknown>): string | null {
  const id = data.id;
  return typeof id === "string" ? id : null;
}

function extractCustomerId(data: Record<string, unknown>): string | null {
  const direct = data.customer_id;
  if (typeof direct === "string") return direct;
  const nested = asRecord(data.customer).id;
  return typeof nested === "string" ? nested : null;
}

function extractCurrentPeriodEnd(data: Record<string, unknown>): string | null {
  const billingPeriod = asRecord(data.current_billing_period);
  const endsAt = billingPeriod.ends_at;
  if (typeof endsAt === "string") return endsAt;
  const nextBilledAt = data.next_billed_at;
  return typeof nextBilledAt === "string" ? nextBilledAt : null;
}

function normalizeStatus(value: unknown): SubscriptionState["status"] {
  if (value === "active") return "active";
  if (value === "trialing") return "trialing";
  return "cancelled";
}

async function applyPaddleEvent(
  event: PaddleWebhookEvent,
  deps: Pick<PaddleWebhookDeps, "getSubscription" | "saveSubscription">
): Promise<EventResult> {
  const current = await deps.getSubscription();
  if (hasProcessedPaddleEvent(current, event.event_id)) {
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
  const data = asRecord(event.data);
  const subscriptionId = extractSubscriptionId(data);
  const customerId = extractCustomerId(data);
  const tier = tierFromPriceId(extractPaddlePriceId(data));

  switch (event.event_type) {
    case "subscription.activated": {
      if (!subscriptionId) {
        ignoredReason = "missing_subscription_id";
        break;
      }
      if (!tier) {
        ignoredReason = "unknown_price_id";
        retryable = true;
        break;
      }

      next = {
        ...current,
        plan: tier,
        status: "active",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId ?? current.stripeCustomerId,
        currentPeriodEnd: extractCurrentPeriodEnd(data),
      };
      applied = !sameSubscriptionState(current, next);
      break;
    }

    case "subscription.updated": {
      if (!subscriptionId) {
        ignoredReason = "missing_subscription_id";
        break;
      }
      if (current.stripeSubscriptionId !== subscriptionId) {
        ignoredReason = "subscription_id_mismatch";
        retryable = true;
        break;
      }
      if (!tier) {
        ignoredReason = "unknown_price_id";
        retryable = true;
        break;
      }

      next = {
        ...current,
        plan: tier,
        status: normalizeStatus(data.status),
        currentPeriodEnd: extractCurrentPeriodEnd(data),
      };
      applied = !sameSubscriptionState(current, next);
      break;
    }

    case "subscription.cancelled":
    case "subscription.canceled": {
      if (!subscriptionId) {
        ignoredReason = "missing_subscription_id";
        break;
      }
      if (current.stripeSubscriptionId !== subscriptionId) {
        ignoredReason = "subscription_id_mismatch";
        retryable = true;
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

    case "transaction.completed": {
      ignoredReason = "transaction_recorded";
      break;
    }

    default: {
      ignoredReason = "event_not_handled";
      break;
    }
  }

  const finalState = retryable
    ? next
    : markPaddleEventProcessed(next, event.event_id);
  if (!sameSubscriptionState(current, finalState)) {
    await deps.saveSubscription(finalState);
  }

  return { applied, duplicate: false, retryable, ignoredReason };
}

export async function handlePaddleWebhook(
  rawBody: string,
  signature: string | null,
  deps: PaddleWebhookDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!deps.webhookSecret) {
    return { status: 500, body: { error: "PADDLE_WEBHOOK_SECRET not set" } };
  }
  if (!signature) {
    return { status: 400, body: { error: "Missing paddle-signature" } };
  }
  if (!deps.verifySignature(rawBody, signature, deps.webhookSecret)) {
    return { status: 400, body: { error: "Invalid signature" } };
  }

  let event: PaddleWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaddleWebhookEvent;
  } catch {
    return { status: 400, body: { error: "Invalid JSON payload" } };
  }

  if (!event?.event_id || !event?.event_type) {
    return { status: 400, body: { error: "Invalid webhook payload shape" } };
  }

  try {
    const result = await deps.withSubscriptionStateLock(() =>
      applyPaddleEvent(event, deps)
    );
    const responseStatus = result.retryable ? 503 : 200;
    return {
      status: responseStatus,
      body: {
        received: true,
        eventId: event.event_id,
        eventType: event.event_type,
        applied: result.applied,
        duplicate: result.duplicate,
        retryable: result.retryable,
        ignoredReason: result.ignoredReason,
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
