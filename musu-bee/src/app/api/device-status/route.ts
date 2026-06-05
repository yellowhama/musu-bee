import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

export interface DeviceStatusItem {
  id: string;
  name: string;
  isLeader: boolean;
  isRemote: boolean;
  status: "online" | "offline";
  tasks_running: number;
  tasks_pending: number;
  version: string;
}

export interface DeviceStatusResponse {
  source: "status" | "health-fallback" | "offline-fallback";
  reason?: "status_http_error" | "health_http_error" | "fetch_error" | "invalid_payload";
  cpu: number | null;
  gpu: number | null;
  ram: number | null;
  status: string;
  device_id: string;
  recommended_for: string[];
  degraded: boolean;
  degradedReason: string | null;
  devices: DeviceStatusItem[];
}

interface FleetNodeStatus {
  name: string;
  addr: string;
  healthy: boolean;
  is_self: boolean;
  tasks_running: number;
  tasks_pending: number;
  shared_dirs: string[];
  version: string;
}

interface FleetDashboard {
  this_node: FleetNodeStatus;
  peers: FleetNodeStatus[];
  total_nodes: number;
  online_nodes: number;
  total_tasks_running: number;
  total_tasks_pending: number;
}

type LocalStatusPayload = {
  cpu?: unknown;
  gpu?: unknown;
  ram?: unknown;
  status?: unknown;
  device_id?: unknown;
  hostname?: unknown;
  version?: unknown;
  recommended_for?: unknown;
};

type JsonFetchResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: DeviceStatusResponse["reason"] };

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildRecommendedFor(payload: LocalStatusPayload): string[] {
  if (
    Array.isArray(payload.recommended_for) &&
    payload.recommended_for.every((item) => typeof item === "string")
  ) {
    return [...new Set(payload.recommended_for as string[])];
  }

  const recommended = new Set<string>(["general"]);
  const gpu = toFiniteNumber(payload.gpu);
  if (gpu !== null && gpu < 60) {
    recommended.add("llm");
    recommended.add("compute");
  }
  return [...recommended];
}

function buildLocalDevice(payload: LocalStatusPayload): DeviceStatusItem {
  const deviceId = toNonEmptyString(payload.device_id, "local-device");
  const status = toNonEmptyString(payload.status, "ok");
  return {
    id: deviceId,
    name: toNonEmptyString(payload.hostname, deviceId === "local-device" ? "This Machine" : deviceId),
    isLeader: true,
    isRemote: false,
    status: status === "ok" || status === "healthy" || status === "online" ? "online" : "offline",
    tasks_running: 0,
    tasks_pending: 0,
    version: toNonEmptyString(payload.version, "unknown"),
  };
}

function buildResponse(
  payload: LocalStatusPayload,
  source: DeviceStatusResponse["source"],
  degradedReason: string | null,
  devices?: DeviceStatusItem[],
): DeviceStatusResponse {
  const localDevice = buildLocalDevice(payload);
  return {
    source,
    cpu: toFiniteNumber(payload.cpu),
    gpu: toFiniteNumber(payload.gpu),
    ram: toFiniteNumber(payload.ram),
    status: toNonEmptyString(payload.status, source === "offline-fallback" ? "offline" : "ok"),
    device_id: localDevice.id,
    recommended_for: source === "offline-fallback" ? [] : buildRecommendedFor(payload),
    degraded: source !== "status",
    degradedReason,
    devices: devices && devices.length > 0 ? devices : [localDevice],
  };
}

function buildOfflineResponse(reason: DeviceStatusResponse["reason"]): DeviceStatusResponse {
  return {
    source: "offline-fallback",
    reason,
    cpu: null,
    gpu: null,
    ram: null,
    status: "offline",
    device_id: "local-device",
    recommended_for: [],
    degraded: true,
    degradedReason: reason ?? "offline",
    devices: [
      {
        id: "local-device",
        name: "This Machine",
        isLeader: true,
        isRemote: false,
        status: "offline",
        tasks_running: 0,
        tasks_pending: 0,
        version: "unknown",
      },
    ],
  };
}

function mapFleetDashboardToDevices(data: FleetDashboard): DeviceStatusItem[] {
  const devices: DeviceStatusItem[] = [];

  devices.push({
    id: data.this_node.addr,
    name: data.this_node.name,
    isLeader: data.this_node.is_self,
    isRemote: false,
    status: data.this_node.healthy ? "online" : "offline",
    tasks_running: data.this_node.tasks_running,
    tasks_pending: data.this_node.tasks_pending,
    version: data.this_node.version,
  });

  for (const peer of data.peers) {
    devices.push({
      id: peer.addr,
      name: peer.name,
      isLeader: false,
      isRemote: true,
      status: peer.healthy ? "online" : "offline",
      tasks_running: peer.tasks_running,
      tasks_pending: peer.tasks_pending,
      version: peer.version,
    });
  }

  return devices;
}

function isFleetDashboard(value: unknown): value is FleetDashboard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FleetDashboard>;
  return Boolean(candidate.this_node && Array.isArray(candidate.peers));
}

async function fetchBridgeJson(url: string, headers: Record<string, string>): Promise<JsonFetchResult> {
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return { ok: false, reason: "status_http_error" };
    }

    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, reason: "fetch_error" };
  }
}

async function fetchFleetDevices(
  bridgeUrl: string,
  headers: Record<string, string>,
): Promise<DeviceStatusItem[] | null> {
  const result = await fetchBridgeJson(`${bridgeUrl}/api/fleet/status`, headers);
  if (!result.ok || !isFleetDashboard(result.data)) {
    return null;
  }
  return mapFleetDashboardToDevices(result.data);
}

export async function GET() {
  const bridgeUrl = getBridgeUrl().replace(/\/+$/, "");
  const headers = buildBridgeHeaders(await getBridgeToken());

  const statusResult = await fetchBridgeJson(`${bridgeUrl}/status`, headers);
  if (statusResult.ok && statusResult.data && typeof statusResult.data === "object") {
    const fleetDevices = await fetchFleetDevices(bridgeUrl, headers);
    return NextResponse.json(
      buildResponse(statusResult.data as LocalStatusPayload, "status", null, fleetDevices ?? undefined),
    );
  }

  const healthResult = await fetchBridgeJson(`${bridgeUrl}/health`, headers);
  if (healthResult.ok && healthResult.data && typeof healthResult.data === "object") {
    return NextResponse.json(
      buildResponse(
        healthResult.data as LocalStatusPayload,
        "health-fallback",
        statusResult.ok ? "status_invalid_payload" : "status_unavailable",
      ),
    );
  }

  const healthReason = healthResult.ok ? "invalid_payload" : healthResult.reason;
  const reason = statusResult.ok
    ? "invalid_payload"
    : statusResult.reason === "fetch_error" || healthReason === "fetch_error"
      ? "fetch_error"
      : "health_http_error";

  return NextResponse.json(buildOfflineResponse(reason));
}
