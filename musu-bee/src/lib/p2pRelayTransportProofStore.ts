import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
  p2pKvEnvStatus,
} from "@/lib/p2pKvEnv";

export type StoredP2pRelayTransportProof = {
  proof_id: string;
  owner_key: string;
  session_id: string;
  lease_id: string;
  source_node_id: string;
  target_node_id: string;
  relay_url: string;
  tunnel_id: string;
  transport_kind: string;
  handshake_ms: number;
  payload_bytes_transited: number;
  payload_transited_musu_infra: boolean;
  peer_identity_verified: boolean;
  peer_identity_method: string;
  peer_public_key: string;
  encryption: string;
  transport_verified_by: string;
  release_grade: boolean;
  opened_at: string;
  closed_at?: string | null;
  created_at: string;
  expires_at: string;
};

type P2pRelayTransportProofStoreState = {
  schema: "musu.p2p_relay_transport_proof_store.v1";
  proofs: StoredP2pRelayTransportProof[];
};

export type P2pRelayTransportProofQuery = {
  owner_key?: string;
  limit?: number;
  session_id?: string;
  lease_id?: string;
  source_node_id?: string;
  target_node_id?: string;
  tunnel_id?: string;
};

export type P2pRelayTransportProofStoreStatus = {
  configured: boolean;
  backend: "vercel_kv" | "upstash_redis" | "file" | "development_file" | "unconfigured";
  release_grade: boolean;
};

const KV_KEY = "musu:p2p:relay-transport-proofs:v1";
const DEFAULT_MAX_PROOFS = 1000;
const DEFAULT_TTL_SECONDS = 300;
const RELEASE_GRADE_TRANSPORT_KINDS = new Set(["quic_relay_tunnel"]);
const RELEASE_GRADE_PEER_IDENTITY_METHODS = new Set(["quic_tls_cert_fingerprint"]);

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH?.trim());
}

export function p2pRelayTransportProofStoreStatus(): P2pRelayTransportProofStoreStatus {
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
    throw new Error("p2p_relay_transport_proof_kv_not_configured");
  }
}

function maxProofs(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_TRANSPORT_PROOF_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PROOFS;
  }
  return Math.min(parsed, 10_000);
}

export function relayTransportProofTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MUSU_P2P_RELAY_TRANSPORT_PROOF_TTL_SEC ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(Math.max(parsed, 60), 3600);
}

function storePath(): string {
  const override = process.env.MUSU_P2P_RELAY_TRANSPORT_PROOF_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "p2p-relay-transport-proofs", "proofs.json");
}

function emptyState(): P2pRelayTransportProofStoreState {
  return {
    schema: "musu.p2p_relay_transport_proof_store.v1",
    proofs: [],
  };
}

function proofFresh(proof: StoredP2pRelayTransportProof): boolean {
  const expiresAt = Date.parse(proof.expires_at);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

function isStoredRelayTransportProof(value: unknown): value is StoredP2pRelayTransportProof {
  if (!value || typeof value !== "object") {
    return false;
  }
  const proof = value as Partial<StoredP2pRelayTransportProof>;
  return (
    typeof proof.proof_id === "string" &&
    typeof proof.owner_key === "string" &&
    typeof proof.session_id === "string" &&
    typeof proof.lease_id === "string" &&
    typeof proof.source_node_id === "string" &&
    typeof proof.target_node_id === "string" &&
    typeof proof.relay_url === "string" &&
    typeof proof.tunnel_id === "string" &&
    typeof proof.transport_kind === "string" &&
    typeof proof.handshake_ms === "number" &&
    typeof proof.payload_bytes_transited === "number" &&
    typeof proof.payload_transited_musu_infra === "boolean" &&
    typeof proof.peer_identity_verified === "boolean" &&
    typeof proof.peer_identity_method === "string" &&
    typeof proof.peer_public_key === "string" &&
    typeof proof.encryption === "string" &&
    typeof proof.transport_verified_by === "string" &&
    typeof proof.release_grade === "boolean" &&
    typeof proof.opened_at === "string" &&
    typeof proof.created_at === "string" &&
    typeof proof.expires_at === "string"
  );
}

function normalizeState(value: unknown): P2pRelayTransportProofStoreState {
  if (!value || typeof value !== "object") {
    return emptyState();
  }
  const state = value as Partial<P2pRelayTransportProofStoreState>;
  return {
    schema: "musu.p2p_relay_transport_proof_store.v1",
    proofs: Array.isArray(state.proofs)
      ? state.proofs.filter(isStoredRelayTransportProof).filter(proofFresh).slice(0, maxProofs())
      : [],
  };
}

function fileGet(): P2pRelayTransportProofStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return emptyState();
  }
}

function fileSet(state: P2pRelayTransportProofStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `p2p-relay-transport-proof-${process.pid}-${Date.now()}.json`);
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

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isReleaseGradeTransportProof(input: {
  relay_url: string;
  transport_kind: string;
  payload_bytes_transited: number;
  payload_transited_musu_infra: boolean;
  peer_identity_verified: boolean;
  peer_identity_method: string;
  peer_public_key: string;
  encryption: string;
  transport_verified_by: string;
  opened_at: string;
  closed_at?: string | null;
}): boolean {
  const openedAt = parseIsoTimestamp(input.opened_at);
  const closedAt = parseIsoTimestamp(input.closed_at);
  return (
    input.relay_url.trim().startsWith("wss://") &&
    RELEASE_GRADE_TRANSPORT_KINDS.has(input.transport_kind.trim()) &&
    Number.isInteger(input.payload_bytes_transited) &&
    input.payload_bytes_transited > 0 &&
    input.payload_transited_musu_infra === true &&
    input.peer_identity_verified === true &&
    RELEASE_GRADE_PEER_IDENTITY_METHODS.has(input.peer_identity_method.trim()) &&
    input.peer_public_key.trim().startsWith("sha256:") &&
    input.encryption.trim().toLowerCase() === "quic_tls_1_3" &&
    input.transport_verified_by.trim() === "musu_quic_tls_transport" &&
    openedAt !== null &&
    (input.closed_at?.trim() ? closedAt !== null : true) &&
    (openedAt !== null && closedAt !== null ? closedAt >= openedAt : true)
  );
}

export function createRelayTransportProof(input: {
  owner_key: string;
  session_id: string;
  lease_id: string;
  source_node_id: string;
  target_node_id: string;
  relay_url: string;
  tunnel_id: string;
  transport_kind: string;
  handshake_ms: number;
  payload_bytes_transited: number;
  payload_transited_musu_infra: boolean;
  peer_identity_verified: boolean;
  peer_identity_method: string;
  peer_public_key: string;
  encryption: string;
  transport_verified_by: string;
  opened_at: string;
  closed_at?: string | null;
}): StoredP2pRelayTransportProof {
  const now = new Date();
  return {
    proof_id: `relay-transport-proof-${Date.now()}-${randomUUID()}`,
    owner_key: input.owner_key,
    session_id: input.session_id,
    lease_id: input.lease_id,
    source_node_id: input.source_node_id,
    target_node_id: input.target_node_id,
    relay_url: input.relay_url,
    tunnel_id: input.tunnel_id,
    transport_kind: input.transport_kind,
    handshake_ms: input.handshake_ms,
    payload_bytes_transited: input.payload_bytes_transited,
    payload_transited_musu_infra: input.payload_transited_musu_infra,
    peer_identity_verified: input.peer_identity_verified,
    peer_identity_method: input.peer_identity_method,
    peer_public_key: input.peer_public_key,
    encryption: input.encryption,
    transport_verified_by: input.transport_verified_by,
    release_grade: isReleaseGradeTransportProof(input),
    opened_at: input.opened_at,
    closed_at: input.closed_at ?? null,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + relayTransportProofTtlSeconds() * 1000).toISOString(),
  };
}

export async function appendRelayTransportProof(
  proof: StoredP2pRelayTransportProof
): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.lpush(KV_KEY, proof);
    await kv.ltrim(KV_KEY, 0, maxProofs() - 1);
    return;
  }

  await withLocalLock(async () => {
    const state = fileGet();
    fileSet({
      schema: "musu.p2p_relay_transport_proof_store.v1",
      proofs: [proof, ...state.proofs.filter(proofFresh)].slice(0, maxProofs()),
    });
  });
}

export async function queryRelayTransportProofs(
  query: P2pRelayTransportProofQuery = {}
): Promise<StoredP2pRelayTransportProof[]> {
  assertStoreConfigured();
  const proofs = shouldUseKv()
    ? (await (async () => {
        const { kv } = await import("@vercel/kv");
        return (await kv.lrange<StoredP2pRelayTransportProof>(
          KV_KEY,
          0,
          maxProofs() - 1
        )).filter(isStoredRelayTransportProof);
      })())
    : fileGet().proofs;
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));

  return proofs
    .filter(proofFresh)
    .filter((proof) => {
      if (query.owner_key && proof.owner_key !== query.owner_key) {
        return false;
      }
      if (query.session_id && proof.session_id !== query.session_id) {
        return false;
      }
      if (query.lease_id && proof.lease_id !== query.lease_id) {
        return false;
      }
      if (query.source_node_id && proof.source_node_id !== query.source_node_id) {
        return false;
      }
      if (query.target_node_id && proof.target_node_id !== query.target_node_id) {
        return false;
      }
      if (query.tunnel_id && proof.tunnel_id !== query.tunnel_id) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}
