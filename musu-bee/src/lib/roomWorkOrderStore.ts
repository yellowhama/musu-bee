import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
} from "@/lib/p2pKvEnv";
import {
  type KvScriptClient,
  kvEvalJson,
  setKvScriptClientForTest,
} from "@/lib/kvScript";

export const ROOM_WORK_ORDER_STATUSES = [
  "queued",
  "claimed",
  "accepted",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RoomWorkOrderStatus = (typeof ROOM_WORK_ORDER_STATUSES)[number];

export const ROOM_WORK_ORDER_DELIVERY_MODES = [
  "bridge_forward",
  "desktop_outbound_pickup",
] as const;

export type RoomWorkOrderDeliveryMode = (typeof ROOM_WORK_ORDER_DELIVERY_MODES)[number];

export type StoredRoomWorkOrder = {
  schema: "musu.room_work_order.v1";
  work_order_id: string;
  owner_key: string;
  room_id: string;
  company_id?: string | null;
  project_id?: string | null;
  target_node?: string | null;
  source_agent_id?: string | null;
  sender_id: string;
  channel: string;
  adapter_type?: string | null;
  workspace_uri?: string | null;
  cwd?: string | null;
  instruction: string;
  permission_envelope?: unknown;
  trace_id?: string | null;
  origin: string;
  delivery_mode: RoomWorkOrderDeliveryMode;
  status: RoomWorkOrderStatus;
  created_at: string;
  expires_at: string;
  claimed_by?: string;
  claimed_at?: string;
  bridge_task_id?: string;
  bridge_status?: string;
  terminal_at?: string;
  last_error?: string;
};

export type RoomWorkOrderQuery = {
  owner_key?: string;
  limit?: number;
  company_id?: string;
  project_id?: string;
  target_node?: string;
  source_agent_id?: string;
  work_order_id?: string;
  status?: RoomWorkOrderStatus;
  include_expired?: boolean;
};

export type RoomWorkOrderClaimInput = RoomWorkOrderQuery & {
  owner_key: string;
  room_id: string;
  target_node: string;
  claimant_node_id?: string;
};

export type RoomWorkOrderDeliveryInput = {
  owner_key: string;
  room_id: string;
  work_order_id: string;
  target_node: string;
  status: "queued" | "accepted" | "failed";
  bridge_task_id?: string;
  bridge_status?: string;
  error?: string;
};

type RoomWorkOrderStoreState = {
  schema: "musu.room_work_order_store.v1";
  work_orders_by_room: Record<string, StoredRoomWorkOrder[]>;
};

const KV_ROOM_WORK_ORDER_PREFIX = "musu:rooms:work-orders:v1:";
const DEFAULT_MAX_WORK_ORDERS_PER_ROOM = 1000;
const DEFAULT_TTL_SECONDS = 900;
const MAX_CONTEXT_VALUE_CHARS = 160;
const MAX_INSTRUCTION_CHARS = 4000;
const MAX_PERMISSION_JSON_CHARS = 4096;
const MAX_PERMISSION_DEPTH = 4;
const MAX_PERMISSION_ARRAY_ITEMS = 32;
const MAX_PERMISSION_OBJECT_KEYS = 48;

let localLockQueue: Promise<void> = Promise.resolve();

export function __setRoomWorkOrderKvClientForTest(
  client: KvScriptClient | null
): void {
  setKvScriptClientForTest(client);
}

// Atomic Lua scripts mirroring the JS read-modify-write logic so concurrent
// claim/deliver requests cannot lose updates or double-claim (audit H1+H5).
// Storage shape matches the existing room store: a single JSON-encoded array
// of work orders stored under roomKey() with an EX expiry. Freshness uses the
// same `now <= expires_at` comparison as workOrderFresh(); ISO-8601 UTC `Z`
// timestamps are fixed-width and so compare correctly as strings.

const KV_UPSERT_WORK_ORDER_SCRIPT = `
-- musu_room_work_order_upsert_v1
local key = KEYS[1]
local now = ARGV[1]
local max_records = tonumber(ARGV[2])
local ex_seconds = tonumber(ARGV[3])
local order_json = ARGV[4]
local order = cjson.decode(order_json)

local raw = redis.call("GET", key)
local current = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == "table" then
    current = decoded
  end
end

local next_orders = {}
table.insert(next_orders, order)
for _, item in ipairs(current) do
  if type(item) == "table"
    and type(item.expires_at) == "string"
    and now <= item.expires_at
    and item.work_order_id ~= order.work_order_id then
    if #next_orders < max_records then
      table.insert(next_orders, item)
    end
  end
end

redis.call("SET", key, cjson.encode(next_orders), "EX", ex_seconds)
return cjson.encode({ ok = true })
`;

const KV_CLAIM_WORK_ORDERS_SCRIPT = `
-- musu_room_work_order_claim_v1
local key = KEYS[1]
local now = ARGV[1]
local max_records = tonumber(ARGV[2])
local ex_seconds = tonumber(ARGV[3])
local claim_limit = tonumber(ARGV[4])
local owner_key = ARGV[5]
local target_node = ARGV[6]
local claimant = ARGV[7]
local company_id = ARGV[8]
local project_id = ARGV[9]
local source_agent_id = ARGV[10]
local work_order_id = ARGV[11]

local raw = redis.call("GET", key)
local current = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == "table" then
    current = decoded
  end
end

local function has_value(value)
  return value ~= nil and value ~= ""
end

local function matches_queued(order)
  if order.status ~= "queued" then
    return false
  end
  if order.owner_key ~= owner_key then
    return false
  end
  if has_value(company_id) and order.company_id ~= company_id then
    return false
  end
  if has_value(project_id) and order.project_id ~= project_id then
    return false
  end
  if order.target_node ~= target_node then
    return false
  end
  if has_value(source_agent_id) and order.source_agent_id ~= source_agent_id then
    return false
  end
  if has_value(work_order_id) and order.work_order_id ~= work_order_id then
    return false
  end
  return true
end

local claimed = {}
local next_orders = {}
for _, order in ipairs(current) do
  if type(order) == "table"
    and type(order.expires_at) == "string"
    and now <= order.expires_at then
    if #next_orders < max_records then
      if #claimed < claim_limit and matches_queued(order) then
        order.status = "claimed"
        order.claimed_by = claimant
        order.claimed_at = now
        table.insert(claimed, order)
      end
      table.insert(next_orders, order)
    end
  end
end

redis.call("SET", key, cjson.encode(next_orders), "EX", ex_seconds)
return cjson.encode(claimed)
`;

const KV_DELIVER_WORK_ORDER_SCRIPT = `
-- musu_room_work_order_deliver_v1
local key = KEYS[1]
local now = ARGV[1]
local max_records = tonumber(ARGV[2])
local ex_seconds = tonumber(ARGV[3])
local owner_key = ARGV[4]
local room_id = ARGV[5]
local work_order_id = ARGV[6]
local target_node = ARGV[7]
local status = ARGV[8]
local delivered_at = ARGV[9]
local has_bridge_task_id = ARGV[10] == "1"
local bridge_task_id = ARGV[11]
local has_bridge_status = ARGV[12] == "1"
local bridge_status = ARGV[13]
local has_error = ARGV[14] == "1"
local last_error = ARGV[15]

local raw = redis.call("GET", key)
local current = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == "table" then
    current = decoded
  end
end

local result = { status = "not_found" }
local next_orders = {}
for _, order in ipairs(current) do
  if type(order) == "table"
    and type(order.expires_at) == "string"
    and now <= order.expires_at then
    if #next_orders < max_records then
      if order.owner_key == owner_key
        and order.room_id == room_id
        and order.work_order_id == work_order_id
        and order.target_node == target_node then
        if order.status ~= "claimed" then
          result = { status = "requires_claim" }
        else
          if has_bridge_task_id then
            order.bridge_task_id = bridge_task_id
          else
            order.bridge_task_id = nil
          end
          if has_bridge_status then
            order.bridge_status = bridge_status
          else
            order.bridge_status = nil
          end
          if has_error then
            order.last_error = last_error
          else
            order.last_error = nil
          end
          if status == "queued" then
            order.status = "queued"
            order.claimed_by = nil
            order.claimed_at = nil
          else
            order.status = status
            order.terminal_at = delivered_at
          end
          result = { status = "delivered", order = order }
        end
      end
      table.insert(next_orders, order)
    end
  end
end

redis.call("SET", key, cjson.encode(next_orders), "EX", ex_seconds)
return cjson.encode(result)
`;

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_ROOM_WORK_ORDER_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("room_work_order_kv_not_configured");
  }
}

function storePath(): string {
  const override = process.env.MUSU_ROOM_WORK_ORDER_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "room-work-orders", "work-orders.json");
}

function roomKey(roomId: string): string {
  return `${KV_ROOM_WORK_ORDER_PREFIX}${encodeURIComponent(roomId)}`;
}

export function roomWorkOrderTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_ROOM_WORK_ORDER_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 60), 24 * 60 * 60);
}

function roomWorkOrderExpirySeconds(): number {
  return Math.max(roomWorkOrderTtlSeconds() * 4, 300);
}

function maxWorkOrdersPerRoom(): number {
  const parsed = Number.parseInt(process.env.MUSU_ROOM_WORK_ORDER_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_WORK_ORDERS_PER_ROOM;
  }
  return Math.min(parsed, 10_000);
}

function normalizeContextValue(value: unknown, maxChars = MAX_CONTEXT_VALUE_CHARS): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, maxChars).join("");
}

function normalizeInstruction(value: unknown): string | null {
  return normalizeContextValue(value, MAX_INSTRUCTION_CHARS);
}

function normalizePermissionValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return Array.from(value).slice(0, 512).join("");
  }
  if (depth >= MAX_PERMISSION_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PERMISSION_ARRAY_ITEMS)
      .map((item) => normalizePermissionValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_PERMISSION_OBJECT_KEYS)) {
      const normalizedKey = normalizeContextValue(key);
      if (normalizedKey) {
        output[normalizedKey] = normalizePermissionValue(item, depth + 1);
      }
    }
    return output;
  }
  return null;
}

function normalizePermissionEnvelope(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  const normalized = normalizePermissionValue(value);
  const serialized = JSON.stringify(normalized);
  if (!serialized || serialized.length <= MAX_PERMISSION_JSON_CHARS) {
    return normalized;
  }
  return {
    truncated: true,
    original_json_chars: serialized.length,
    preview: serialized.slice(0, MAX_PERMISSION_JSON_CHARS),
  };
}

function isRoomWorkOrderStatus(value: unknown): value is RoomWorkOrderStatus {
  return ROOM_WORK_ORDER_STATUSES.includes(value as RoomWorkOrderStatus);
}

function isRoomWorkOrderDeliveryMode(value: unknown): value is RoomWorkOrderDeliveryMode {
  return ROOM_WORK_ORDER_DELIVERY_MODES.includes(value as RoomWorkOrderDeliveryMode);
}

function workOrderFresh(order: StoredRoomWorkOrder): boolean {
  const millis = Date.parse(order.expires_at);
  return Number.isFinite(millis) && millis >= Date.now();
}

function isStoredRoomWorkOrder(value: unknown): value is StoredRoomWorkOrder {
  if (!value || typeof value !== "object") {
    return false;
  }
  const order = value as Partial<StoredRoomWorkOrder>;
  return (
    order.schema === "musu.room_work_order.v1" &&
    typeof order.work_order_id === "string" &&
    typeof order.owner_key === "string" &&
    typeof order.room_id === "string" &&
    typeof order.sender_id === "string" &&
    typeof order.channel === "string" &&
    typeof order.instruction === "string" &&
    typeof order.origin === "string" &&
    isRoomWorkOrderDeliveryMode(order.delivery_mode) &&
    isRoomWorkOrderStatus(order.status) &&
    typeof order.created_at === "string" &&
    typeof order.expires_at === "string" &&
    (order.claimed_by === undefined || typeof order.claimed_by === "string") &&
    (order.claimed_at === undefined || typeof order.claimed_at === "string") &&
    (order.bridge_task_id === undefined || typeof order.bridge_task_id === "string") &&
    (order.bridge_status === undefined || typeof order.bridge_status === "string") &&
    (order.terminal_at === undefined || typeof order.terminal_at === "string") &&
    (order.last_error === undefined || typeof order.last_error === "string")
  );
}

function emptyState(): RoomWorkOrderStoreState {
  return {
    schema: "musu.room_work_order_store.v1",
    work_orders_by_room: {},
  };
}

function normalizeState(value: unknown): RoomWorkOrderStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const input = value as Partial<RoomWorkOrderStoreState>;
  const byRoom: Record<string, StoredRoomWorkOrder[]> = {};
  for (const [roomId, orders] of Object.entries(input.work_orders_by_room ?? {})) {
    if (!Array.isArray(orders)) {
      continue;
    }
    byRoom[roomId] = orders
      .filter(isStoredRoomWorkOrder)
      .slice(0, maxWorkOrdersPerRoom());
  }
  return {
    schema: "musu.room_work_order_store.v1",
    work_orders_by_room: byRoom,
  };
}

function fileGet(): RoomWorkOrderStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: RoomWorkOrderStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `room-work-orders-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, stateFile);
}

async function withLocalLock<T>(fn: () => Promise<T>): Promise<T> {
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

function orderMatches(order: StoredRoomWorkOrder, query: RoomWorkOrderQuery): boolean {
  if (!query.include_expired && !workOrderFresh(order)) {
    return false;
  }
  if (query.owner_key && order.owner_key !== query.owner_key) {
    return false;
  }
  if (query.company_id && order.company_id !== query.company_id) {
    return false;
  }
  if (query.project_id && order.project_id !== query.project_id) {
    return false;
  }
  if (query.target_node && order.target_node !== query.target_node) {
    return false;
  }
  if (query.source_agent_id && order.source_agent_id !== query.source_agent_id) {
    return false;
  }
  if (query.work_order_id && order.work_order_id !== query.work_order_id) {
    return false;
  }
  if (query.status && order.status !== query.status) {
    return false;
  }
  return true;
}

function claimTargetMatches(order: StoredRoomWorkOrder, targetNode: string): boolean {
  return order.target_node === targetNode;
}

function limitFrom(query: { limit?: number }): number {
  return Math.max(1, Math.min(query.limit ?? 20, 100));
}

export function createRoomWorkOrder(input: {
  owner_key: string;
  room_id: string;
  instruction: unknown;
  work_order_id?: unknown;
  company_id?: unknown;
  project_id?: unknown;
  target_node?: unknown;
  source_agent_id?: unknown;
  sender_id?: unknown;
  channel?: unknown;
  adapter_type?: unknown;
  workspace_uri?: unknown;
  cwd?: unknown;
  permission_envelope?: unknown;
  trace_id?: unknown;
  origin?: unknown;
  delivery_mode?: unknown;
  status?: unknown;
}): StoredRoomWorkOrder {
  const instruction = normalizeInstruction(input.instruction);
  if (!instruction) {
    throw new Error("instruction_required");
  }
  const ttl = roomWorkOrderTtlSeconds();
  const now = new Date();
  return {
    schema: "musu.room_work_order.v1",
    work_order_id: normalizeContextValue(input.work_order_id) ?? `wo-${randomUUID()}`,
    owner_key: input.owner_key,
    room_id: normalizeContextValue(input.room_id) ?? input.room_id,
    company_id: normalizeContextValue(input.company_id),
    project_id: normalizeContextValue(input.project_id),
    target_node: normalizeContextValue(input.target_node),
    source_agent_id: normalizeContextValue(input.source_agent_id),
    sender_id: normalizeContextValue(input.sender_id) ?? "musu.pro-room",
    channel: normalizeContextValue(input.channel) ?? "company-room",
    adapter_type: normalizeContextValue(input.adapter_type),
    workspace_uri: normalizeContextValue(input.workspace_uri, 512),
    cwd: normalizeContextValue(input.cwd, 512),
    instruction,
    permission_envelope: normalizePermissionEnvelope(input.permission_envelope),
    trace_id: normalizeContextValue(input.trace_id),
    origin: normalizeContextValue(input.origin) ?? "musu.pro",
    delivery_mode: isRoomWorkOrderDeliveryMode(input.delivery_mode)
      ? input.delivery_mode
      : "desktop_outbound_pickup",
    status: isRoomWorkOrderStatus(input.status) ? input.status : "queued",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

export function publicRoomWorkOrder(order: StoredRoomWorkOrder): Omit<StoredRoomWorkOrder, "owner_key"> {
  const { owner_key: _ownerKey, ...publicOrder } = order;
  return publicOrder;
}

export async function upsertRoomWorkOrder(order: StoredRoomWorkOrder): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    await kvEvalJson<{ ok: true }>(
      KV_UPSERT_WORK_ORDER_SCRIPT,
      [roomKey(order.room_id)],
      [
        new Date().toISOString(),
        String(maxWorkOrdersPerRoom()),
        String(roomWorkOrderExpirySeconds()),
        JSON.stringify(order),
      ]
    );
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    const current = (state.work_orders_by_room[order.room_id] ?? []).filter(workOrderFresh);
    fileSet({
      schema: "musu.room_work_order_store.v1",
      work_orders_by_room: {
        ...state.work_orders_by_room,
        [order.room_id]: [order, ...current.filter((item) => item.work_order_id !== order.work_order_id)]
          .slice(0, maxWorkOrdersPerRoom()),
      },
    });
  });
}

export async function queryRoomWorkOrders(
  roomId: string,
  query: RoomWorkOrderQuery = {}
): Promise<StoredRoomWorkOrder[]> {
  assertStoreConfigured();
  const limit = limitFrom(query);
  const records = shouldUseKv()
    ? (((await (await import("@vercel/kv")).kv.get<StoredRoomWorkOrder[]>(roomKey(roomId))) ?? [])
        .filter(isStoredRoomWorkOrder))
    : (fileGet().work_orders_by_room[roomId] ?? []);

  return records
    .filter((order) => order.room_id === roomId)
    .filter((order) => orderMatches(order, query))
    .slice(0, limit);
}

export async function claimRoomWorkOrders(
  input: RoomWorkOrderClaimInput
): Promise<StoredRoomWorkOrder[]> {
  assertStoreConfigured();
  const claimant = input.claimant_node_id ?? input.target_node;
  const now = new Date().toISOString();
  const limit = limitFrom(input);

  if (shouldUseKv()) {
    const claimed = await kvEvalJson<unknown[]>(
      KV_CLAIM_WORK_ORDERS_SCRIPT,
      [roomKey(input.room_id)],
      [
        now,
        String(maxWorkOrdersPerRoom()),
        String(roomWorkOrderExpirySeconds()),
        String(limit),
        input.owner_key,
        input.target_node,
        claimant,
        input.company_id ?? "",
        input.project_id ?? "",
        input.source_agent_id ?? "",
        input.work_order_id ?? "",
      ]
    );
    // Re-validate Lua-returned orders with the same guard the file path uses,
    // so KV/script corruption cannot leak malformed orders to callers (H6).
    return (Array.isArray(claimed) ? claimed : []).filter(isStoredRoomWorkOrder);
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const current = (state.work_orders_by_room[input.room_id] ?? []).filter(workOrderFresh);
    const claimed: StoredRoomWorkOrder[] = [];
    const next = current.map((order) => {
      if (
        claimed.length < limit &&
        orderMatches(order, { ...input, status: "queued" }) &&
        claimTargetMatches(order, input.target_node)
      ) {
        const nextOrder: StoredRoomWorkOrder = {
          ...order,
          status: "claimed",
          claimed_by: claimant,
          claimed_at: now,
        };
        claimed.push(nextOrder);
        return nextOrder;
      }
      return order;
    });
    fileSet({
      schema: "musu.room_work_order_store.v1",
      work_orders_by_room: {
        ...state.work_orders_by_room,
        [input.room_id]: next.slice(0, maxWorkOrdersPerRoom()),
      },
    });
    return claimed;
  });
}

export async function markRoomWorkOrderDelivery(
  input: RoomWorkOrderDeliveryInput
): Promise<StoredRoomWorkOrder | null> {
  assertStoreConfigured();
  const deliveredAt = new Date().toISOString();

  if (shouldUseKv()) {
    // Normalize the same fields applyRoomWorkOrderDeliveryToList() does, then
    // pass presence flags so the Lua script can omit absent keys exactly like
    // the `?? undefined` behavior of the JS path.
    const bridgeTaskId = normalizeContextValue(input.bridge_task_id);
    const bridgeStatus = normalizeContextValue(input.bridge_status);
    const lastError = normalizeContextValue(input.error);
    const result = await kvEvalJson<
      | { status: "delivered"; order: StoredRoomWorkOrder }
      | { status: "not_found" }
      | { status: "requires_claim" }
    >(
      KV_DELIVER_WORK_ORDER_SCRIPT,
      [roomKey(input.room_id)],
      [
        new Date().toISOString(),
        String(maxWorkOrdersPerRoom()),
        String(roomWorkOrderExpirySeconds()),
        input.owner_key,
        input.room_id,
        input.work_order_id,
        input.target_node,
        input.status,
        deliveredAt,
        bridgeTaskId === null ? "0" : "1",
        bridgeTaskId ?? "",
        bridgeStatus === null ? "0" : "1",
        bridgeStatus ?? "",
        lastError === null ? "0" : "1",
        lastError ?? "",
      ]
    );
    if (result.status === "requires_claim") {
      throw new Error("room_work_order_delivery_requires_claim");
    }
    if (result.status !== "delivered") {
      return null;
    }
    // Re-validate the Lua-returned order; corrupt data must not pass silently (H6).
    if (!isStoredRoomWorkOrder(result.order)) {
      throw new Error("room_work_order_delivery_malformed");
    }
    return result.order;
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const current = (state.work_orders_by_room[input.room_id] ?? []).filter(workOrderFresh);
    const next = applyRoomWorkOrderDeliveryToList(current, input, deliveredAt);
    fileSet({
      schema: "musu.room_work_order_store.v1",
      work_orders_by_room: {
        ...state.work_orders_by_room,
        [input.room_id]: next.work_orders.slice(0, maxWorkOrdersPerRoom()),
      },
    });
    return next.delivered;
  });
}

function applyRoomWorkOrderDeliveryToList(
  workOrders: StoredRoomWorkOrder[],
  input: RoomWorkOrderDeliveryInput,
  deliveredAt: string
): { work_orders: StoredRoomWorkOrder[]; delivered: StoredRoomWorkOrder | null } {
  let delivered: StoredRoomWorkOrder | null = null;
  const work_orders = workOrders.map((order) => {
    if (
      order.owner_key !== input.owner_key ||
      order.room_id !== input.room_id ||
      order.work_order_id !== input.work_order_id ||
      order.target_node !== input.target_node
    ) {
      return order;
    }
    if (order.status !== "claimed") {
      throw new Error("room_work_order_delivery_requires_claim");
    }

    const base: StoredRoomWorkOrder = {
      ...order,
      bridge_task_id: normalizeContextValue(input.bridge_task_id) ?? undefined,
      bridge_status: normalizeContextValue(input.bridge_status) ?? undefined,
      last_error: normalizeContextValue(input.error) ?? undefined,
    };

    if (input.status === "queued") {
      delivered = {
        ...base,
        status: "queued",
        claimed_by: undefined,
        claimed_at: undefined,
      };
      return delivered;
    }

    delivered = {
      ...base,
      status: input.status,
      terminal_at: deliveredAt,
    };
    return delivered;
  });

  return { work_orders, delivered };
}
