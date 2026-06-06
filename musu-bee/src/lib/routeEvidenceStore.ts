import fs from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  ensureP2pKvRestEnvAliases,
  hasP2pKvCredentials,
} from "@/lib/p2pKvEnv";

export type RouteEvidencePayload = {
  schema: "musu.route_evidence.v1";
  version: string;
  source_node_id: string;
  target_node_id: string;
  session_id?: string | null;
  route_kind: "lan" | "tailscale" | "direct_quic" | "relay" | "failed";
  candidate_addr: string;
  handshake_ms?: number | null;
  total_attempt_ms: number;
  peer_identity_verified: boolean;
  peer_identity_method?: string | null;
  peer_public_key?: string | null;
  encryption: string;
  transport_verified_by?: string | null;
  payload_transited_musu_infra: boolean;
  result: "success" | "failed";
  failure_class?: string | null;
  relay_fallback?: {
    direct_path_failed: boolean;
    lease_requested: boolean;
    status: "skipped_no_token" | "skipped_no_session" | "denied" | "issued" | "failed" | "timed_out";
    lease_issued: boolean;
    attempted_route_kinds: Array<"lan" | "tailscale" | "direct_quic" | "relay" | "failed">;
    requested_capability?: string | null;
    policy?: string | null;
    blockers?: string[];
    lease_id?: string | null;
    failure_class?: string | null;
    payload_transport_attempted?: boolean;
    payload_transport_proven?: boolean;
    payload_transport_failure_class?: string | null;
  };
  relay_transport_proof?: {
    schema: "musu.relay_transport_proof.v1";
    session_id: string;
    lease_id: string;
    source_node_id: string;
    target_node_id: string;
    transport_kind: string;
    relay_url: string;
    tunnel_id: string;
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
  };
  relay_payload_delivery_proof?: {
    schema: "musu.relay_payload_delivery_proof.v1";
    payload_id: string;
    session_id: string;
    lease_id: string;
    source_node_id: string;
    target_node_id: string;
    relay_url: string;
    tunnel_id: string;
    transport_kind: string;
    relay_default_data_path: boolean;
    release_grade: boolean;
    payload_sha256: string;
    payload_bytes: number;
    delivered_at: string;
  };
  recorded_at: string;
};

export type StoredRouteEvidenceRecord = {
  id: string;
  owner_key: string;
  received_at: string;
  release_grade: boolean;
  blockers: string[];
  evidence: RouteEvidencePayload;
};

type RouteEvidenceStoreState = {
  schema: "musu.route_evidence_store.v1";
  records: StoredRouteEvidenceRecord[];
};

export type RouteEvidenceQuery = {
  owner_key?: string;
  limit?: number;
  source_node_id?: string;
  target_node_id?: string;
  route_kind?: RouteEvidencePayload["route_kind"];
  result?: RouteEvidencePayload["result"];
  release_grade?: boolean;
};

const KV_KEY = "musu:p2p:route-evidence:v1";
const DEFAULT_MAX_RECORDS = 1000;
const RELEASE_GRADE_RELAY_TRANSPORT_KINDS = new Set(["quic_relay_tunnel"]);
const RELEASE_GRADE_RELAY_PAYLOAD_TRANSPORT_KINDS = new Set(["quic_relay_tunnel"]);
const RELEASE_GRADE_PEER_IDENTITY_METHODS = new Set(["quic_tls_cert_fingerprint"]);

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  ensureP2pKvRestEnvAliases();
  return hasP2pKvCredentials();
}

function hasExplicitFileStore(): boolean {
  return Boolean(process.env.MUSU_ROUTE_EVIDENCE_STORE_PATH?.trim());
}

function assertStoreConfigured(): void {
  if (!shouldUseKv() && process.env.NODE_ENV === "production" && !hasExplicitFileStore()) {
    throw new Error("route_evidence_kv_not_configured");
  }
}

function maxRecords(): number {
  const parsed = Number.parseInt(process.env.MUSU_ROUTE_EVIDENCE_MAX_RECORDS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_RECORDS;
  }
  return Math.min(parsed, 10_000);
}

function storePath(): string {
  const override = process.env.MUSU_ROUTE_EVIDENCE_STORE_PATH?.trim();
  if (override) {
    return override;
  }
  return path.join(process.cwd(), "data", "p2p-route-evidence", "route-evidence.json");
}

function normalizeState(value: unknown): RouteEvidenceStoreState {
  if (!value || typeof value !== "object") {
    return { schema: "musu.route_evidence_store.v1", records: [] };
  }
  const record = value as Partial<RouteEvidenceStoreState>;
  return {
    schema: "musu.route_evidence_store.v1",
    records: Array.isArray(record.records)
      ? record.records.filter(isStoredRouteEvidenceRecord).slice(0, maxRecords())
      : [],
  };
}

function isStoredRouteEvidenceRecord(value: unknown): value is StoredRouteEvidenceRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<StoredRouteEvidenceRecord>;
  const evidence = record.evidence as Partial<RouteEvidencePayload> | undefined;
  return (
    typeof record.id === "string" &&
    typeof record.owner_key === "string" &&
    typeof record.received_at === "string" &&
    typeof record.release_grade === "boolean" &&
    Array.isArray(record.blockers) &&
    record.blockers.every((blocker) => typeof blocker === "string") &&
    evidence?.schema === "musu.route_evidence.v1" &&
    typeof evidence.source_node_id === "string" &&
    typeof evidence.target_node_id === "string" &&
    typeof evidence.route_kind === "string" &&
    typeof evidence.result === "string"
  );
}

function hasCurrentRelayTransportProof(evidence: RouteEvidencePayload): boolean {
  if (evidence.route_kind !== "relay") {
    return true;
  }
  const proof = evidence.relay_transport_proof;
  const relayLeaseId = evidence.relay_fallback?.lease_id?.trim() ?? "";
  const evidenceSessionId = evidence.session_id?.trim() ?? "";
  return Boolean(
      proof &&
      proof.schema === "musu.relay_transport_proof.v1" &&
      proof.lease_id?.trim() &&
      relayLeaseId &&
      proof.lease_id.trim() === relayLeaseId &&
      proof.session_id?.trim() &&
      evidenceSessionId &&
      proof.session_id.trim() === evidenceSessionId &&
      proof.source_node_id?.trim() === evidence.source_node_id.trim() &&
      proof.target_node_id?.trim() === evidence.target_node_id.trim() &&
      proof.tunnel_id?.trim() &&
      proof.relay_url?.trim().startsWith("wss://") &&
      RELEASE_GRADE_RELAY_TRANSPORT_KINDS.has(proof.transport_kind.trim()) &&
      Number.isInteger(proof.handshake_ms) &&
      proof.handshake_ms >= 0 &&
      Number.isInteger(proof.payload_bytes_transited) &&
      proof.payload_bytes_transited > 0 &&
      proof.payload_transited_musu_infra === true &&
      proof.peer_identity_verified === true &&
      proof.peer_identity_method?.trim() === (evidence.peer_identity_method?.trim() ?? "") &&
      RELEASE_GRADE_PEER_IDENTITY_METHODS.has(proof.peer_identity_method.trim()) &&
      proof.peer_public_key?.trim() === (evidence.peer_public_key?.trim() ?? "") &&
      proof.peer_public_key.trim().startsWith("sha256:") &&
      proof.encryption.trim().toLowerCase() === "quic_tls_1_3" &&
      proof.transport_verified_by.trim() === "musu_quic_tls_transport"
  );
}

function hasCurrentRelayFallbackProof(evidence: RouteEvidencePayload): boolean {
  if (evidence.route_kind !== "relay") {
    return true;
  }
  const relay = evidence.relay_fallback;
  return Boolean(
    evidence.session_id?.trim() &&
    relay &&
      relay.direct_path_failed === true &&
      relay.lease_requested === true &&
      relay.status === "issued" &&
      relay.lease_issued === true &&
      relay.lease_id?.trim() &&
      relay.attempted_route_kinds.some((kind) => kind !== "relay") &&
      relay.payload_transport_attempted === true &&
      relay.payload_transport_proven === true
  );
}

function hasCurrentRelayPayloadDeliveryProof(evidence: RouteEvidencePayload): boolean {
  if (evidence.route_kind !== "relay") {
    return true;
  }

  const proof = evidence.relay_payload_delivery_proof;
  const relayLeaseId = evidence.relay_fallback?.lease_id?.trim() ?? "";
  const transportTunnelId = evidence.relay_transport_proof?.tunnel_id.trim() ?? "";
  const transportRelayUrl = evidence.relay_transport_proof?.relay_url.trim() ?? "";
  const evidenceSessionId = evidence.session_id?.trim() ?? "";
  return Boolean(
    proof &&
      proof.schema === "musu.relay_payload_delivery_proof.v1" &&
      proof.payload_id?.trim() &&
      proof.session_id?.trim() &&
      evidenceSessionId &&
      proof.session_id.trim() === evidenceSessionId &&
      proof.lease_id?.trim() &&
      relayLeaseId &&
      proof.lease_id.trim() === relayLeaseId &&
      proof.source_node_id.trim() === evidence.source_node_id.trim() &&
      proof.target_node_id.trim() === evidence.target_node_id.trim() &&
      proof.relay_url?.trim().startsWith("wss://") &&
      transportRelayUrl &&
      proof.relay_url.trim() === transportRelayUrl &&
      proof.tunnel_id?.trim() &&
      transportTunnelId &&
      proof.tunnel_id.trim() === transportTunnelId &&
      RELEASE_GRADE_RELAY_PAYLOAD_TRANSPORT_KINDS.has(proof.transport_kind?.trim() ?? "") &&
      proof.relay_default_data_path === false &&
      proof.release_grade === true &&
      proof.payload_sha256?.trim() &&
      Number.isInteger(proof.payload_bytes) &&
      proof.payload_bytes > 0 &&
      Number.isFinite(Date.parse(proof.delivered_at))
  );
}

function hasCurrentReleaseGradeProofs(evidence: RouteEvidencePayload): boolean {
  return (
    hasCurrentRelayFallbackProof(evidence) &&
    hasCurrentRelayTransportProof(evidence) &&
    hasCurrentRelayPayloadDeliveryProof(evidence)
  );
}

function fileGet(): RouteEvidenceStoreState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown);
  } catch {
    return { schema: "musu.route_evidence_store.v1", records: [] };
  }
}

function fileSet(state: RouteEvidenceStoreState): void {
  const stateFile = storePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(os.tmpdir(), `route-evidence-${process.pid}-${Date.now()}.json`);
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

async function readState(): Promise<RouteEvidenceStoreState> {
  assertStoreConfigured();
  return fileGet();
}

async function writeState(state: RouteEvidenceStoreState): Promise<void> {
  assertStoreConfigured();
  fileSet(state);
}

export function createRouteEvidenceId(): string {
  return `route-evidence-${Date.now()}-${randomUUID()}`;
}

export async function appendRouteEvidenceRecord(
  record: StoredRouteEvidenceRecord
): Promise<void> {
  assertStoreConfigured();
  if (shouldUseKv()) {
    const { kv } = await import("@vercel/kv");
    await kv.lpush(KV_KEY, record);
    await kv.ltrim(KV_KEY, 0, maxRecords() - 1);
    return;
  }

  await withLocalLock(async () => {
    const state = await readState();
    await writeState({
      schema: "musu.route_evidence_store.v1",
      records: [record, ...state.records].slice(0, maxRecords()),
    });
  });
}

export async function queryRouteEvidenceRecords(
  query: RouteEvidenceQuery = {}
): Promise<StoredRouteEvidenceRecord[]> {
  assertStoreConfigured();
  const records = shouldUseKv()
    ? (await (async () => {
        const { kv } = await import("@vercel/kv");
        return (await kv.lrange<StoredRouteEvidenceRecord>(
          KV_KEY,
          0,
          maxRecords() - 1
        )).filter(isStoredRouteEvidenceRecord);
      })())
    : (await readState()).records;
  const limit = Math.max(1, Math.min(query.limit ?? 50, 200));

  return records
    .filter((record) => {
      if (query.owner_key && record.owner_key !== query.owner_key) {
        return false;
      }
      if (query.source_node_id && record.evidence.source_node_id !== query.source_node_id) {
        return false;
      }
      if (query.target_node_id && record.evidence.target_node_id !== query.target_node_id) {
        return false;
      }
      if (query.route_kind && record.evidence.route_kind !== query.route_kind) {
        return false;
      }
      if (query.result && record.evidence.result !== query.result) {
        return false;
      }
      if (query.release_grade !== undefined && record.release_grade !== query.release_grade) {
        return false;
      }
      if (query.release_grade === true && !hasCurrentReleaseGradeProofs(record.evidence)) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}
