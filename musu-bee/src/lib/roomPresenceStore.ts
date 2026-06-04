import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
} from "@/lib/p2pKvEnv";
import type {
  P2pCandidateEndpoint,
  P2pNodeCandidateSet,
} from "@/lib/p2pRendezvousStore";
import { normalizeCandidateEndpoints } from "@/lib/p2pRendezvousStore";

export const ROOM_PRESENCE_STATUSES = ["online", "idle", "busy", "offline"] as const;

export type RoomPresenceStatus = (typeof ROOM_PRESENCE_STATUSES)[number];

export type StoredRoomPresence = {
  schema: "musu.room_presence.v1";
  owner_key: string;
  room_id: string;
  node_id: string;
  node_name: string;
  app_version: string;
  status: RoomPresenceStatus;
  company_id?: string | null;
  project_id?: string | null;
  source_agent_id?: string | null;
  active_work_order_ids: string[];
  candidate_endpoints: P2pCandidateEndpoint[];
  relay_capable: boolean;
  public_key: string;
  capabilities: string[];
  origin: string;
  last_seen_at: string;
  expires_at: string;
  heartbeat_ttl_seconds: number;
};

export type RoomPresenceQuery = {
  owner_key?: string;
  limit?: number;
  company_id?: string;
  project_id?: string;
  node_id?: string;
  source_agent_id?: string;
  status?: RoomPresenceStatus;
  include_expired?: boolean;
};

type RoomPresenceStoreState = {
  schema: "musu.room_presence_store.v1";
  presence_by_room: Record<string, StoredRoomPresence[]>;
};

const KV_ROOM_PRESENCE_PREFIX = "musu:rooms:presence:v1:";
const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_MAX_PRESENCE_PER_ROOM = 500;
const MAX_CONTEXT_VALUE_CHARS = 160;
const MAX_PUBLIC_KEY_CHARS = 512;
const MAX_CAPABILITIES = 64;
const MAX_ACTIVE_WORK_ORDERS = 32;

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_ROOM_PRESENCE_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("room_presence_kv_not_configured");
  }
}

function storePath(): string {
  const override = process.env.MUSU_ROOM_PRESENCE_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "room-presence", "presence.json");
}

function roomKey(roomId: string): string {
  return `${KV_ROOM_PRESENCE_PREFIX}${encodeURIComponent(roomId)}`;
}

export function roomPresenceTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_ROOM_PRESENCE_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 15), 3600);
}

function maxPresencePerRoom(): number {
  const parsed = Number.parseInt(process.env.MUSU_ROOM_PRESENCE_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PRESENCE_PER_ROOM;
  }
  return Math.min(parsed, 5000);
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

function isRoomPresenceStatus(value: unknown): value is RoomPresenceStatus {
  return ROOM_PRESENCE_STATUSES.includes(value as RoomPresenceStatus);
}

function normalizeStatus(value: unknown): RoomPresenceStatus {
  return isRoomPresenceStatus(value) ? value : "online";
}

function normalizeStringArray(value: unknown, maxItems: number, maxChars = 96): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, maxItems)
    .map((item) => normalizeContextValue(item, maxChars))
    .filter((item): item is string => Boolean(item));
}

function presenceKey(record: Pick<StoredRoomPresence, "owner_key" | "room_id" | "node_id" | "source_agent_id">): string {
  return [
    record.owner_key,
    record.room_id,
    record.node_id,
    record.source_agent_id ?? "",
  ].join("\u001f");
}

function isStoredRoomPresence(value: unknown): value is StoredRoomPresence {
  if (!value || typeof value !== "object") {
    return false;
  }
  const presence = value as Partial<StoredRoomPresence>;
  return (
    presence.schema === "musu.room_presence.v1" &&
    typeof presence.owner_key === "string" &&
    typeof presence.room_id === "string" &&
    typeof presence.node_id === "string" &&
    typeof presence.node_name === "string" &&
    typeof presence.app_version === "string" &&
    isRoomPresenceStatus(presence.status) &&
    Array.isArray(presence.candidate_endpoints) &&
    typeof presence.relay_capable === "boolean" &&
    typeof presence.public_key === "string" &&
    Array.isArray(presence.capabilities) &&
    typeof presence.origin === "string" &&
    typeof presence.last_seen_at === "string" &&
    typeof presence.expires_at === "string" &&
    typeof presence.heartbeat_ttl_seconds === "number"
  );
}

function emptyState(): RoomPresenceStoreState {
  return {
    schema: "musu.room_presence_store.v1",
    presence_by_room: {},
  };
}

function normalizeState(value: unknown): RoomPresenceStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const input = value as Partial<RoomPresenceStoreState>;
  const presenceByRoom: Record<string, StoredRoomPresence[]> = {};
  for (const [roomId, records] of Object.entries(input.presence_by_room ?? {})) {
    if (!Array.isArray(records)) {
      continue;
    }
    presenceByRoom[roomId] = records
      .filter(isStoredRoomPresence)
      .slice(0, maxPresencePerRoom());
  }
  return {
    schema: "musu.room_presence_store.v1",
    presence_by_room: presenceByRoom,
  };
}

function fileGet(): RoomPresenceStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: RoomPresenceStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `room-presence-${process.pid}-${Date.now()}.json`);
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

function recordFresh(record: StoredRoomPresence): boolean {
  const millis = Date.parse(record.expires_at);
  return Number.isFinite(millis) && millis >= Date.now();
}

export function createRoomPresence(input: {
  owner_key: string;
  room_id: string;
  node_id: unknown;
  node_name?: unknown;
  app_version?: unknown;
  status?: unknown;
  company_id?: unknown;
  project_id?: unknown;
  source_agent_id?: unknown;
  active_work_order_ids?: unknown;
  candidate_endpoints?: unknown;
  relay_capable?: unknown;
  public_key?: unknown;
  capabilities?: unknown;
  origin?: unknown;
}): StoredRoomPresence {
  const nodeId = normalizeContextValue(input.node_id);
  if (!nodeId) {
    throw new Error("node_id_required");
  }
  const ttl = roomPresenceTtlSeconds();
  const now = new Date();
  return {
    schema: "musu.room_presence.v1",
    owner_key: input.owner_key,
    room_id: normalizeContextValue(input.room_id) ?? input.room_id,
    node_id: nodeId,
    node_name: normalizeContextValue(input.node_name) ?? nodeId,
    app_version: normalizeContextValue(input.app_version, 80) ?? "unknown",
    status: normalizeStatus(input.status),
    company_id: normalizeContextValue(input.company_id),
    project_id: normalizeContextValue(input.project_id),
    source_agent_id: normalizeContextValue(input.source_agent_id),
    active_work_order_ids: normalizeStringArray(input.active_work_order_ids, MAX_ACTIVE_WORK_ORDERS),
    candidate_endpoints: normalizeCandidateEndpoints(input.candidate_endpoints),
    relay_capable: typeof input.relay_capable === "boolean" ? input.relay_capable : false,
    public_key: normalizeContextValue(input.public_key, MAX_PUBLIC_KEY_CHARS) ?? "",
    capabilities: normalizeStringArray(input.capabilities, MAX_CAPABILITIES),
    origin: normalizeContextValue(input.origin) ?? "musu.pro",
    last_seen_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
    heartbeat_ttl_seconds: ttl,
  };
}

export function roomPresenceToCandidateSet(record: StoredRoomPresence): P2pNodeCandidateSet {
  return {
    node_id: record.node_id,
    node_name: record.node_name,
    app_version: record.app_version,
    candidate_endpoints: [...record.candidate_endpoints],
    relay_capable: record.relay_capable,
    public_key: record.public_key,
    capabilities: [...record.capabilities],
  };
}

export async function upsertRoomPresence(record: StoredRoomPresence): Promise<void> {
  assertStoreConfigured();
  const key = presenceKey(record);
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    const current = ((await kv.get<StoredRoomPresence[]>(roomKey(record.room_id))) ?? [])
      .filter(isStoredRoomPresence);
    const next = [record, ...current.filter((item) => presenceKey(item) !== key)]
      .slice(0, maxPresencePerRoom());
    await kv.set(roomKey(record.room_id), next, {
      ex: Math.max(roomPresenceTtlSeconds() * 4, 300),
    });
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    const current = state.presence_by_room[record.room_id] ?? [];
    fileSet({
      schema: "musu.room_presence_store.v1",
      presence_by_room: {
        ...state.presence_by_room,
        [record.room_id]: [record, ...current.filter((item) => presenceKey(item) !== key)]
          .slice(0, maxPresencePerRoom()),
      },
    });
  });
}

export async function queryRoomPresence(
  roomId: string,
  query: RoomPresenceQuery = {}
): Promise<StoredRoomPresence[]> {
  assertStoreConfigured();
  const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
  const records = shouldUseKv()
    ? (((await (await import("@vercel/kv")).kv.get<StoredRoomPresence[]>(roomKey(roomId))) ?? [])
        .filter(isStoredRoomPresence))
    : (fileGet().presence_by_room[roomId] ?? []);

  return records
    .filter((record) => {
      if (record.room_id !== roomId) {
        return false;
      }
      if (!query.include_expired && !recordFresh(record)) {
        return false;
      }
      if (query.owner_key && record.owner_key !== query.owner_key) {
        return false;
      }
      if (query.company_id && record.company_id !== query.company_id) {
        return false;
      }
      if (query.project_id && record.project_id !== query.project_id) {
        return false;
      }
      if (query.node_id && record.node_id !== query.node_id) {
        return false;
      }
      if (query.source_agent_id && record.source_agent_id !== query.source_agent_id) {
        return false;
      }
      if (query.status && record.status !== query.status) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}
