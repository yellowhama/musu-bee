import fs from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

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

let localLockQueue: Promise<void> = Promise.resolve();

function shouldUseKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL) && Boolean(process.env.KV_REST_API_TOKEN);
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
      return true;
    })
    .slice(0, limit);
}
