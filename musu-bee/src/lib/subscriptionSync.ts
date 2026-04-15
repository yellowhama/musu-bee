import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionState } from "./subscription";

export interface SubscriptionSyncMetadata {
  eventId: string;
  eventType: string;
  syncedAt?: string;
}

interface SupabaseSubscriptionSyncConfig {
  url: string;
  serviceRoleKey: string;
  table: string;
  rowId: string;
  idColumn: string;
  planColumn: string;
  statusColumn: string;
  providerColumn: string;
  customerIdColumn: string;
  subscriptionIdColumn: string;
  periodEndColumn: string;
  updatedAtColumn: string;
  lastEventIdColumn: string;
  lastEventTypeColumn: string;
}

let cachedClient:
  | {
      url: string;
      key: string;
      client: SupabaseClient;
    }
  | null = null;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readSyncConfig(): SupabaseSubscriptionSyncConfig | null {
  const url = readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return {
    url,
    serviceRoleKey,
    table: readEnv("SUPABASE_SUBSCRIPTION_TABLE") ?? "subscription_state",
    rowId: readEnv("SUPABASE_SUBSCRIPTION_ROW_ID") ?? "default",
    idColumn: readEnv("SUPABASE_SUBSCRIPTION_ID_COLUMN") ?? "id",
    planColumn: readEnv("SUPABASE_SUBSCRIPTION_PLAN_COLUMN") ?? "plan",
    statusColumn: readEnv("SUPABASE_SUBSCRIPTION_STATUS_COLUMN") ?? "status",
    providerColumn:
      readEnv("SUPABASE_SUBSCRIPTION_PROVIDER_COLUMN") ?? "provider",
    customerIdColumn:
      readEnv("SUPABASE_SUBSCRIPTION_CUSTOMER_ID_COLUMN") ?? "customer_id",
    subscriptionIdColumn:
      readEnv("SUPABASE_SUBSCRIPTION_SUBSCRIPTION_ID_COLUMN") ??
      "subscription_id",
    periodEndColumn:
      readEnv("SUPABASE_SUBSCRIPTION_PERIOD_END_COLUMN") ??
      "current_period_end",
    updatedAtColumn:
      readEnv("SUPABASE_SUBSCRIPTION_UPDATED_AT_COLUMN") ?? "updated_at",
    lastEventIdColumn:
      readEnv("SUPABASE_SUBSCRIPTION_LAST_EVENT_ID_COLUMN") ?? "last_event_id",
    lastEventTypeColumn:
      readEnv("SUPABASE_SUBSCRIPTION_LAST_EVENT_TYPE_COLUMN") ??
      "last_event_type",
  };
}

function getSupabaseAdminClient(config: SupabaseSubscriptionSyncConfig): SupabaseClient {
  if (
    cachedClient &&
    cachedClient.url === config.url &&
    cachedClient.key === config.serviceRoleKey
  ) {
    return cachedClient.client;
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  cachedClient = {
    url: config.url,
    key: config.serviceRoleKey,
    client,
  };
  return client;
}

function buildPayload(
  state: SubscriptionState,
  metadata: SubscriptionSyncMetadata,
  config: SupabaseSubscriptionSyncConfig
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [config.idColumn]: config.rowId,
    [config.planColumn]: state.plan,
    [config.statusColumn]: state.status,
    [config.providerColumn]: state.provider,
    [config.customerIdColumn]: state.customerId,
    [config.subscriptionIdColumn]: state.subscriptionId,
    [config.periodEndColumn]: state.currentPeriodEnd,
    [config.updatedAtColumn]: metadata.syncedAt ?? new Date().toISOString(),
    [config.lastEventIdColumn]: metadata.eventId,
    [config.lastEventTypeColumn]: metadata.eventType,
  };

  return payload;
}

export async function syncSubscriptionToSupabase(
  state: SubscriptionState,
  metadata: SubscriptionSyncMetadata
): Promise<void> {
  const config = readSyncConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("supabase_sync_not_configured");
    }
    return;
  }

  const supabase = getSupabaseAdminClient(config);
  const payload = buildPayload(state, metadata, config);
  const { error } = await supabase
    .from(config.table)
    .upsert(payload, { onConflict: config.idColumn });

  if (error) {
    throw new Error(`supabase_sync_failed:${error.message}`);
  }
}
