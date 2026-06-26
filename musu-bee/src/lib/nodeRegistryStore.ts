import { createHash } from "node:crypto";
import fs from "node:fs";
import { isIP } from "node:net";
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
 * Owner-scoped cloud node registry for musu.pro.
 *
 * After `musu login` (device flow) succeeds, the Rust client auto-calls
 * register_node() -> POST /api/v1/nodes/register with the shared p2p control
 * token as bearer. This store persists the node under the authenticated
 * owner_key so list_nodes() -> GET /api/v1/nodes returns only that owner's
 * nodes. This is the CLOUD registry, distinct from the local-bridge
 * /api/nodes proxy.
 *
 * Mirrors roomWorkOrderStore.ts EXACTLY: KV via kvScript.ts kvEvalJson + atomic
 * Lua, with a file fallback guarded by withLocalLock() for local /
 * non-serverless development. Storage shape is one JSON-encoded array of node
 * records per owner_key (so listing is a single read and upsert is a single
 * atomic EVAL).
 *
 * SECURITY MODEL (read before changing):
 *  - owner_key is ALWAYS the server-derived value from authorizeP2pControl /
 *    p2pControlOwnerKey (a sha256 of the bearer token). The route never trusts a
 *    client-supplied user_id/owner. user_id in the returned RegistryNode == the
 *    owner_key, so all nodes registered with the shared control token share one
 *    owner scope (single-owner control plane, matching device-flow design).
 *  - id is a deterministic short sha256(owner_key + "\n" + node_name) so
 *    re-registering the same node_name upserts the same row (no duplicates).
 *  - Lua-returned rows are re-validated with isStoredNode before reaching
 *    callers, so KV/script corruption cannot leak malformed rows (H6 lesson).
 */

export type StoredNode = {
  schema: "musu.registry_node.v1";
  id: string;
  owner_key: string;
  node_name: string;
  public_url: string;
  cert_fingerprint: string | null;
  machine_group: string | null;
  mac_address: string | null;
  broadcast_ip: string | null;
  meta: unknown;
  last_seen: string;
  created_at: string;
  expires_at: string;
};

/**
 * Public wire shape returned to the Rust client. Matches RegistryNode in
 * musu-rs/src/cloud/mod.rs:118-129 exactly: id, user_id, node_name, public_url,
 * cert_fingerprint?, last_seen, meta?. owner_key is the internal scoping key and
 * is exposed only as user_id.
 */
export type RegistryNode = {
  id: string;
  user_id: string;
  node_name: string;
  public_url: string;
  cert_fingerprint: string | null;
  last_seen: string;
  meta: unknown;
};

type NodeRegistryKvClient = KvScriptClient & {
  get?: <T = unknown>(key: string) => Promise<T | null>;
};

const KV_NODE_REGISTRY_PREFIX = "musu:node-registry:v1:";
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, refreshed on each register
const DEFAULT_HEARTBEAT_TTL_SECONDS = 15 * 60; // current-presence window
const DEFAULT_MAX_NODES_PER_OWNER = 1000;
const MAX_NODE_NAME_CHARS = 128;
const MAX_URL_CHARS = 512;
const MAX_FIELD_CHARS = 256;
const MAX_META_JSON_CHARS = 4096;
const MAX_META_DEPTH = 4;
const MAX_META_ARRAY_ITEMS = 32;
const MAX_META_OBJECT_KEYS = 48;

let localLockQueue: Promise<void> = Promise.resolve();

export function __setNodeRegistryKvClientForTest(client: KvScriptClient | null): void {
  setKvScriptClientForTest(client);
}

async function kvGet<T>(key: string): Promise<T | null> {
  const client = await kvClient<NodeRegistryKvClient>();
  if (typeof client.get !== "function") {
    throw new Error("node_registry_kv_get_unavailable");
  }
  return client.get<T>(key);
}

// Atomic Lua mirroring roomWorkOrderStore: Redis runs each EVAL single-threaded,
// so concurrent registers for the same owner serialize and cannot lose updates
// or duplicate a node_name. Storage is one JSON-encoded array per owner under
// ownerKey() with an EX expiry. Retention uses the same `now <= expires_at`
// string comparison as nodeFresh(); ISO-8601 UTC `Z` timestamps are fixed-width
// and compare correctly as strings. Current presence is stricter: listNodes()
// also gates on last_seen via nodeHeartbeatFresh().
//
// UPSERT: drop any existing row with the same node_name, prepend the new row,
// keep only still-fresh rows up to max_records, and refresh the key TTL.
//
// created_at preservation is done HERE, under the EVAL lock, not by an
// out-of-lock pre-read: when the current array already holds a row with the
// same node_name, copy ITS created_at onto the incoming node before insert.
// This is atomic — a concurrent re-register cannot clobber a newer created_at
// with a stale one read outside the lock. Each EVAL runs single-threaded, so
// the last writer always sees the canonical existing created_at and carries it
// forward unchanged.
const KV_UPSERT_NODE_SCRIPT = `
-- musu_node_registry_upsert_v1
local key = KEYS[1]
local now = ARGV[1]
local max_records = tonumber(ARGV[2])
local ex_seconds = tonumber(ARGV[3])
local node_json = ARGV[4]
local node = cjson.decode(node_json)

local raw = redis.call("GET", key)
local current = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == "table" then
    current = decoded
  end
end

-- Atomically preserve the existing row's created_at for this node_name. The
-- incoming node's created_at (built by buildStoredNode) is treated as the
-- default for a brand-new node only.
for _, item in ipairs(current) do
  if type(item) == "table"
    and item.node_name == node.node_name
    and type(item.created_at) == "string"
    and #item.created_at > 0 then
    node.created_at = item.created_at
    break
  end
end

local next_nodes = {}
table.insert(next_nodes, node)
for _, item in ipairs(current) do
  if type(item) == "table"
    and type(item.expires_at) == "string"
    and now <= item.expires_at
    and item.node_name ~= node.node_name then
    if #next_nodes < max_records then
      table.insert(next_nodes, item)
    end
  end
end

redis.call("SET", key, cjson.encode(next_nodes), "EX", ex_seconds)
-- Return the canonical stored node (with its preserved created_at) so the
-- caller reports exactly what was persisted, not its pre-EVAL guess.
return cjson.encode({ ok = true, node = node })
`;

const KV_DELETE_NODE_SCRIPT = `
-- musu_node_registry_delete_v1
local key = KEYS[1]
local node_name = ARGV[1]

local raw = redis.call("GET", key)
if not raw then
  return cjson.encode({ ok = true, deleted = false })
end

local current = {}
local ok, decoded = pcall(cjson.decode, raw)
if ok and type(decoded) == "table" then
  current = decoded
end

local next_nodes = {}
local deleted = false
for _, item in ipairs(current) do
  if type(item) == "table" and item.node_name == node_name then
    deleted = true
  else
    table.insert(next_nodes, item)
  end
end

if #next_nodes == 0 then
  redis.call("DEL", key)
else
  local ttl = redis.call("TTL", key)
  if ttl and ttl > 0 then
    redis.call("SET", key, cjson.encode(next_nodes), "EX", ttl)
  else
    redis.call("SET", key, cjson.encode(next_nodes))
  end
end

return cjson.encode({ ok = true, deleted = deleted })
`;

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_NODE_REGISTRY_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("node_registry_kv_not_configured");
  }
}

function storePath(): string {
  const override = process.env.MUSU_NODE_REGISTRY_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "node-registry", "nodes.json");
}

function ownerKey(owner: string): string {
  return `${KV_NODE_REGISTRY_PREFIX}${encodeURIComponent(owner)}`;
}

export function nodeRegistryTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_NODE_REGISTRY_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  // Floor 60s, ceil 30 days.
  return Math.min(Math.max(parsed, 60), 30 * 24 * 60 * 60);
}

export function nodeRegistryHeartbeatTtlSeconds(): number {
  const parsed = Number.parseInt(
    process.env.MUSU_NODE_REGISTRY_HEARTBEAT_TTL_SEC ?? "",
    10
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HEARTBEAT_TTL_SECONDS;
  }
  // Floor 60s, ceil 24h. This is presence freshness, not storage retention.
  return Math.min(Math.max(parsed, 60), 24 * 60 * 60);
}

function maxNodesPerOwner(): number {
  const parsed = Number.parseInt(process.env.MUSU_NODE_REGISTRY_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_NODES_PER_OWNER;
  }
  return Math.min(parsed, 10_000);
}

export function nodeRegistryId(owner: string, nodeName: string): string {
  // Deterministic short id so re-register upserts the same row. Includes a
  // newline separator so (owner, name) pairs cannot collide via concatenation.
  return createHash("sha256").update(`${owner}\n${nodeName}`).digest("hex").slice(0, 32);
}

export function normalizeNodeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, MAX_NODE_NAME_CHARS).join("");
}

export function normalizePublicUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, MAX_URL_CHARS).join("");
}

export function registryPublicUrlIssue(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "public_url must be a valid URL";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "public_url must use http:// or https://";
  }
  if (url.port === "0") {
    return "public_url port must not be 0";
  }
  if (!isUsableRemoteHost(url.hostname)) {
    return "public_url host must be reachable by other PCs, not loopback/wildcard";
  }
  return null;
}

function isUsableRemoteHost(host: string): boolean {
  const normalized = host.trim().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  if (!normalized || normalized.toLowerCase() === "localhost") {
    return false;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = normalized.split(".").map((part) => Number.parseInt(part, 10));
    return octets.length === 4 && octets[0] !== 0 && octets[0] !== 127;
  }
  if (ipVersion === 6) {
    const lower = normalized.toLowerCase();
    return (
      lower !== "::" &&
      lower !== "::1" &&
      lower !== "0:0:0:0:0:0:0:0" &&
      lower !== "0:0:0:0:0:0:0:1"
    );
  }

  return true;
}

function normalizeOptionalField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Array.from(trimmed).slice(0, MAX_FIELD_CHARS).join("");
}

function normalizeMetaValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return Array.from(value).slice(0, 512).join("");
  }
  if (depth >= MAX_META_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_META_ARRAY_ITEMS)
      .map((item) => normalizeMetaValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_META_OBJECT_KEYS)) {
      const normalizedKey = normalizeOptionalField(key);
      if (normalizedKey) {
        output[normalizedKey] = normalizeMetaValue(item, depth + 1);
      }
    }
    return output;
  }
  return null;
}

function normalizeMeta(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = normalizeMetaValue(value);
  const serialized = JSON.stringify(normalized);
  if (!serialized || serialized.length <= MAX_META_JSON_CHARS) {
    return normalized;
  }
  return {
    truncated: true,
    original_json_chars: serialized.length,
    preview: serialized.slice(0, MAX_META_JSON_CHARS),
  };
}

export function isStoredNode(value: unknown): value is StoredNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const node = value as Partial<StoredNode>;
  return (
    node.schema === "musu.registry_node.v1" &&
    typeof node.id === "string" &&
    node.id.length > 0 &&
    typeof node.owner_key === "string" &&
    node.owner_key.length > 0 &&
    typeof node.node_name === "string" &&
    node.node_name.length > 0 &&
    typeof node.public_url === "string" &&
    node.public_url.length > 0 &&
    (node.cert_fingerprint === null || typeof node.cert_fingerprint === "string") &&
    (node.machine_group === null || typeof node.machine_group === "string") &&
    (node.mac_address === null || typeof node.mac_address === "string") &&
    (node.broadcast_ip === null || typeof node.broadcast_ip === "string") &&
    "meta" in node &&
    typeof node.last_seen === "string" &&
    typeof node.created_at === "string" &&
    typeof node.expires_at === "string"
  );
}

function nodeFresh(node: StoredNode): boolean {
  const millis = Date.parse(node.expires_at);
  return Number.isFinite(millis) && millis >= Date.now();
}

function nodeHeartbeatFresh(node: StoredNode): boolean {
  const millis = Date.parse(node.last_seen);
  if (!Number.isFinite(millis)) {
    return false;
  }
  const now = Date.now();
  const maxFutureSkewMs = 60_000;
  return (
    millis <= now + maxFutureSkewMs &&
    now - millis <= nodeRegistryHeartbeatTtlSeconds() * 1000
  );
}

function nodeHasUsablePublicUrl(node: StoredNode): boolean {
  return registryPublicUrlIssue(node.public_url) === null;
}

export function publicRegistryNode(node: StoredNode): RegistryNode {
  // user_id == owner_key: the shared single-owner scope. Never expose the raw
  // owner_key under any other field, and never echo a client-supplied owner.
  return {
    id: node.id,
    user_id: node.owner_key,
    node_name: node.node_name,
    public_url: node.public_url,
    cert_fingerprint: node.cert_fingerprint,
    last_seen: node.last_seen,
    meta: node.meta,
  };
}

type NodeRegistryStoreState = {
  schema: "musu.node_registry_store.v1";
  nodes_by_owner: Record<string, StoredNode[]>;
};

function emptyState(): NodeRegistryStoreState {
  return {
    schema: "musu.node_registry_store.v1",
    nodes_by_owner: {},
  };
}

function normalizeState(value: unknown): NodeRegistryStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const input = value as Partial<NodeRegistryStoreState>;
  const byOwner: Record<string, StoredNode[]> = {};
  for (const [owner, nodes] of Object.entries(input.nodes_by_owner ?? {})) {
    if (!Array.isArray(nodes)) {
      continue;
    }
    byOwner[owner] = nodes.filter(isStoredNode).slice(0, maxNodesPerOwner());
  }
  return {
    schema: "musu.node_registry_store.v1",
    nodes_by_owner: byOwner,
  };
}

function fileGet(): NodeRegistryStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: NodeRegistryStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `node-registry-${process.pid}-${Date.now()}.json`);
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

export type RegisterNodeInput = {
  owner_key: string;
  node_name: unknown;
  public_url: unknown;
  cert_fingerprint?: unknown;
  machine_group?: unknown;
  mac_address?: unknown;
  broadcast_ip?: unknown;
  meta?: unknown;
};

/**
 * Build a StoredNode from server-derived owner_key + validated body. Throws
 * node_name_required / public_url_required if those are missing or blank.
 * For an existing node_name the row keeps a stable id and created_at via the
 * upsert path; last_seen is refreshed to now on every call.
 */
export function buildStoredNode(input: RegisterNodeInput, existing?: StoredNode | null): StoredNode {
  const nodeName = normalizeNodeName(input.node_name);
  if (!nodeName) {
    throw new Error("node_name_required");
  }
  const publicUrl = normalizePublicUrl(input.public_url);
  if (!publicUrl) {
    throw new Error("public_url_required");
  }
  const publicUrlIssue = registryPublicUrlIssue(publicUrl);
  if (publicUrlIssue) {
    throw new Error(`public_url_invalid: ${publicUrlIssue}`);
  }
  const ttl = nodeRegistryTtlSeconds();
  const now = new Date();
  const nowIso = now.toISOString();
  return {
    schema: "musu.registry_node.v1",
    id: nodeRegistryId(input.owner_key, nodeName),
    owner_key: input.owner_key,
    node_name: nodeName,
    public_url: publicUrl,
    cert_fingerprint: normalizeOptionalField(input.cert_fingerprint),
    machine_group: normalizeOptionalField(input.machine_group),
    mac_address: normalizeOptionalField(input.mac_address),
    broadcast_ip: normalizeOptionalField(input.broadcast_ip),
    meta: normalizeMeta(input.meta),
    last_seen: nowIso,
    created_at: existing && isStoredNode(existing) ? existing.created_at : nowIso,
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

/**
 * Atomically upsert a node into the owner's registry, refreshing the owner key
 * TTL. Returns the stored row. Re-registering the same (owner_key, node_name)
 * updates the same id in place (no duplicate).
 */
export async function registerNode(input: RegisterNodeInput): Promise<StoredNode> {
  assertStoreConfigured();

  if (shouldUseKv()) {
    // created_at preservation now happens INSIDE the Lua upsert (under the EVAL
    // lock), so no out-of-lock pre-read is needed: buildStoredNode supplies a
    // default created_at for a brand-new node, and the script overwrites it with
    // the existing row's created_at when a same-named row is present. The script
    // returns the canonical stored node so we report exactly what was persisted.
    const node = buildStoredNode(input, null);
    const result = await kvEvalJson<{ ok: true; node?: unknown }>(
      KV_UPSERT_NODE_SCRIPT,
      [ownerKey(input.owner_key)],
      [
        new Date().toISOString(),
        String(maxNodesPerOwner()),
        String(nodeRegistryTtlSeconds()),
        JSON.stringify(node),
      ]
    );
    // Trust the locally-built node only as a fallback; prefer the script's
    // canonical row (re-validated so a corrupt EVAL result can never leak — H6).
    if (isStoredNode(result.node) && result.node.owner_key === input.owner_key) {
      return result.node;
    }
    return node;
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const current = (state.nodes_by_owner[input.owner_key] ?? [])
      .filter(nodeFresh)
      .filter(nodeHasUsablePublicUrl);
    const existing = current.find(
      (node) => node.node_name === normalizeNodeName(input.node_name)
    );
    const node = buildStoredNode(input, existing ?? null);
    fileSet({
      schema: "musu.node_registry_store.v1",
      nodes_by_owner: {
        ...state.nodes_by_owner,
        [input.owner_key]: [node, ...current.filter((item) => item.node_name !== node.node_name)]
          .slice(0, maxNodesPerOwner()),
      },
    });
    return node;
  });
}

export async function deleteNodeByName(owner: string, nodeNameValue: unknown): Promise<boolean> {
  assertStoreConfigured();

  const nodeName = normalizeNodeName(nodeNameValue);
  if (!nodeName) {
    throw new Error("node_name_required");
  }

  if (shouldUseKv()) {
    const result = await kvEvalJson<{ ok: true; deleted?: unknown }>(
      KV_DELETE_NODE_SCRIPT,
      [ownerKey(owner)],
      [nodeName]
    );
    return result.deleted === true;
  }

  return withLocalLock(async () => {
    const state = fileGet();
    const current = state.nodes_by_owner[owner] ?? [];
    const next = current.filter((node) => node.node_name !== nodeName);
    const deleted = next.length !== current.length;
    if (!deleted) {
      return false;
    }
    fileSet({
      schema: "musu.node_registry_store.v1",
      nodes_by_owner: {
        ...state.nodes_by_owner,
        [owner]: next,
      },
    });
    return true;
  });
}

async function getOwnerNodes(owner: string): Promise<StoredNode[]> {
  if (shouldUseKv()) {
    // Re-validate every row with isStoredNode so corrupt KV data never leaks to
    // callers (H6 lesson), then scope strictly to owner_key. The owner_key ===
    // owner filter is defense-in-depth: even if a KV mispartition placed another
    // owner's row under this key, it can never leak. Owner-scoping no longer
    // relies solely on the KV key being correct.
    const raw = await kvGet<unknown>(ownerKey(owner));
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(isStoredNode).filter((node) => node.owner_key === owner);
  }
  return (fileGet().nodes_by_owner[owner] ?? [])
    .filter(isStoredNode)
    .filter((node) => node.owner_key === owner);
}

/**
 * List the authenticated owner's fresh nodes, newest first. Scoped strictly to
 * owner_key: a caller can never see another owner's nodes.
 */
export async function listNodes(owner: string): Promise<StoredNode[]> {
  assertStoreConfigured();
  return (await getOwnerNodes(owner))
    .filter((node) => node.owner_key === owner)
    .filter(nodeFresh)
    .filter(nodeHeartbeatFresh)
    .filter(nodeHasUsablePublicUrl);
}
