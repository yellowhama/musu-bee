import { NextResponse } from "next/server";

type AgentSnapshotRow = {
  id: string;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  urlKey?: string | null;
  lastHeartbeatAt?: string | null;
};

type HandoffDecision = {
  boss_host?: string;
  selected_target?: string;
  decision_reason_code?: string;
};

type HandoffLatestPayload = {
  available?: boolean;
  recorded_at_ms?: number;
  decision?: HandoffDecision | null;
};

type FetchResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

const DEFAULT_COMPANY_ID = "f27a9bd2-688a-450b-98b4-f63d24b0ab50";

const PAPERCLIP_API_BASE = normalizePaperclipApiBase(
  process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100/api",
);
const PAPERCLIP_COMPANY_ID =
  (process.env.PAPERCLIP_COMPANY_ID ?? DEFAULT_COMPANY_ID).trim() || DEFAULT_COMPANY_ID;
const MUSU_PORT_URL = normalizeBase(
  process.env.MUSU_PORT_URL ?? "http://127.0.0.1:1355",
);
const STALE_THRESHOLD_MS = toPositiveInt(
  process.env.AGENTS_STALE_THRESHOLD_MS,
  15 * 60 * 1000,
);

const AGENTS_TIMEOUT_MS = 2_500;
const HANDOFF_TIMEOUT_MS = 1_500;

function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function normalizePaperclipApiBase(raw: string): string {
  const base = normalizeBase(raw);
  return base.endsWith("/api") ? base : `${base}/api`;
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseIsoMs(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP_${response.status}` };
    }
    const data = (await response.json()) as unknown;
    return { ok: true, status: response.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_fetch_error";
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const fetchedAtMs = Date.now();
  const fetchedAt = new Date(fetchedAtMs).toISOString();

  const agentsUrl = `${PAPERCLIP_API_BASE}/companies/${encodeURIComponent(PAPERCLIP_COMPANY_ID)}/agents`;
  const handoffLatestUrl = `${MUSU_PORT_URL}/handoff/latest`;

  const agentsResult = await fetchJsonWithTimeout(agentsUrl, AGENTS_TIMEOUT_MS);

  let upstreamRows: AgentSnapshotRow[] = [];
  let degraded = false;
  let degradedReason: string | null = null;

  if (agentsResult.ok && Array.isArray(agentsResult.data)) {
    upstreamRows = agentsResult.data as AgentSnapshotRow[];
  } else {
    degraded = true;
    degradedReason = `agents_unavailable:${agentsResult.ok ? "invalid_payload" : agentsResult.error}`;
  }

  const departments = upstreamRows.map((row) => ({
    id: row.id,
    name: (row.name ?? "unknown").toString(),
    role: (row.role ?? "").toString(),
    status: (row.status ?? "unknown").toString(),
    urlKey: row.urlKey ?? null,
    lastHeartbeatAt: row.lastHeartbeatAt ?? null,
  }));

  const statusCounts: Record<string, number> = {};
  for (const department of departments) {
    statusCounts[department.status] = (statusCounts[department.status] ?? 0) + 1;
  }

  const heartbeatMs = departments
    .map((row) => parseIsoMs(row.lastHeartbeatAt))
    .filter((value): value is number => value !== null);
  const latestHeartbeatMs = heartbeatMs.length > 0 ? Math.max(...heartbeatMs) : 0;
  const stale =
    !degraded &&
    (latestHeartbeatMs === 0 || fetchedAtMs - latestHeartbeatMs > STALE_THRESHOLD_MS);
  if (!degraded && stale) {
    degraded = true;
    degradedReason = "agents_stale";
  }

  const handoffResult = await fetchJsonWithTimeout(handoffLatestUrl, HANDOFF_TIMEOUT_MS);
  const handoffPayload =
    handoffResult.ok &&
    handoffResult.data &&
    typeof handoffResult.data === "object"
      ? (handoffResult.data as HandoffLatestPayload)
      : null;
  const handoffDecision = handoffPayload?.decision ?? null;

  return NextResponse.json({
    source: {
      agents: agentsUrl,
      handoffLatest: handoffLatestUrl,
    },
    fetchedAt,
    staleThresholdMs: STALE_THRESHOLD_MS,
    degraded,
    degradedReason,
    stale,
    summary: {
      bossHost: handoffDecision?.boss_host ?? null,
      lastHandoffTarget: handoffDecision?.selected_target ?? null,
      handoffReasonCode: handoffDecision?.decision_reason_code ?? null,
      handoffRecordedAtMs:
        typeof handoffPayload?.recorded_at_ms === "number"
          ? handoffPayload.recorded_at_ms
          : null,
      departments,
      statusCounts,
    },
  });
}
