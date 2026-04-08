import assert from "node:assert/strict";
import { before, test } from "node:test";
import type Stripe from "stripe";
import type { SubscriptionState } from "@/lib/subscription";

let handleStripeWebhook: (
  rawBody: ArrayBuffer,
  signature: string | null,
  deps: any
) => Promise<{ status: number; body: Record<string, unknown> }>;

before(async () => {
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
  process.env.STRIPE_PRICE_TEAM = "price_team_test";
  ({ handleStripeWebhook } = await import("./handler"));
});

function makeState(
  overrides: Partial<SubscriptionState> = {}
): SubscriptionState {
  return {
    plan: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: "none",
    currentPeriodEnd: null,
    _processedStripeEventIds: [],
    _processedPaddleEventIds: [],
    ...overrides,
  };
}

function makeEvent(
  id: string,
  type: Stripe.Event.Type,
  object: unknown
): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: 0,
    data: { object } as Stripe.Event.Data,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
  } as Stripe.Event;
}

const RAW_BODY = new TextEncoder().encode("{}").buffer;
const passthroughLock = async <T>(fn: () => Promise<T>): Promise<T> => fn();

test("invalid signature returns 400 and does not write state", async () => {
  let saveCalls = 0;
  let readCalls = 0;
  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => {
      throw new Error("bad signature");
    },
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => {
      readCalls += 1;
      return makeState();
    },
    saveSubscription: async () => {
      saveCalls += 1;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const result = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "bad signature");
  assert.equal(readCalls, 0);
  assert.equal(saveCalls, 0);
});

test("checkout.session.completed replay is deduped by event id", async () => {
  let state = makeState();
  let saveCalls = 0;
  const checkoutSession = {
    id: "cs_1",
    mode: "subscription",
    customer: "cus_1",
    subscription: "sub_1",
  } as Stripe.Checkout.Session;
  const event = makeEvent(
    "evt_checkout_1",
    "checkout.session.completed",
    checkoutSession
  );

  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => event,
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const first = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  const second = await handleStripeWebhook(RAW_BODY, "sig_test", deps);

  assert.equal(first.status, 200);
  assert.equal(first.body.applied, true);
  assert.equal(first.body.duplicate, false);

  assert.equal(second.status, 200);
  assert.equal(second.body.applied, false);
  assert.equal(second.body.duplicate, true);

  assert.equal(saveCalls, 1);
  assert.equal(state.plan, "pro");
  assert.equal(state.status, "active");
});

test("subscription.updated before checkout does not grant entitlement", async () => {
  let state = makeState();
  const eventId = "evt_update_before_checkout";
  const updatedEvent = makeEvent("evt_update_before_checkout", "customer.subscription.updated", {
    id: "sub_orphan",
    status: "active",
    current_period_end: 1_800_000_000,
    items: {
      data: [{ price: { id: "price_team_test" } }],
    },
  } as Stripe.Subscription);

  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => updatedEvent,
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const result = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(result.status, 503);
  assert.equal(result.body.applied, false);
  assert.equal(result.body.retryable, true);
  assert.equal(result.body.ignoredReason, "subscription_id_mismatch");
  assert.equal(state.plan, "free");
  assert.equal(state.status, "none");
  assert.equal(state._processedStripeEventIds.includes(eventId), false);
});

test("customer.subscription.updated replay is deduped by event id", async () => {
  let state = makeState({
    plan: "pro",
    status: "active",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  });
  let saveCalls = 0;

  const updatedEvent = makeEvent("evt_update_1", "customer.subscription.updated", {
    id: "sub_1",
    status: "active",
    current_period_end: 1_800_000_000,
    items: {
      data: [{ price: { id: "price_team_test" } }],
    },
  } as Stripe.Subscription);

  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => updatedEvent,
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const first = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  const second = await handleStripeWebhook(RAW_BODY, "sig_test", deps);

  assert.equal(first.status, 200);
  assert.equal(first.body.applied, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(saveCalls, 1);
  assert.equal(state.plan, "team");
});

test("customer.subscription.deleted replay is deduped by event id", async () => {
  let state = makeState({
    plan: "pro",
    status: "active",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  });
  let saveCalls = 0;

  const deletedEvent = makeEvent("evt_delete_1", "customer.subscription.deleted", {
    id: "sub_1",
    status: "canceled",
  } as Stripe.Subscription);

  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => deletedEvent,
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const first = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  const second = await handleStripeWebhook(RAW_BODY, "sig_test", deps);

  assert.equal(first.status, 200);
  assert.equal(first.body.applied, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(saveCalls, 1);
  assert.equal(state.plan, "free");
  assert.equal(state.status, "cancelled");
});

test("unknown price id stays retryable and unprocessed", async () => {
  let state = makeState();
  const checkoutSession = {
    id: "cs_unknown_price",
    mode: "subscription",
    customer: "cus_unknown",
    subscription: "sub_unknown",
  } as Stripe.Checkout.Session;
  const event = makeEvent(
    "evt_checkout_unknown_price",
    "checkout.session.completed",
    checkoutSession
  );

  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => event,
    listLineItemPriceId: async () => "price_unknown",
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const result = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(result.status, 503);
  assert.equal(result.body.applied, false);
  assert.equal(result.body.retryable, true);
  assert.equal(result.body.ignoredReason, "unknown_price_id");
  assert.equal(
    state._processedStripeEventIds.includes("evt_checkout_unknown_price"),
    false
  );
});

test("replay after subscription mismatch can apply once checkout state exists", async () => {
  let state = makeState();
  const updateEventId = "evt_update_replayable";
  const updateEvent = makeEvent(
    updateEventId,
    "customer.subscription.updated",
    {
      id: "sub_replay",
      status: "active",
      current_period_end: 1_800_000_000,
      items: {
        data: [{ price: { id: "price_team_test" } }],
      },
    } as Stripe.Subscription
  );

  const checkoutEvent = makeEvent(
    "evt_checkout_replay_bootstrap",
    "checkout.session.completed",
    {
      id: "cs_replay",
      mode: "subscription",
      customer: "cus_replay",
      subscription: "sub_replay",
    } as Stripe.Checkout.Session
  );

  let currentEvent = updateEvent;
  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => currentEvent,
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
  };

  const firstUpdate = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(firstUpdate.status, 503);
  assert.equal(firstUpdate.body.applied, false);
  assert.equal(firstUpdate.body.retryable, true);
  assert.equal(state._processedStripeEventIds.includes(updateEventId), false);

  currentEvent = checkoutEvent;
  const activation = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(activation.status, 200);
  assert.equal(activation.body.applied, true);
  assert.equal(state.stripeSubscriptionId, "sub_replay");

  currentEvent = updateEvent;
  const replayedUpdate = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(replayedUpdate.status, 200);
  assert.equal(replayedUpdate.body.applied, true);
  assert.equal(replayedUpdate.body.retryable, false);
  assert.equal(state.plan, "team");
  assert.equal(state._processedStripeEventIds.includes(updateEventId), true);
});

test("lock timeout returns 503 retryable response", async () => {
  let saveCalls = 0;
  const checkoutSession = {
    id: "cs_lock_timeout",
    mode: "subscription",
    customer: "cus_lock",
    subscription: "sub_lock",
  } as Stripe.Checkout.Session;
  const event = makeEvent(
    "evt_checkout_lock_timeout",
    "checkout.session.completed",
    checkoutSession
  );

  const deps = {
    webhookSecret: "whsec_test",
    constructEvent: () => event,
    listLineItemPriceId: async () => "price_pro_test",
    getSubscription: async () => makeState(),
    saveSubscription: async () => {
      saveCalls += 1;
    },
    withSubscriptionStateLock: async () => {
      throw new Error("subscription_lock_timeout");
    },
  };

  const result = await handleStripeWebhook(RAW_BODY, "sig_test", deps);
  assert.equal(result.status, 503);
  assert.equal(result.body.retryable, true);
  assert.equal(saveCalls, 0);
});
