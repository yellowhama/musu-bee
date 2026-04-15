import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { SubscriptionState } from "@/lib/subscription";

let handlePaddleWebhook: (
  rawBody: string,
  signature: string | null,
  deps: any
) => Promise<{ status: number; body: Record<string, unknown> }>;

before(async () => {
  process.env.PADDLE_PRICE_ID_PRO = "pri_pro_test";
  process.env.PADDLE_PRICE_ID_TEAM = "pri_team_test";
  ({ handlePaddleWebhook } = await import("./handler"));
});

function makeState(
  overrides: Partial<SubscriptionState> = {}
): SubscriptionState {
  return {
    plan: "free",
    customerId: null,
    subscriptionId: null,
    provider: "none",
    status: "none",
    currentPeriodEnd: null,
    _processedEventIds: [],
    ...overrides,
  };
}

function makeEvent(eventId: string, eventType: string, data: Record<string, unknown>) {
  return {
    event_id: eventId,
    event_type: eventType,
    data,
  };
}

const passthroughLock = async <T>(fn: () => Promise<T>): Promise<T> => fn();
const noopSync = async () => {};

test("invalid signature returns 400 and does not write state", async () => {
  let saveCalls = 0;
  let readCalls = 0;
  const event = makeEvent("evt_invalid_sig", "subscription.activated", {
    id: "sub_1",
    customer_id: "cus_1",
    items: [{ price: { id: "pri_pro_test" } }],
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => false,
    getSubscription: async () => {
      readCalls += 1;
      return makeState();
    },
    saveSubscription: async () => {
      saveCalls += 1;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const result = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Invalid signature");
  assert.equal(readCalls, 0);
  assert.equal(saveCalls, 0);
});

test("subscription.activated replay is deduped by event id", async () => {
  let state = makeState();
  let saveCalls = 0;
  const event = makeEvent("evt_activate_1", "subscription.activated", {
    id: "sub_1",
    customer_id: "cus_1",
    items: [{ price: { id: "pri_pro_test" } }],
    current_billing_period: { ends_at: "2030-01-01T00:00:00Z" },
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const first = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );
  const second = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(first.status, 200);
  assert.equal(first.body.applied, true);
  assert.equal(first.body.duplicate, false);

  assert.equal(second.status, 200);
  assert.equal(second.body.applied, false);
  assert.equal(second.body.duplicate, true);

  assert.equal(saveCalls, 1);
  assert.equal(state.plan, "pro");
  assert.equal(state.status, "active");
  assert.equal(state.subscriptionId, "sub_1");
});

test("subscription.updated before activation does not grant entitlement", async () => {
  let state = makeState();
  const eventId = "evt_update_before_activation";
  const event = makeEvent(eventId, "subscription.updated", {
    id: "sub_orphan",
    status: "active",
    items: [{ price: { id: "pri_team_test" } }],
    current_billing_period: { ends_at: "2030-01-02T00:00:00Z" },
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const result = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.applied, false);
  assert.equal(result.body.retryable, true);
  assert.equal(result.body.ignoredReason, "subscription_id_mismatch");
  assert.equal(state.plan, "free");
  assert.equal(state.status, "none");
  assert.equal(
    state._processedEventIds.includes(eventId),
    false
  );
});

test("subscription.updated replay is deduped by event id", async () => {
  let state = makeState({
    plan: "pro",
    status: "active",
    customerId: "cus_1",
    subscriptionId: "sub_1",
    provider: "paddle",
  });
  let saveCalls = 0;

  const event = makeEvent("evt_update_1", "subscription.updated", {
    id: "sub_1",
    status: "active",
    items: [{ price: { id: "pri_team_test" } }],
    current_billing_period: { ends_at: "2030-02-01T00:00:00Z" },
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const first = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );
  const second = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(first.status, 200);
  assert.equal(first.body.applied, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(saveCalls, 1);
  assert.equal(state.plan, "team");
});

test("subscription.cancelled replay is deduped by event id", async () => {
  let state = makeState({
    plan: "pro",
    status: "active",
    customerId: "cus_1",
    subscriptionId: "sub_1",
    provider: "paddle",
  });
  let saveCalls = 0;
  const event = makeEvent("evt_cancel_1", "subscription.cancelled", {
    id: "sub_1",
    status: "canceled",
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const first = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );
  const second = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(first.status, 200);
  assert.equal(first.body.applied, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(saveCalls, 1);
  assert.equal(state.plan, "free");
  assert.equal(state.status, "cancelled");
  assert.equal(state.subscriptionId, null);
});

test("transaction.completed is recorded without changing entitlement", async () => {
  let state = makeState({
    plan: "pro",
    status: "active",
    customerId: "cus_1",
    subscriptionId: "sub_1",
    provider: "paddle",
  });

  const eventId = "evt_tx_1";
  const event = makeEvent(eventId, "transaction.completed", {
    id: "txn_1",
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const result = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, false);
  assert.equal(result.body.ignoredReason, "transaction_recorded");
  assert.equal(state.plan, "pro");
  assert.equal(state.status, "active");
  assert.ok(state._processedEventIds.includes(eventId));
});

test("unknown_price_id does not permanently mark event processed", async () => {
  let state = makeState();
  const eventId = "evt_unknown_price";
  const event = makeEvent(eventId, "subscription.activated", {
    id: "sub_unknown",
    customer_id: "cus_unknown",
    items: [{ price: { id: "pri_unknown" } }],
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const result = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.applied, false);
  assert.equal(result.body.retryable, true);
  assert.equal(result.body.ignoredReason, "unknown_price_id");
  assert.equal(state._processedEventIds.includes(eventId), false);
});

test("replay after subscription_id_mismatch can apply later", async () => {
  let state = makeState();
  const updateEventId = "evt_update_replayable";
  const updateEvent = makeEvent(updateEventId, "subscription.updated", {
    id: "sub_replay",
    status: "active",
    items: [{ price: { id: "pri_team_test" } }],
    current_billing_period: { ends_at: "2031-01-01T00:00:00Z" },
  });
  const activationEvent = makeEvent("evt_activate_replay", "subscription.activated", {
    id: "sub_replay",
    customer_id: "cus_replay",
    items: [{ price: { id: "pri_pro_test" } }],
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: noopSync,
  };

  const firstUpdate = await handlePaddleWebhook(
    JSON.stringify(updateEvent),
    "ts=1;h1=deadbeef",
    deps
  );
  assert.equal(firstUpdate.status, 503);
  assert.equal(firstUpdate.body.applied, false);
  assert.equal(firstUpdate.body.retryable, true);
  assert.equal(state._processedEventIds.includes(updateEventId), false);

  const activation = await handlePaddleWebhook(
    JSON.stringify(activationEvent),
    "ts=1;h1=deadbeef",
    deps
  );
  assert.equal(activation.status, 200);
  assert.equal(activation.body.applied, true);
  assert.equal(state.subscriptionId, "sub_replay");

  const replayedUpdate = await handlePaddleWebhook(
    JSON.stringify(updateEvent),
    "ts=1;h1=deadbeef",
    deps
  );
  assert.equal(replayedUpdate.status, 200);
  assert.equal(replayedUpdate.body.applied, true);
  assert.equal(replayedUpdate.body.retryable, false);
  assert.equal(state.plan, "team");
  assert.equal(state._processedEventIds.includes(updateEventId), true);
});

test("applied entitlement change syncs Supabase once and skips duplicate replay", async () => {
  let state = makeState();
  const syncCalls: Array<{
    eventId: string;
    eventType: string;
    plan: SubscriptionState["plan"];
  }> = [];
  const event = makeEvent("evt_sync_once", "subscription.activated", {
    id: "sub_sync_1",
    customer_id: "cus_sync_1",
    items: [{ price: { id: "pri_pro_test" } }],
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: async (
      next: SubscriptionState,
      metadata: { eventId: string; eventType: string }
    ) => {
      syncCalls.push({
        eventId: metadata.eventId,
        eventType: metadata.eventType,
        plan: next.plan,
      });
    },
  };

  const first = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );
  const replay = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0], {
    eventId: "evt_sync_once",
    eventType: "subscription.activated",
    plan: "pro",
  });
});

test("Supabase sync failure returns 503 and does not persist state", async () => {
  let state = makeState();
  let saveCalls = 0;
  const eventId = "evt_sync_fail";
  const event = makeEvent(eventId, "subscription.activated", {
    id: "sub_sync_fail",
    customer_id: "cus_sync_fail",
    items: [{ price: { id: "pri_pro_test" } }],
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => state,
    saveSubscription: async (next: SubscriptionState) => {
      saveCalls += 1;
      state = next;
    },
    withSubscriptionStateLock: passthroughLock,
    syncSubscriptionToSupabase: async () => {
      throw new Error("supabase_sync_failed:simulated_failure");
    },
  };

  const result = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.retryable, true);
  assert.equal(result.body.error, "Supabase subscription sync failed");
  assert.equal(saveCalls, 0);
  assert.equal(state.plan, "free");
  assert.equal(state._processedEventIds.includes(eventId), false);
});

test("lock timeout returns 503 retryable response", async () => {
  let saveCalls = 0;
  const event = makeEvent("evt_lock_timeout", "transaction.completed", {
    id: "txn_lock",
  });

  const deps = {
    webhookSecret: "whsec_test",
    verifySignature: () => true,
    getSubscription: async () => makeState(),
    saveSubscription: async () => {
      saveCalls += 1;
    },
    withSubscriptionStateLock: async () => {
      throw new Error("subscription_lock_timeout");
    },
    syncSubscriptionToSupabase: noopSync,
  };

  const result = await handlePaddleWebhook(
    JSON.stringify(event),
    "ts=1;h1=deadbeef",
    deps
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.retryable, true);
  assert.equal(saveCalls, 0);
});
