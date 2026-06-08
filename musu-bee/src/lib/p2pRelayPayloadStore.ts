import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
  p2pKvEnvStatus,
} from "@/lib/p2pKvEnv";
import type { RelayRouteKind } from "@/lib/p2pRelayLeaseStore";

export type RelayPayloadStatus = "queued" | "claimed" | "delivered";

export type StoredP2pRelayPayload = {
  payload_id: string;
  owner_key: string;
  session_id: string;
  lease_id: string;
  source_node_id: string;
  target_node_id: string;
  relay_url: string;
  tunnel_id: string;
  payload_kind: string;
  payload_bytes: number;
  payload_sha256: string;
  payload_base64: string;
  candidate_route_kinds?: RelayRouteKind[];
  attempted_route_kinds?: RelayRouteKind[];
  status: RelayPayloadStatus;
  relay_default_data_path: boolean;
  release_grade: boolean;
  transport_kind: "http_store_forward_preview" | "quic_relay_tunnel";
  created_at: string;
  expires_at: string;
  claimed_by?: string;
  claimed_at?: string;
  delivered_at?: string;
};

export type RelayPayloadDeliveryProof = {
  schema: "musu.relay_payload_delivery_proof.v1";
  payload_id: string;
  session_id: string;
  lease_id: string;
  source_node_id: string;
  target_node_id: string;
  relay_url: string;
  tunnel_id: string;
  transport_kind: "http_store_forward_preview" | "quic_relay_tunnel";
  relay_default_data_path: boolean;
  release_grade: boolean;
  payload_sha256: string;
  payload_bytes: number;
  delivered_at: string;
};

type P2pRelayPayloadStoreState = {
  schema: "musu.p2p_relay_payload_store.v1";
  payloads: StoredP2pRelayPayload[];
};

export type P2pRelayPayloadQuery = {
  owner_key?: string;
  limit?: number;
  session_id?: string;
  lease_id?: string;
  source_node_id?: string;
  target_node_id?: string;
  tunnel_id?: string;
  status?: RelayPayloadStatus;
};

export type P2pRelayPayloadClaimInput = P2pRelayPayloadQuery & {
  owner_key: string;
  target_node_id: string;
  claimant_node_id?: string;
};

export type P2pRelayPayloadDeliveryInput = {
  owner_key: string;
  payload_id: string;
  target_node_id: string;
};

export type P2pRelayPayloadStoreStatus = {
  configured: boolean;
  backend: "vercel_kv" | "upstash_redis" | "file" | "development_file" | "unconfigured";
  release_grade: boolean;
};

type RelayPayloadKvClient = {
  del: (key: string) => Promise<unknown>;
  eval?: <T = unknown>(script: string, keys: string[], args: string[]) => Promise<T>;
  lpush: (key: string, payload: StoredP2pRelayPayload) => Promise<unknown>;
  lrange: <T = unknown>(key: string, start: number, stop: number) => Promise<T[]>;
  ltrim: (key: string, start: number, stop: number) => Promise<unknown>;
  rpush: (key: string, payload: StoredP2pRelayPayload) => Promise<unknown>;
};

const KV_KEY = "musu:p2p:relay-payloads:v1";
const DEFAULT_MAX_PAYLOADS = 1000;
const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024;
const RELAY_ROUTE_KINDS = new Set<RelayRouteKind>([
  "lan",
  "tailscale",
  "direct_quic",
  "relay",
]);

const KV_APPEND_PAYLOAD_SCRIPT = `
-- musu_relay_payload_append_v1
local key = KEYS[1]
local payload_json = ARGV[1]
local max_records = tonumber(ARGV[2])

redis.call("LPUSH", key, payload_json)
redis.call("LTRIM", key, 0, max_records - 1)

return cjson.encode({ ok = true })
`;

const KV_CLAIM_PAYLOADS_SCRIPT = `
-- musu_relay_payload_claim_v1
local key = KEYS[1]
local max_records = tonumber(ARGV[1])
local now = ARGV[2]
local owner_key = ARGV[3]
local target_node_id = ARGV[4]
local session_id = ARGV[5]
local lease_id = ARGV[6]
local source_node_id = ARGV[7]
local tunnel_id = ARGV[8]
local claim_limit = tonumber(ARGV[9])
local claimant = ARGV[10]

local records = redis.call("LRANGE", key, 0, max_records - 1)
local retained = {}
local claimed = {}

local function has_value(value)
  return value ~= nil and value ~= ""
end

local function matches(payload)
  if payload.owner_key ~= owner_key then
    return false
  end
  if payload.target_node_id ~= target_node_id then
    return false
  end
  if payload.status ~= "queued" then
    return false
  end
  if has_value(session_id) and payload.session_id ~= session_id then
    return false
  end
  if has_value(lease_id) and payload.lease_id ~= lease_id then
    return false
  end
  if has_value(source_node_id) and payload.source_node_id ~= source_node_id then
    return false
  end
  if has_value(tunnel_id) and payload.tunnel_id ~= tunnel_id then
    return false
  end
  return true
end

for _, raw in ipairs(records) do
  local ok, payload = pcall(cjson.decode, raw)
  if ok and type(payload) == "table" and type(payload.expires_at) == "string" and now < payload.expires_at then
    if #claimed < claim_limit and matches(payload) then
      payload.status = "claimed"
      payload.claimed_by = claimant
      payload.claimed_at = now
      table.insert(claimed, payload)
    end
    table.insert(retained, cjson.encode(payload))
  end
end

redis.call("DEL", key)
for _, raw in ipairs(retained) do
  redis.call("RPUSH", key, raw)
end
redis.call("LTRIM", key, 0, max_records - 1)

return cjson.encode(claimed)
`;

const KV_DELIVER_PAYLOAD_SCRIPT = `
-- musu_relay_payload_deliver_v1
local key = KEYS[1]
local max_records = tonumber(ARGV[1])
local delivered_at = ARGV[2]
local owner_key = ARGV[3]
local payload_id = ARGV[4]
local target_node_id = ARGV[5]

local records = redis.call("LRANGE", key, 0, max_records - 1)
local retained = {}
local result = { status = "not_found" }

for _, raw in ipairs(records) do
  local ok, payload = pcall(cjson.decode, raw)
  if ok and type(payload) == "table" and type(payload.expires_at) == "string" and delivered_at < payload.expires_at then
    if payload.payload_id == payload_id and payload.owner_key == owner_key and payload.target_node_id == target_node_id then
      if payload.status ~= "claimed" then
        result = { status = "requires_claim" }
      else
        payload.status = "delivered"
        payload.delivered_at = delivered_at
        result = { status = "delivered", payload = payload }
      end
    end
    table.insert(retained, cjson.encode(payload))
  end
end

redis.call("DEL", key)
for _, raw in ipairs(retained) do
  redis.call("RPUSH", key, raw)
end
redis.call("LTRIM", key, 0, max_records - 1)

return cjson.encode(result)
`;

let localLockQueue: Promise<void> = Promise.resolve();
let kvClientForTest: RelayPayloadKvClient | null = null;

export function __setP2pRelayPayloadKvClientForTest(
  client: RelayPayloadKvClient | null
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("relay_payload_kv_test_client_forbidden");
  }
  kvClientForTest = client;
}

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_P2P_RELAY_PAYLOAD_STORE_PATH?.trim());
}

export function p2pRelayPayloadStoreStatus(): P2pRelayPayloadStoreStatus {
  const kvStatus = p2pKvEnvStatus();
  const kvConfigured = hasP2pKvCredentials();
  if (kvConfigured) {
    return {
      configured: true,
      backend:
        kvStatus.url_source === "upstash_redis" || kvStatus.token_source === "upstash_redis"
          ? "upstash_redis"
          : "vercel_kv",
      release_grade: true,
    };
  }

  if (hasExplicitFileStore()) {
    return {
      configured: true,
      backend: "file",
      release_grade: false,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      configured: true,
      backend: "development_file",
      release_grade: false,
    };
  }

  return {
    configured: false,
    backend: "unconfigured",
    release_grade: false,
  };
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("p2p_relay_payload_kv_not_configured");
  }
}

function maxPayloads(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_PAYLOAD_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PAYLOADS;
  }
  return Math.min(parsed, 10_000);
}

export function relayPayloadMaxBytes(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_PAYLOAD_MAX_BYTES ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PAYLOAD_BYTES;
  }
  return Math.min(Math.max(parsed, 1024), 4 * 1024 * 1024);
}

export function relayPayloadTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_PAYLOAD_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 60), 3600);
}

function storePath(): string {
  const override = process.env.MUSU_P2P_RELAY_PAYLOAD_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "p2p-relay-payloads", "payloads.json");
}

function emptyState(): P2pRelayPayloadStoreState {
  return {
    schema: "musu.p2p_relay_payload_store.v1",
    payloads: [],
  };
}

function payloadFresh(payload: StoredP2pRelayPayload): boolean {
  const expiresAt = Date.parse(payload.expires_at);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

async function kvClient(): Promise<RelayPayloadKvClient> {
  if (kvClientForTest) {
    return kvClientForTest;
  }
  const { kv } = await import("@vercel/kv");
  return kv as RelayPayloadKvClient;
}

async function kvEvalJson<T>(script: string, args: string[]): Promise<T> {
  const kv = await kvClient();
  if (typeof kv.eval !== "function") {
    throw new Error("relay_payload_atomic_kv_eval_unavailable");
  }
  const raw = await kv.eval<unknown>(script, [KV_KEY], args);
  if (typeof raw === "string") {
    return JSON.parse(raw) as T;
  }
  return raw as T;
}

async function kvGetPayloads(): Promise<StoredP2pRelayPayload[]> {
  const kv = await kvClient();
  return (await kv.lrange<unknown>(KV_KEY, 0, maxPayloads() - 1))
    .map(coerceStoredRelayPayload)
    .filter((payload): payload is StoredP2pRelayPayload => payload !== null)
    .filter(payloadFresh)
    .slice(0, maxPayloads());
}

function isStoredRelayPayload(value: unknown): value is StoredP2pRelayPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<StoredP2pRelayPayload>;
  return (
    typeof payload.payload_id === "string" &&
    typeof payload.owner_key === "string" &&
    typeof payload.session_id === "string" &&
    typeof payload.lease_id === "string" &&
    typeof payload.source_node_id === "string" &&
    typeof payload.target_node_id === "string" &&
    typeof payload.relay_url === "string" &&
    typeof payload.tunnel_id === "string" &&
    typeof payload.payload_kind === "string" &&
    typeof payload.payload_bytes === "number" &&
    typeof payload.payload_sha256 === "string" &&
    typeof payload.payload_base64 === "string" &&
    (payload.status === "queued" ||
      payload.status === "claimed" ||
      payload.status === "delivered") &&
    typeof payload.relay_default_data_path === "boolean" &&
    typeof payload.release_grade === "boolean" &&
    (payload.transport_kind === "http_store_forward_preview" ||
      payload.transport_kind === "quic_relay_tunnel") &&
    typeof payload.created_at === "string" &&
    typeof payload.expires_at === "string" &&
    (payload.candidate_route_kinds === undefined ||
      (Array.isArray(payload.candidate_route_kinds) &&
        payload.candidate_route_kinds.every((kind) => RELAY_ROUTE_KINDS.has(kind)))) &&
    (payload.attempted_route_kinds === undefined ||
      (Array.isArray(payload.attempted_route_kinds) &&
        payload.attempted_route_kinds.every((kind) => RELAY_ROUTE_KINDS.has(kind)))) &&
    (payload.claimed_by === undefined || typeof payload.claimed_by === "string") &&
    (payload.claimed_at === undefined || typeof payload.claimed_at === "string") &&
    (payload.delivered_at === undefined || typeof payload.delivered_at === "string")
  );
}

function normalizedRouteKinds(value?: RelayRouteKind[] | null): RelayRouteKind[] {
  const kinds: RelayRouteKind[] = [];
  for (const kind of value ?? []) {
    if (RELAY_ROUTE_KINDS.has(kind) && !kinds.includes(kind)) {
      kinds.push(kind);
    }
  }
  return kinds;
}

function coerceStoredRelayPayload(value: unknown): StoredP2pRelayPayload | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isStoredRelayPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isStoredRelayPayload(value) ? value : null;
}

function normalizeState(value: unknown): P2pRelayPayloadStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const state = value as Partial<P2pRelayPayloadStoreState>;
  return {
    schema: "musu.p2p_relay_payload_store.v1",
    payloads: Array.isArray(state.payloads)
      ? state.payloads
          .map(coerceStoredRelayPayload)
          .filter((payload): payload is StoredP2pRelayPayload => payload !== null)
          .filter(payloadFresh)
          .slice(0, maxPayloads())
      : [],
  };
}

function fileGet(): P2pRelayPayloadStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: P2pRelayPayloadStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `p2p-relay-payload-${process.pid}-${Date.now()}.json`);
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

export function decodeRelayPayload(input: {
  payload_base64: string;
  payload_sha256?: string | null;
}): { bytes: Buffer; sha256: string } {
  const bytes = Buffer.from(input.payload_base64, "base64");
  if (bytes.length === 0) {
    throw new Error("relay_payload_empty");
  }
  if (bytes.length > relayPayloadMaxBytes()) {
    throw new Error("relay_payload_too_large");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (input.payload_sha256?.trim() && input.payload_sha256.trim().toLowerCase() !== sha256) {
    throw new Error("relay_payload_sha256_mismatch");
  }
  return { bytes, sha256 };
}

export function createRelayPayload(input: {
  owner_key: string;
  session_id: string;
  lease_id: string;
  source_node_id: string;
  target_node_id: string;
  relay_url: string;
  tunnel_id: string;
  payload_kind: string;
  payload_base64: string;
  payload_sha256?: string | null;
  candidate_route_kinds?: RelayRouteKind[] | null;
  attempted_route_kinds?: RelayRouteKind[] | null;
}): StoredP2pRelayPayload {
  const decoded = decodeRelayPayload(input);
  const now = new Date();
  const payload: StoredP2pRelayPayload = {
    payload_id: `relay-payload-${Date.now()}-${randomUUID()}`,
    owner_key: input.owner_key,
    session_id: input.session_id,
    lease_id: input.lease_id,
    source_node_id: input.source_node_id,
    target_node_id: input.target_node_id,
    relay_url: input.relay_url,
    tunnel_id: input.tunnel_id,
    payload_kind: input.payload_kind,
    payload_bytes: decoded.bytes.length,
    payload_sha256: decoded.sha256,
    payload_base64: input.payload_base64,
    status: "queued",
    relay_default_data_path: false,
    release_grade: false,
    transport_kind: "http_store_forward_preview",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + relayPayloadTtlSeconds() * 1000).toISOString(),
  };
  const candidateRouteKinds = normalizedRouteKinds(input.candidate_route_kinds);
  if (candidateRouteKinds.length > 0) {
    payload.candidate_route_kinds = candidateRouteKinds;
  }
  const attemptedRouteKinds = normalizedRouteKinds(input.attempted_route_kinds);
  if (attemptedRouteKinds.length > 0) {
    payload.attempted_route_kinds = attemptedRouteKinds;
  }
  return payload;
}

export async function appendRelayPayload(payload: StoredP2pRelayPayload): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    await kvEvalJson<{ ok: true }>(KV_APPEND_PAYLOAD_SCRIPT, [
      JSON.stringify(payload),
      String(maxPayloads()),
    ]);
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    fileSet({
      schema: "musu.p2p_relay_payload_store.v1",
      payloads: [payload, ...state.payloads.filter(payloadFresh)].slice(0, maxPayloads()),
    });
  });
}

export async function queryRelayPayloads(
  query: P2pRelayPayloadQuery = {}
): Promise<StoredP2pRelayPayload[]> {
  assertStoreConfigured();
  const payloads = shouldUseKv()
    ? await kvGetPayloads()
    : fileGet().payloads;
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));

  return payloads
    .filter(payloadFresh)
    .filter((payload) => matchesPayloadQuery(payload, query))
    .slice(0, limit);
}

function matchesPayloadQuery(payload: StoredP2pRelayPayload, query: P2pRelayPayloadQuery): boolean {
  if (query.owner_key && payload.owner_key !== query.owner_key) {
    return false;
  }
  if (query.session_id && payload.session_id !== query.session_id) {
    return false;
  }
  if (query.lease_id && payload.lease_id !== query.lease_id) {
    return false;
  }
  if (query.source_node_id && payload.source_node_id !== query.source_node_id) {
    return false;
  }
  if (query.target_node_id && payload.target_node_id !== query.target_node_id) {
    return false;
  }
  if (query.tunnel_id && payload.tunnel_id !== query.tunnel_id) {
    return false;
  }
  if (query.status && payload.status !== query.status) {
    return false;
  }
  return true;
}

export async function claimRelayPayloads(
  input: P2pRelayPayloadClaimInput
): Promise<StoredP2pRelayPayload[]> {
  assertStoreConfigured();

  const limit = Math.max(1, Math.min(input.limit ?? 1, 20));
  const now = new Date().toISOString();
  const claimant = input.claimant_node_id?.trim() || input.target_node_id;

  if (shouldUseKv()) {
    const claimed = await kvEvalJson<unknown[]>(KV_CLAIM_PAYLOADS_SCRIPT, [
      String(maxPayloads()),
      now,
      input.owner_key,
      input.target_node_id,
      input.session_id ?? "",
      input.lease_id ?? "",
      input.source_node_id ?? "",
      input.tunnel_id ?? "",
      String(limit),
      claimant,
    ]);
    // Re-validate Lua-returned payloads with the same guard the file path uses,
    // so KV/script corruption cannot leak malformed payloads to callers.
    return (Array.isArray(claimed) ? claimed : [])
      .map(coerceStoredRelayPayload)
      .filter((p): p is StoredP2pRelayPayload => p !== null);
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const next = claimPayloadsFromList(state.payloads, input, limit, now, claimant);

    fileSet({
      schema: "musu.p2p_relay_payload_store.v1",
      payloads: next.payloads,
    });

    return next.claimed;
  });
}

function claimPayloadsFromList(
  payloads: StoredP2pRelayPayload[],
  input: P2pRelayPayloadClaimInput,
  limit: number,
  now: string,
  claimant: string
): { payloads: StoredP2pRelayPayload[]; claimed: StoredP2pRelayPayload[] } {
  const fresh = payloads.filter(payloadFresh);
  const claimedIds = new Set<string>();
  const claimed: StoredP2pRelayPayload[] = [];

  for (const payload of fresh) {
    if (claimed.length >= limit) {
      break;
    }
    if (
      payload.status === "queued" &&
      matchesPayloadQuery(payload, {
        ...input,
        status: "queued",
      })
    ) {
      const nextPayload = {
        ...payload,
        status: "claimed" as const,
        claimed_by: claimant,
        claimed_at: now,
      };
      claimedIds.add(payload.payload_id);
      claimed.push(nextPayload);
    }
  }

  return {
    claimed,
    payloads: fresh
      .map((payload) =>
        claimedIds.has(payload.payload_id)
          ? claimed.find((item) => item.payload_id === payload.payload_id) ?? payload
          : payload
      )
      .slice(0, maxPayloads()),
  };
}

export async function markRelayPayloadDelivered(
  input: P2pRelayPayloadDeliveryInput
): Promise<StoredP2pRelayPayload | null> {
  assertStoreConfigured();

  const deliveredAt = new Date().toISOString();

  if (shouldUseKv()) {
    const result = await kvEvalJson<
      | { status: "delivered"; payload: StoredP2pRelayPayload }
      | { status: "not_found" }
      | { status: "requires_claim" }
    >(KV_DELIVER_PAYLOAD_SCRIPT, [
      String(maxPayloads()),
      deliveredAt,
      input.owner_key,
      input.payload_id,
      input.target_node_id,
    ]);
    if (result.status === "requires_claim") {
      throw new Error("relay_payload_delivery_requires_claim");
    }
    if (result.status !== "delivered") {
      return null;
    }
    // Re-validate the Lua-returned payload; corrupt data must not pass silently.
    const delivered = coerceStoredRelayPayload(result.payload);
    if (delivered === null) {
      throw new Error("relay_payload_delivery_malformed");
    }
    return delivered;
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const next = deliverPayloadFromList(state.payloads, input, deliveredAt);

    fileSet({
      schema: "musu.p2p_relay_payload_store.v1",
      payloads: next.payloads,
    });

    return next.delivered;
  });
}

export function relayPayloadDeliveryProofFromDeliveredPayload(
  payload: StoredP2pRelayPayload
): RelayPayloadDeliveryProof | null {
  if (payload.status !== "delivered") {
    return null;
  }
  const deliveredAt = payload.delivered_at?.trim();
  if (!deliveredAt) {
    return null;
  }
  return {
    schema: "musu.relay_payload_delivery_proof.v1",
    payload_id: payload.payload_id,
    session_id: payload.session_id,
    lease_id: payload.lease_id,
    source_node_id: payload.source_node_id,
    target_node_id: payload.target_node_id,
    relay_url: payload.relay_url,
    tunnel_id: payload.tunnel_id,
    transport_kind: payload.transport_kind,
    relay_default_data_path: payload.relay_default_data_path,
    release_grade: payload.release_grade,
    payload_sha256: payload.payload_sha256,
    payload_bytes: payload.payload_bytes,
    delivered_at: deliveredAt,
  };
}

function deliverPayloadFromList(
  payloads: StoredP2pRelayPayload[],
  input: P2pRelayPayloadDeliveryInput,
  deliveredAt: string
): { payloads: StoredP2pRelayPayload[]; delivered: StoredP2pRelayPayload | null } {
  let delivered: StoredP2pRelayPayload | null = null;
  const nextPayloads = payloads.filter(payloadFresh).map((payload) => {
    if (
      payload.payload_id !== input.payload_id ||
      payload.owner_key !== input.owner_key ||
      payload.target_node_id !== input.target_node_id
    ) {
      return payload;
    }
    if (payload.status !== "claimed") {
      throw new Error("relay_payload_delivery_requires_claim");
    }
    delivered = {
      ...payload,
      status: "delivered" as const,
      delivered_at: deliveredAt,
    };
    return delivered;
  });

  return {
    payloads: nextPayloads.slice(0, maxPayloads()),
    delivered,
  };
}
