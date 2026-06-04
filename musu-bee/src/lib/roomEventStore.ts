import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
} from "@/lib/p2pKvEnv";

export const ROOM_EVENT_TYPES = [
  "presence",
  "status",
  "message",
  "decision",
  "work_order",
  "rendezvous",
  "route",
  "error",
] as const;

export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];

export type StoredRoomEvent = {
  schema: "musu.room_event.v1";
  event_id: string;
  owner_key: string;
  room_id: string;
  company_id?: string | null;
  project_id?: string | null;
  work_order_id?: string | null;
  source_node_id?: string | null;
  source_agent_id?: string | null;
  event_type: RoomEventType;
  message?: string | null;
  payload?: unknown;
  origin: string;
  created_at: string;
};

export type RoomEventQuery = {
  owner_key?: string;
  limit?: number;
  company_id?: string;
  project_id?: string;
  work_order_id?: string;
  source_node_id?: string;
  source_agent_id?: string;
  event_type?: RoomEventType;
  since?: string;
};

type RoomEventStoreState = {
  schema: "musu.room_event_store.v1";
  events_by_room: Record<string, StoredRoomEvent[]>;
};

const KV_ROOM_EVENT_PREFIX = "musu:rooms:events:v1:";
const DEFAULT_MAX_EVENTS_PER_ROOM = 500;
const MAX_CONTEXT_VALUE_CHARS = 160;
const MAX_MESSAGE_CHARS = 4000;
const MAX_PAYLOAD_JSON_CHARS = 4096;
const MAX_PAYLOAD_DEPTH = 4;
const MAX_PAYLOAD_ARRAY_ITEMS = 32;
const MAX_PAYLOAD_OBJECT_KEYS = 48;

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_ROOM_EVENT_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("room_event_kv_not_configured");
  }
}

function storePath(): string {
  const override = process.env.MUSU_ROOM_EVENT_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "room-events", "events.json");
}

function roomKey(roomId: string): string {
  return `${KV_ROOM_EVENT_PREFIX}${encodeURIComponent(roomId)}`;
}

function maxEventsPerRoom(): number {
  const parsed = Number.parseInt(process.env.MUSU_ROOM_EVENT_MAX_EVENTS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_EVENTS_PER_ROOM;
  }
  return Math.min(parsed, 5000);
}

function normalizeContextValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, MAX_CONTEXT_VALUE_CHARS).join("");
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, MAX_MESSAGE_CHARS).join("");
}

function normalizePayloadValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return Array.from(value).slice(0, 512).join("");
  }
  if (depth >= MAX_PAYLOAD_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_PAYLOAD_ARRAY_ITEMS)
      .map((item) => normalizePayloadValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_PAYLOAD_OBJECT_KEYS)) {
      const normalizedKey = normalizeContextValue(key);
      if (normalizedKey) {
        output[normalizedKey] = normalizePayloadValue(item, depth + 1);
      }
    }
    return output;
  }
  return null;
}

function normalizePayload(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  const normalized = normalizePayloadValue(value);
  const serialized = JSON.stringify(normalized);
  if (!serialized || serialized.length <= MAX_PAYLOAD_JSON_CHARS) {
    return normalized;
  }
  return {
    truncated: true,
    original_json_chars: serialized.length,
    preview: serialized.slice(0, MAX_PAYLOAD_JSON_CHARS),
  };
}

function isRoomEventType(value: unknown): value is RoomEventType {
  return ROOM_EVENT_TYPES.includes(value as RoomEventType);
}

function isStoredRoomEvent(value: unknown): value is StoredRoomEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<StoredRoomEvent>;
  return (
    event.schema === "musu.room_event.v1" &&
    typeof event.event_id === "string" &&
    typeof event.owner_key === "string" &&
    typeof event.room_id === "string" &&
    isRoomEventType(event.event_type) &&
    typeof event.origin === "string" &&
    typeof event.created_at === "string"
  );
}

function emptyState(): RoomEventStoreState {
  return {
    schema: "musu.room_event_store.v1",
    events_by_room: {},
  };
}

function normalizeState(value: unknown): RoomEventStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const input = value as Partial<RoomEventStoreState>;
  const eventsByRoom: Record<string, StoredRoomEvent[]> = {};
  for (const [roomId, events] of Object.entries(input.events_by_room ?? {})) {
    if (!Array.isArray(events)) {
      continue;
    }
    eventsByRoom[roomId] = events.filter(isStoredRoomEvent).slice(0, maxEventsPerRoom());
  }
  return {
    schema: "musu.room_event_store.v1",
    events_by_room: eventsByRoom,
  };
}

function fileGet(): RoomEventStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: RoomEventStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `room-events-${process.pid}-${Date.now()}.json`);
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

export function createRoomEvent(input: {
  owner_key: string;
  room_id: string;
  event_type: RoomEventType;
  company_id?: unknown;
  project_id?: unknown;
  work_order_id?: unknown;
  source_node_id?: unknown;
  source_agent_id?: unknown;
  message?: unknown;
  payload?: unknown;
  origin?: unknown;
}): StoredRoomEvent {
  return {
    schema: "musu.room_event.v1",
    event_id: `room-event-${Date.now()}-${randomUUID()}`,
    owner_key: input.owner_key,
    room_id: normalizeContextValue(input.room_id) ?? input.room_id,
    company_id: normalizeContextValue(input.company_id),
    project_id: normalizeContextValue(input.project_id),
    work_order_id: normalizeContextValue(input.work_order_id),
    source_node_id: normalizeContextValue(input.source_node_id),
    source_agent_id: normalizeContextValue(input.source_agent_id),
    event_type: input.event_type,
    message: normalizeMessage(input.message),
    payload: normalizePayload(input.payload),
    origin: normalizeContextValue(input.origin) ?? "musu.pro",
    created_at: new Date().toISOString(),
  };
}

export async function appendRoomEvent(event: StoredRoomEvent): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.lpush(roomKey(event.room_id), event);
    await kv.ltrim(roomKey(event.room_id), 0, maxEventsPerRoom() - 1);
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    const current = state.events_by_room[event.room_id] ?? [];
    fileSet({
      schema: "musu.room_event_store.v1",
      events_by_room: {
        ...state.events_by_room,
        [event.room_id]: [event, ...current].slice(0, maxEventsPerRoom()),
      },
    });
  });
}

export async function queryRoomEvents(
  roomId: string,
  query: RoomEventQuery = {}
): Promise<StoredRoomEvent[]> {
  assertStoreConfigured();
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));
  const records = shouldUseKv()
    ? (await (async () => {
        const { kv } = await import("@vercel/kv");
        return (await kv.lrange<StoredRoomEvent>(
          roomKey(roomId),
          0,
          maxEventsPerRoom() - 1
        )).filter(isStoredRoomEvent);
      })())
    : (fileGet().events_by_room[roomId] ?? []);

  const sinceMillis = query.since ? Date.parse(query.since) : Number.NaN;
  return records
    .filter((event) => {
      if (event.room_id !== roomId) {
        return false;
      }
      if (query.owner_key && event.owner_key !== query.owner_key) {
        return false;
      }
      if (query.company_id && event.company_id !== query.company_id) {
        return false;
      }
      if (query.project_id && event.project_id !== query.project_id) {
        return false;
      }
      if (query.work_order_id && event.work_order_id !== query.work_order_id) {
        return false;
      }
      if (query.source_node_id && event.source_node_id !== query.source_node_id) {
        return false;
      }
      if (query.source_agent_id && event.source_agent_id !== query.source_agent_id) {
        return false;
      }
      if (query.event_type && event.event_type !== query.event_type) {
        return false;
      }
      if (Number.isFinite(sinceMillis)) {
        const createdMillis = Date.parse(event.created_at);
        if (!Number.isFinite(createdMillis) || createdMillis < sinceMillis) {
          return false;
        }
      }
      return true;
    })
    .slice(0, limit);
}
