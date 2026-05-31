import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type P2pRouteKind = "lan" | "tailscale" | "direct_quic" | "relay" | "failed";

export type P2pCandidateEndpoint = {
  kind: P2pRouteKind;
  addr: string;
  observed_at: string;
  scheme?: "http" | "https" | null;
};

export type P2pNodeCandidateSet = {
  node_id: string;
  node_name: string;
  app_version: string;
  candidate_endpoints: P2pCandidateEndpoint[];
  relay_capable: boolean;
  public_key: string;
  capabilities: string[];
};

export type P2pRendezvousStatus = "pending_approval" | "approved" | "closed";

export type StoredP2pRendezvousSession = {
  session_id: string;
  source: P2pNodeCandidateSet;
  target: P2pNodeCandidateSet;
  expires_at: string;
  approval_required: boolean;
  status: P2pRendezvousStatus;
  created_at: string;
  updated_at: string;
  requested_capability?: string | null;
  approved_at?: string | null;
  closed_at?: string | null;
};

type P2pRendezvousStoreState = {
  schema: "musu.p2p_rendezvous_store.v1";
  sessions: Record<string, StoredP2pRendezvousSession>;
  candidates_by_node: Record<string, CachedP2pNodeCandidateSet>;
};

const KV_SESSION_PREFIX = "musu:p2p:rendezvous:v1:";
const KV_CANDIDATE_PREFIX = "musu:p2p:rendezvous-candidates:v1:";
const DEFAULT_TTL_SECONDS = 300;
const CANDIDATE_CACHE_TTL_MULTIPLIER = 4;

type CachedP2pNodeCandidateSet = {
  candidate_set: P2pNodeCandidateSet;
  cached_at: string;
};

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL) && Boolean(process.env.KV_REST_API_TOKEN);
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_P2P_RENDEZVOUS_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("p2p_rendezvous_kv_not_configured");
  }
}

export function rendezvousTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RENDEZVOUS_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 60), 3600);
}

export function candidateCacheTtlSeconds(): number {
  return Math.min(rendezvousTtlSeconds() * CANDIDATE_CACHE_TTL_MULTIPLIER, 3600);
}

function candidateCacheFresh(cachedAt: string): boolean {
  const millis = Date.parse(cachedAt);
  if (!Number.isFinite(millis)) {
    return false;
  }
  return Date.now() - millis <= candidateCacheTtlSeconds() * 1000;
}

function storePath(): string {
  const override = process.env.MUSU_P2P_RENDEZVOUS_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "p2p-rendezvous", "sessions.json");
}

function sessionKey(sessionId: string): string {
  return `${KV_SESSION_PREFIX}${sessionId}`;
}

function candidateKey(nodeId: string): string {
  return `${KV_CANDIDATE_PREFIX}${encodeURIComponent(nodeId)}`;
}

function isSession(value: unknown): value is StoredP2pRendezvousSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as Partial<StoredP2pRendezvousSession>;
  return (
    typeof session.session_id === "string" &&
    typeof session.expires_at === "string" &&
    typeof session.approval_required === "boolean" &&
    typeof session.status === "string" &&
    Boolean(session.source?.node_id) &&
    Boolean(session.target?.node_id)
  );
}

function isCandidateSet(value: unknown): value is P2pNodeCandidateSet {
  if (!value || typeof value !== "object") {
    return false;
  }
  const set = value as Partial<P2pNodeCandidateSet>;
  return (
    typeof set.node_id === "string" &&
    typeof set.node_name === "string" &&
    typeof set.app_version === "string" &&
    Array.isArray(set.candidate_endpoints) &&
    typeof set.relay_capable === "boolean" &&
    typeof set.public_key === "string" &&
    Array.isArray(set.capabilities)
  );
}

function isCachedCandidateSet(value: unknown): value is CachedP2pNodeCandidateSet {
  if (!value || typeof value !== "object") {
    return false;
  }
  const cached = value as Partial<CachedP2pNodeCandidateSet>;
  return typeof cached.cached_at === "string" && isCandidateSet(cached.candidate_set);
}

function emptyState(): P2pRendezvousStoreState {
  return {
    schema: "musu.p2p_rendezvous_store.v1",
    sessions: {},
    candidates_by_node: {},
  };
}

function normalizeState(value: unknown): P2pRendezvousStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }

  const input = value as Partial<P2pRendezvousStoreState>;
  const sessions: Record<string, StoredP2pRendezvousSession> = {};
  for (const [id, session] of Object.entries(input.sessions ?? {})) {
    if (isSession(session)) {
      sessions[id] = session;
    }
  }
  const candidatesByNode: Record<string, CachedP2pNodeCandidateSet> = {};
  for (const [nodeId, cached] of Object.entries(input.candidates_by_node ?? {})) {
    if (isCachedCandidateSet(cached) && candidateCacheFresh(cached.cached_at)) {
      candidatesByNode[nodeId] = cached;
    }
  }
  return {
    schema: "musu.p2p_rendezvous_store.v1",
    sessions,
    candidates_by_node: candidatesByNode,
  };
}

function fileGet(): P2pRendezvousStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: P2pRendezvousStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `p2p-rendezvous-${process.pid}-${Date.now()}.json`);
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

function emptyCandidateSet(nodeId: string): P2pNodeCandidateSet {
  return {
    node_id: nodeId,
    node_name: nodeId,
    app_version: "unknown",
    candidate_endpoints: [],
    relay_capable: false,
    public_key: "",
    capabilities: [],
  };
}

function cloneCandidateSet(set: P2pNodeCandidateSet): P2pNodeCandidateSet {
  return {
    ...set,
    candidate_endpoints: [...set.candidate_endpoints],
    capabilities: [...set.capabilities],
  };
}

function seedCandidateSet(
  nodeId: string,
  cached: P2pNodeCandidateSet | null
): P2pNodeCandidateSet {
  if (cached?.node_id === nodeId) {
    return cloneCandidateSet(cached);
  }
  return emptyCandidateSet(nodeId);
}

function withExpiry(now: Date): string {
  return new Date(now.getTime() + rendezvousTtlSeconds() * 1000).toISOString();
}

export function createSessionId(): string {
  return `rv_${Date.now()}_${randomUUID()}`;
}

export function createRendezvousSession(input: {
  source_node_id: string;
  target_node_id: string;
  requested_capability?: string | null;
}, seeds: {
  source?: P2pNodeCandidateSet | null;
  target?: P2pNodeCandidateSet | null;
} = {}): StoredP2pRendezvousSession {
  const now = new Date();
  return {
    session_id: createSessionId(),
    source: seedCandidateSet(input.source_node_id, seeds.source ?? null),
    target: seedCandidateSet(input.target_node_id, seeds.target ?? null),
    expires_at: withExpiry(now),
    approval_required: true,
    status: "pending_approval",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    requested_capability: input.requested_capability ?? null,
  };
}

export async function loadNodeCandidateSet(
  nodeId: string
): Promise<P2pNodeCandidateSet | null> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    const cached = await kv.get<CachedP2pNodeCandidateSet>(candidateKey(nodeId));
    if (!isCachedCandidateSet(cached) || !candidateCacheFresh(cached.cached_at)) {
      return null;
    }
    return cloneCandidateSet(cached.candidate_set);
  }

  const cached = fileGet().candidates_by_node[nodeId];
  if (!isCachedCandidateSet(cached) || !candidateCacheFresh(cached.cached_at)) {
    return null;
  }
  return cloneCandidateSet(cached.candidate_set);
}

export async function saveNodeCandidateSet(
  candidateSet: P2pNodeCandidateSet
): Promise<void> {
  assertStoreConfigured();
  const cached: CachedP2pNodeCandidateSet = {
    candidate_set: cloneCandidateSet(candidateSet),
    cached_at: new Date().toISOString(),
  };
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(candidateKey(candidateSet.node_id), cached, {
      ex: candidateCacheTtlSeconds(),
    });
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    fileSet({
      schema: "musu.p2p_rendezvous_store.v1",
      sessions: state.sessions,
      candidates_by_node: {
        ...state.candidates_by_node,
        [candidateSet.node_id]: cached,
      },
    });
  });
}

export async function saveRendezvousSession(
  session: StoredP2pRendezvousSession
): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(sessionKey(session.session_id), session, {
      ex: rendezvousTtlSeconds() + 60,
    });
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    fileSet({
      schema: "musu.p2p_rendezvous_store.v1",
      sessions: {
        ...state.sessions,
        [session.session_id]: session,
      },
      candidates_by_node: state.candidates_by_node,
    });
  });
}

export async function getRendezvousSession(
  sessionId: string
): Promise<StoredP2pRendezvousSession | null> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    const session = await kv.get<StoredP2pRendezvousSession>(sessionKey(sessionId));
    return isSession(session) ? session : null;
  }

  const state = fileGet();
  const session = state.sessions[sessionId];
  return isSession(session) ? session : null;
}

export async function updateRendezvousSession(
  sessionId: string,
  update: (session: StoredP2pRendezvousSession) => StoredP2pRendezvousSession
): Promise<StoredP2pRendezvousSession | null> {
  assertStoreConfigured();
  const current = await getRendezvousSession(sessionId);
  if (!current) {
    return null;
  }

  const next = update({
    ...current,
    source: { ...current.source, candidate_endpoints: [...current.source.candidate_endpoints] },
    target: { ...current.target, candidate_endpoints: [...current.target.candidate_endpoints] },
  });
  await saveRendezvousSession({ ...next, updated_at: new Date().toISOString() });
  return getRendezvousSession(sessionId);
}

export function upsertCandidateSet(
  session: StoredP2pRendezvousSession,
  input: {
    node_id: string;
    candidate_endpoints: P2pCandidateEndpoint[];
    relay_capable: boolean;
    node_name?: string;
    app_version?: string;
    public_key?: string;
    capabilities?: string[];
  }
): StoredP2pRendezvousSession {
  const updateSet = (current: P2pNodeCandidateSet): P2pNodeCandidateSet => ({
    ...current,
    node_name: input.node_name ?? current.node_name,
    app_version: input.app_version ?? current.app_version,
    candidate_endpoints: input.candidate_endpoints,
    relay_capable: input.relay_capable,
    public_key: input.public_key ?? current.public_key,
    capabilities: input.capabilities ?? current.capabilities,
  });

  if (session.source.node_id === input.node_id) {
    return { ...session, source: updateSet(session.source) };
  }
  if (session.target.node_id === input.node_id) {
    return { ...session, target: updateSet(session.target) };
  }
  throw new Error("node_not_in_rendezvous");
}
