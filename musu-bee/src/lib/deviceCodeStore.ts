import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
} from "@/lib/p2pKvEnv";
import {
  type KvScriptClient,
  kvClient,
  kvEvalJson,
  setKvScriptClientForTest,
} from "@/lib/kvScript";

/**
 * KV client shape used by this store: the shared atomic-eval seam plus a `get`
 * for the non-atomic record/pointer reads. Both the real `@vercel/kv` client and
 * the injected test client expose `get`, so routing reads through kvClient()
 * keeps them honoring the same test seam as the eval path.
 */
type DeviceCodeKvClient = KvScriptClient & {
  get?: <T = unknown>(key: string) => Promise<T | null>;
};

async function kvGet<T>(key: string): Promise<T | null> {
  const client = await kvClient<DeviceCodeKvClient>();
  if (typeof client.get !== "function") {
    throw new Error("device_code_kv_get_unavailable");
  }
  return client.get<T>(key);
}

/**
 * Device-authorization-flow store for `musu login`.
 *
 * Mirrors roomWorkOrderStore.ts EXACTLY: KV via kvScript.ts kvEvalJson + atomic
 * Lua transitions, with a file fallback guarded by withLocalLock() for local /
 * non-serverless development. Storage shape is a single JSON-encoded record per
 * key (no arrays) plus a by-user_code pointer key so the operator-facing /link
 * page can resolve the short user code to the device record.
 *
 * SECURITY MODEL (read before changing):
 *  - The token returned on consume is the SHARED p2p control token
 *    (configuredP2pControlToken()). Every approved device therefore shares ONE
 *    owner_key derived from that token. This flow does NOT give per-device
 *    isolation: it is a single-owner control plane. The single-owner property is
 *    *enforced* (not hoped) by the MUSU_DEVICE_APPROVER_USER_IDS allowlist
 *    checked in the approve route — only an allowlisted Supabase user may
 *    approve, and approval is fail-closed when the allowlist env is unset.
 *  - The brute-force counter (attempt_count) lives on THIS record in the SAME KV
 *    store and is incremented ATOMICALLY inside the APPROVE Lua transition, so it
 *    is global and instance-independent on serverless (H-1). Do NOT move it to an
 *    in-memory Map (e.g. chatRateLimit.ts) — that is broken across instances.
 */

export const DEVICE_CODE_STATUSES = ["pending", "approved", "consumed"] as const;
export type DeviceCodeStatus = (typeof DEVICE_CODE_STATUSES)[number];

export type StoredDeviceCode = {
  schema: "musu.device_code.v1";
  device_code: string;
  user_code: string;
  node_name: string;
  status: DeviceCodeStatus;
  approved_owner: string | null;
  attempt_count: number;
  created_at: string;
  expires_at: string;
};

const KV_DEVICE_CODE_PREFIX = "musu:auth:device-code:v1:";
const KV_USER_CODE_POINTER_PREFIX = "musu:auth:device-user-code:v1:";
const DEFAULT_TTL_SECONDS = 900;
const MAX_FAILED_APPROVE_ATTEMPTS = 5;
const MAX_NODE_NAME_CHARS = 64;
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0 O 1 I L
const USER_CODE_GROUP_LEN = 4;

let localLockQueue: Promise<void> = Promise.resolve();

export function __setDeviceCodeKvClientForTest(client: KvScriptClient | null): void {
  setKvScriptClientForTest(client);
}

// Atomic Lua scripts mirroring roomWorkOrderStore: Redis runs each EVAL
// single-threaded so concurrent approve/consume requests serialize and cannot
// lose updates, double-consume, or skip an attempt increment. ISO-8601 UTC `Z`
// timestamps are fixed-width and compare correctly as strings (same `now <=
// expires_at` freshness check the JS path uses).

// CREATE: write the record + its by-user_code pointer with EX expiry. Pointer
// value is the device_code so /link can resolve user_code -> record.
const KV_CREATE_DEVICE_CODE_SCRIPT = `
-- musu_device_code_create_v1
local record_key = KEYS[1]
local pointer_key = KEYS[2]
local ex_seconds = tonumber(ARGV[1])
local record_json = ARGV[2]
local device_code = ARGV[3]
redis.call("SET", record_key, record_json, "EX", ex_seconds)
redis.call("SET", pointer_key, device_code, "EX", ex_seconds)
return cjson.encode({ ok = true })
`;

// APPROVE: require pending + not expired. On the happy path set status=approved
// and approved_owner. On the UNHAPPY path (record present but not approvable:
// already approved/consumed, or owner mismatch is handled in the route, etc.)
// atomically INCREMENT attempt_count; once it reaches the cap, force status to
// "consumed" so the code is permanently dead (reject + expire). This is the H-1
// global brute-force counter — it lives on the record, not in process memory.
const KV_APPROVE_DEVICE_CODE_SCRIPT = `
-- musu_device_code_approve_v1
local record_key = KEYS[1]
local now = ARGV[1]
local ex_seconds = tonumber(ARGV[2])
local max_attempts = tonumber(ARGV[3])
local approved_owner = ARGV[4]

local raw = redis.call("GET", record_key)
if not raw then
  return cjson.encode({ status = "not_found" })
end
local ok, record = pcall(cjson.decode, raw)
if not ok or type(record) ~= "table" then
  return cjson.encode({ status = "not_found" })
end

if type(record.expires_at) ~= "string" or now > record.expires_at then
  return cjson.encode({ status = "expired" })
end

if record.status == "pending" then
  record.status = "approved"
  record.approved_owner = approved_owner
  redis.call("SET", record_key, cjson.encode(record), "EX", ex_seconds)
  return cjson.encode({ status = "approved", record = record })
end

-- Not pending: count this as a failed approve attempt (brute-force / replay).
local attempts = tonumber(record.attempt_count) or 0
attempts = attempts + 1
record.attempt_count = attempts
if attempts >= max_attempts then
  record.status = "consumed"
  record.approved_owner = nil
  redis.call("SET", record_key, cjson.encode(record), "EX", ex_seconds)
  return cjson.encode({ status = "locked", attempt_count = attempts })
end
redis.call("SET", record_key, cjson.encode(record), "EX", ex_seconds)
return cjson.encode({ status = "not_pending", attempt_count = attempts })
`;

// CONSUME: require approved + not expired, one-time. Flip to consumed and return
// the record so the route can issue the shared control token exactly once. A
// second consume sees status=consumed and returns not_deliverable.
const KV_CONSUME_DEVICE_CODE_SCRIPT = `
-- musu_device_code_consume_v1
local record_key = KEYS[1]
local now = ARGV[1]
local ex_seconds = tonumber(ARGV[2])

local raw = redis.call("GET", record_key)
if not raw then
  return cjson.encode({ status = "not_found" })
end
local ok, record = pcall(cjson.decode, raw)
if not ok or type(record) ~= "table" then
  return cjson.encode({ status = "not_found" })
end

if type(record.expires_at) ~= "string" or now > record.expires_at then
  return cjson.encode({ status = "expired" })
end

if record.status == "pending" then
  return cjson.encode({ status = "pending" })
end
if record.status ~= "approved" then
  return cjson.encode({ status = "not_deliverable" })
end

record.status = "consumed"
redis.call("SET", record_key, cjson.encode(record), "EX", ex_seconds)
return cjson.encode({ status = "consumed", record = record })
`;

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_DEVICE_CODE_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("device_code_kv_not_configured");
  }
}

function storePath(): string {
  const override = process.env.MUSU_DEVICE_CODE_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "device-codes", "device-codes.json");
}

function recordKey(deviceCode: string): string {
  return `${KV_DEVICE_CODE_PREFIX}${encodeURIComponent(deviceCode)}`;
}

function pointerKey(userCode: string): string {
  return `${KV_USER_CODE_POINTER_PREFIX}${encodeURIComponent(userCode)}`;
}

export function deviceCodeTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_DEVICE_CODE_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 60), 24 * 60 * 60);
}

// KV expiry is generous relative to TTL so an expired-but-still-present record
// can return a clean 410 rather than vanishing into a 404.
function deviceCodeExpirySeconds(): number {
  return Math.max(deviceCodeTtlSeconds() * 4, 300);
}

function maxFailedApproveAttempts(): number {
  return MAX_FAILED_APPROVE_ATTEMPTS;
}

export function generateDeviceCode(): string {
  // 32 random bytes -> base64url, no padding. ~43 chars, never logged.
  return randomBytes(32).toString("base64url");
}

export function generateUserCode(): string {
  const pick = () => {
    const bytes = randomBytes(USER_CODE_GROUP_LEN);
    let out = "";
    for (let i = 0; i < USER_CODE_GROUP_LEN; i += 1) {
      out += USER_CODE_ALPHABET[bytes[i]! % USER_CODE_ALPHABET.length];
    }
    return out;
  };
  return `${pick()}-${pick()}`;
}

export function normalizeUserCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== USER_CODE_GROUP_LEN * 2) {
    return null;
  }
  for (const ch of compact) {
    if (!USER_CODE_ALPHABET.includes(ch)) {
      return null;
    }
  }
  return `${compact.slice(0, USER_CODE_GROUP_LEN)}-${compact.slice(USER_CODE_GROUP_LEN)}`;
}

export function normalizeNodeName(value: unknown): string {
  if (typeof value !== "string") {
    return "device";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "device";
  }
  return Array.from(trimmed).slice(0, MAX_NODE_NAME_CHARS).join("");
}

function isDeviceCodeStatus(value: unknown): value is DeviceCodeStatus {
  return DEVICE_CODE_STATUSES.includes(value as DeviceCodeStatus);
}

export function isStoredDeviceCode(value: unknown): value is StoredDeviceCode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<StoredDeviceCode>;
  return (
    record.schema === "musu.device_code.v1" &&
    typeof record.device_code === "string" &&
    record.device_code.length > 0 &&
    typeof record.user_code === "string" &&
    record.user_code.length > 0 &&
    typeof record.node_name === "string" &&
    isDeviceCodeStatus(record.status) &&
    (record.approved_owner === null || typeof record.approved_owner === "string") &&
    typeof record.attempt_count === "number" &&
    Number.isFinite(record.attempt_count) &&
    typeof record.created_at === "string" &&
    typeof record.expires_at === "string"
  );
}

function recordFresh(record: StoredDeviceCode): boolean {
  const millis = Date.parse(record.expires_at);
  return Number.isFinite(millis) && millis >= Date.now();
}

type DeviceCodeStoreState = {
  schema: "musu.device_code_store.v1";
  records_by_device_code: Record<string, StoredDeviceCode>;
  device_code_by_user_code: Record<string, string>;
};

function emptyState(): DeviceCodeStoreState {
  return {
    schema: "musu.device_code_store.v1",
    records_by_device_code: {},
    device_code_by_user_code: {},
  };
}

function normalizeState(value: unknown): DeviceCodeStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const input = value as Partial<DeviceCodeStoreState>;
  const records: Record<string, StoredDeviceCode> = {};
  const pointers: Record<string, string> = {};
  for (const [deviceCode, record] of Object.entries(input.records_by_device_code ?? {})) {
    if (isStoredDeviceCode(record) && recordFresh(record)) {
      records[deviceCode] = record;
      pointers[record.user_code] = record.device_code;
    }
  }
  return {
    schema: "musu.device_code_store.v1",
    records_by_device_code: records,
    device_code_by_user_code: pointers,
  };
}

function fileGet(): DeviceCodeStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: DeviceCodeStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `device-codes-${process.pid}-${Date.now()}.json`);
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

export function publicDeviceCode(record: StoredDeviceCode): Omit<StoredDeviceCode, "device_code"> {
  // Never expose the raw device_code (the poll secret) beyond the client that
  // created it. The /link page only needs the display fields.
  const { device_code: _deviceCode, ...rest } = record;
  return rest;
}

export function createDeviceCodeRecord(input: { node_name?: unknown }): StoredDeviceCode {
  const ttl = deviceCodeTtlSeconds();
  const now = new Date();
  return {
    schema: "musu.device_code.v1",
    device_code: generateDeviceCode(),
    user_code: generateUserCode(),
    node_name: normalizeNodeName(input.node_name),
    status: "pending",
    approved_owner: null,
    attempt_count: 0,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

export async function saveDeviceCode(record: StoredDeviceCode): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    await kvEvalJson<{ ok: true }>(
      KV_CREATE_DEVICE_CODE_SCRIPT,
      [recordKey(record.device_code), pointerKey(record.user_code)],
      [String(deviceCodeExpirySeconds()), JSON.stringify(record), record.device_code]
    );
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    state.records_by_device_code[record.device_code] = record;
    state.device_code_by_user_code[record.user_code] = record.device_code;
    fileSet(state);
  });
}

export async function getDeviceCodeByDeviceCode(
  deviceCode: string
): Promise<StoredDeviceCode | null> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const raw = await kvGet<unknown>(recordKey(deviceCode));
    return isStoredDeviceCode(raw) && recordFresh(raw) ? raw : null;
  }
  const record = fileGet().records_by_device_code[deviceCode];
  return record && isStoredDeviceCode(record) && recordFresh(record) ? record : null;
}

export async function getDeviceCodeByUserCode(
  userCode: string
): Promise<StoredDeviceCode | null> {
  assertStoreConfigured();
  const normalized = normalizeUserCode(userCode);
  if (!normalized) {
    return null;
  }
  if (shouldUseKv()) {
    const deviceCode = await kvGet<string>(pointerKey(normalized));
    if (typeof deviceCode !== "string" || !deviceCode) {
      return null;
    }
    return getDeviceCodeByDeviceCode(deviceCode);
  }
  const state = fileGet();
  const deviceCode = state.device_code_by_user_code[normalized];
  if (!deviceCode) {
    return null;
  }
  const record = state.records_by_device_code[deviceCode];
  return record && isStoredDeviceCode(record) && recordFresh(record) ? record : null;
}

export type ApproveDeviceCodeResult =
  | { status: "approved"; record: StoredDeviceCode }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "not_pending"; attempt_count: number }
  | { status: "locked"; attempt_count: number };

/**
 * Atomically approve a device code by user_code. Requires pending + not-expired.
 * Any non-pending hit increments attempt_count; the 5th failed attempt locks the
 * record (H-1). `approvedOwner` MUST be the server-derived shared owner_key — the
 * caller proves the human's identity via Supabase getUser() before calling.
 */
export async function approveDeviceCode(
  userCode: string,
  approvedOwner: string
): Promise<ApproveDeviceCodeResult> {
  assertStoreConfigured();
  const normalized = normalizeUserCode(userCode);
  if (!normalized) {
    return { status: "not_found" };
  }
  const now = new Date().toISOString();

  if (shouldUseKv()) {
    const deviceCode = await kvGet<string>(pointerKey(normalized));
    if (typeof deviceCode !== "string" || !deviceCode) {
      return { status: "not_found" };
    }
    const result = await kvEvalJson<
      | { status: "approved"; record: StoredDeviceCode }
      | { status: "not_found" }
      | { status: "expired" }
      | { status: "not_pending"; attempt_count: number }
      | { status: "locked"; attempt_count: number }
    >(
      KV_APPROVE_DEVICE_CODE_SCRIPT,
      [recordKey(deviceCode)],
      [now, String(deviceCodeExpirySeconds()), String(maxFailedApproveAttempts()), approvedOwner]
    );
    if (result.status === "approved") {
      // Re-validate Lua-returned record; corrupt KV data must not pass silently.
      if (!isStoredDeviceCode(result.record)) {
        throw new Error("device_code_approve_malformed");
      }
      return { status: "approved", record: result.record };
    }
    return result;
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const deviceCode = state.device_code_by_user_code[normalized];
    if (!deviceCode) {
      return { status: "not_found" } as const;
    }
    const record = state.records_by_device_code[deviceCode];
    if (!record || !isStoredDeviceCode(record)) {
      return { status: "not_found" } as const;
    }
    if (!recordFresh(record)) {
      return { status: "expired" } as const;
    }
    if (record.status === "pending") {
      const approved: StoredDeviceCode = {
        ...record,
        status: "approved",
        approved_owner: approvedOwner,
      };
      state.records_by_device_code[deviceCode] = approved;
      fileSet(state);
      return { status: "approved", record: approved } as const;
    }
    const attempts = record.attempt_count + 1;
    if (attempts >= maxFailedApproveAttempts()) {
      state.records_by_device_code[deviceCode] = {
        ...record,
        attempt_count: attempts,
        status: "consumed",
        approved_owner: null,
      };
      fileSet(state);
      return { status: "locked", attempt_count: attempts } as const;
    }
    state.records_by_device_code[deviceCode] = { ...record, attempt_count: attempts };
    fileSet(state);
    return { status: "not_pending", attempt_count: attempts } as const;
  });
}

export type ConsumeDeviceCodeResult =
  | { status: "consumed"; record: StoredDeviceCode }
  | { status: "pending" }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "not_deliverable" };

/**
 * Atomically consume an approved device code exactly once. Returns the record on
 * success so the route can issue the shared control token. A second consume of
 * the same code returns not_deliverable (one-time use).
 */
export async function consumeDeviceCode(deviceCode: string): Promise<ConsumeDeviceCodeResult> {
  assertStoreConfigured();
  const now = new Date().toISOString();

  if (shouldUseKv()) {
    const result = await kvEvalJson<
      | { status: "consumed"; record: StoredDeviceCode }
      | { status: "pending" }
      | { status: "not_found" }
      | { status: "expired" }
      | { status: "not_deliverable" }
    >(
      KV_CONSUME_DEVICE_CODE_SCRIPT,
      [recordKey(deviceCode)],
      [now, String(deviceCodeExpirySeconds())]
    );
    if (result.status === "consumed") {
      if (!isStoredDeviceCode(result.record)) {
        throw new Error("device_code_consume_malformed");
      }
      return { status: "consumed", record: result.record };
    }
    return result;
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const record = state.records_by_device_code[deviceCode];
    if (!record || !isStoredDeviceCode(record)) {
      return { status: "not_found" } as const;
    }
    if (!recordFresh(record)) {
      return { status: "expired" } as const;
    }
    if (record.status === "pending") {
      return { status: "pending" } as const;
    }
    if (record.status !== "approved") {
      return { status: "not_deliverable" } as const;
    }
    const consumed: StoredDeviceCode = { ...record, status: "consumed" };
    state.records_by_device_code[deviceCode] = consumed;
    fileSet(state);
    return { status: "consumed", record: consumed } as const;
  });
}
