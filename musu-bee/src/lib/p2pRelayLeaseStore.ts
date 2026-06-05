import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
  p2pKvEnvStatus,
} from "@/lib/p2pKvEnv";

export type RelayRouteKind = "lan" | "tailscale" | "direct_quic" | "relay";

export type StoredP2pRelayLease = {
  lease_id: string;
  owner_key: string;
  session_id: string;
  source_node_id: string;
  target_node_id: string;
  requested_capability?: string | null;
  attempted_route_kinds: RelayRouteKind[];
  failure_class?: string | null;
  relay_url: string;
  route_kind: "relay";
  payload_transited_musu_infra: true;
  default_data_path: false;
  policy: "connect_pro_fallback_only";
  created_at: string;
  expires_at: string;
};

type P2pRelayLeaseStoreState = {
  schema: "musu.p2p_relay_lease_store.v1";
  leases: StoredP2pRelayLease[];
};

export type P2pRelayLeaseQuery = {
  owner_key?: string;
  lease_id?: string;
  limit?: number;
  session_id?: string;
  source_node_id?: string;
  target_node_id?: string;
};

export type P2pRelayLeaseStoreStatus = {
  configured: boolean;
  backend: "vercel_kv" | "upstash_redis" | "file" | "development_file" | "unconfigured";
  release_grade: boolean;
};

const KV_KEY = "musu:p2p:relay-leases:v1";
const DEFAULT_MAX_LEASES = 500;
const DEFAULT_TTL_SECONDS = 300;

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH?.trim());
}

export function p2pRelayLeaseStoreStatus(): P2pRelayLeaseStoreStatus {
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
    throw new Error("p2p_relay_lease_kv_not_configured");
  }
}

function maxLeases(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_LEASE_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_LEASES;
  }
  return Math.min(parsed, 5000);
}

export function relayLeaseTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_LEASE_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 60), 3600);
}

function storePath(): string {
  const override = process.env.MUSU_P2P_RELAY_LEASE_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "p2p-relay-leases", "leases.json");
}

function emptyState(): P2pRelayLeaseStoreState {
  return {
    schema: "musu.p2p_relay_lease_store.v1",
    leases: [],
  };
}

function leaseFresh(lease: StoredP2pRelayLease): boolean {
  const expiresAt = Date.parse(lease.expires_at);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

function isStoredRelayLease(value: unknown): value is StoredP2pRelayLease {
  if (!value || typeof value !== "object") {
    return false;
  }
  const lease = value as Partial<StoredP2pRelayLease>;
  return (
    typeof lease.lease_id === "string" &&
    typeof lease.owner_key === "string" &&
    typeof lease.session_id === "string" &&
    typeof lease.source_node_id === "string" &&
    typeof lease.target_node_id === "string" &&
    Array.isArray(lease.attempted_route_kinds) &&
    typeof lease.relay_url === "string" &&
    lease.route_kind === "relay" &&
    lease.payload_transited_musu_infra === true &&
    lease.default_data_path === false &&
    lease.policy === "connect_pro_fallback_only" &&
    typeof lease.created_at === "string" &&
    typeof lease.expires_at === "string"
  );
}

function normalizeState(value: unknown): P2pRelayLeaseStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const state = value as Partial<P2pRelayLeaseStoreState>;
  return {
    schema: "musu.p2p_relay_lease_store.v1",
    leases: Array.isArray(state.leases)
      ? state.leases.filter(isStoredRelayLease).filter(leaseFresh).slice(0, maxLeases())
      : [],
  };
}

function fileGet(): P2pRelayLeaseStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: P2pRelayLeaseStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `p2p-relay-lease-${process.pid}-${Date.now()}.json`);
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

export function createRelayLease(input: {
  owner_key: string;
  session_id: string;
  source_node_id: string;
  target_node_id: string;
  requested_capability?: string | null;
  attempted_route_kinds: RelayRouteKind[];
  failure_class?: string | null;
  relay_url: string;
}): StoredP2pRelayLease {
  const now = new Date();
  return {
    lease_id: `relay-lease-${Date.now()}-${randomUUID()}`,
    owner_key: input.owner_key,
    session_id: input.session_id,
    source_node_id: input.source_node_id,
    target_node_id: input.target_node_id,
    requested_capability: input.requested_capability ?? null,
    attempted_route_kinds: input.attempted_route_kinds,
    failure_class: input.failure_class ?? null,
    relay_url: input.relay_url,
    route_kind: "relay",
    payload_transited_musu_infra: true,
    default_data_path: false,
    policy: "connect_pro_fallback_only",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + relayLeaseTtlSeconds() * 1000).toISOString(),
  };
}

export async function appendRelayLease(lease: StoredP2pRelayLease): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.lpush(KV_KEY, lease);
    await kv.ltrim(KV_KEY, 0, maxLeases() - 1);
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    fileSet({
      schema: "musu.p2p_relay_lease_store.v1",
      leases: [lease, ...state.leases.filter(leaseFresh)].slice(0, maxLeases()),
    });
  });
}

export async function queryRelayLeases(
  query: P2pRelayLeaseQuery = {}
): Promise<StoredP2pRelayLease[]> {
  assertStoreConfigured();
  const leases = shouldUseKv()
    ? (await (async () => {
        const { kv } = await import("@vercel/kv");
        return (await kv.lrange<StoredP2pRelayLease>(
          KV_KEY,
          0,
          maxLeases() - 1
        )).filter(isStoredRelayLease);
      })())
    : fileGet().leases;
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));

  return leases
    .filter(leaseFresh)
    .filter((lease) => {
      if (query.owner_key && lease.owner_key !== query.owner_key) {
        return false;
      }
      if (query.lease_id && lease.lease_id !== query.lease_id) {
        return false;
      }
      if (query.session_id && lease.session_id !== query.session_id) {
        return false;
      }
      if (query.source_node_id && lease.source_node_id !== query.source_node_id) {
        return false;
      }
      if (query.target_node_id && lease.target_node_id !== query.target_node_id) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}
