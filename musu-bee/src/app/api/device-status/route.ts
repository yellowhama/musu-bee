import { NextResponse } from "next/server";

/** musu-port /health response shape (key fields only) */
interface PortHealth {
  device_id: string;
  boss_device_id?: string | null;
  physical_host_id?: string | null;
  status: string;
  cpu_pct: number;
  ram_used: number;
  ram_total: number;
  gpu_util?: number | null;
  // peers don't expose these; ok to be undefined
}

/** musu-port /peers response item */
interface PeerSnapshot {
  url: string;
  device_id: string | null;
  status: string; // "ok" | "unreachable" | "error"
  last_ok_ms: number | null;
}

/** Shape returned to the browser */
export interface DeviceStatusItem {
  id: string;
  name: string;
  isLeader: boolean;
  isRemote: boolean;
  peerUrl?: string;
  lastSeenMs?: number;
  status: "online" | "offline";
  cpu: number;
  gpu: number | null;
  ram: number; // 0-100 percent
}

const LOCAL_PORT_URL = (
  process.env.MUSU_PORT_URL ?? "http://localhost:1355"
).replace(/\/+$/, "");

const PEER_FETCH_TIMEOUT_MS = 4_000;

function toPercent(used: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function toGpu(util: number | null | undefined): number | null {
  if (util == null || !Number.isFinite(util)) return null;
  return Math.round(util);
}

async function fetchHealth(url: string): Promise<PortHealth | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PEER_FETCH_TIMEOUT_MS);
    const res = await fetch(`${url}/health`, {
      signal: controller.signal,
      next: { revalidate: 0 },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as PortHealth;
  } catch {
    return null;
  }
}

function healthToItem(
  h: PortHealth,
  opts: { isRemote: boolean; peerUrl?: string; lastSeenMs?: number },
): DeviceStatusItem {
  const ram = toPercent(h.ram_used, h.ram_total);
  const bossId = h.boss_device_id ?? null;
  return {
    id: h.device_id,
    name: h.physical_host_id ?? h.device_id,
    isLeader: bossId !== null && bossId === h.device_id,
    isRemote: opts.isRemote,
    peerUrl: opts.peerUrl,
    lastSeenMs: opts.lastSeenMs,
    status: "online",
    cpu: Math.round(h.cpu_pct ?? 0),
    gpu: toGpu(h.gpu_util),
    ram,
  };
}

export async function GET() {
  const devices: DeviceStatusItem[] = [];

  // ── Local machine ─────────────────────────────────────────────────────────
  const localHealth = await fetchHealth(LOCAL_PORT_URL);
  if (!localHealth) {
    // Port unreachable — return single offline entry so UI shows something
    devices.push({
      id: "local-device",
      name: "This Machine",
      isLeader: false,
      isRemote: false,
      status: "offline",
      cpu: 0,
      gpu: null,
      ram: 0,
    });
    return NextResponse.json(devices);
  }
  devices.push(healthToItem(localHealth, { isRemote: false }));

  // ── Peers ─────────────────────────────────────────────────────────────────
  try {
    const peersRes = await fetch(`${LOCAL_PORT_URL}/peers`, {
      next: { revalidate: 0 },
    });
    if (peersRes.ok) {
      const peers = (await peersRes.json()) as PeerSnapshot[];
      const reachable = peers.filter((p) => p.status === "ok" && p.url);

      // Fetch each peer's health in parallel
      const peerResults = await Promise.allSettled(
        reachable.map(async (peer) => {
          const h = await fetchHealth(peer.url);
          if (!h) {
            // Peer is known but health unreachable — show offline
            devices.push({
              id: peer.device_id ?? peer.url,
              name: peer.device_id ?? peer.url,
              isLeader: false,
              isRemote: true,
              peerUrl: peer.url,
              lastSeenMs: peer.last_ok_ms ?? undefined,
              status: "offline",
              cpu: 0,
              gpu: null,
              ram: 0,
            });
            return;
          }
          // Use boss_device_id from local health to determine leader
          const bossId = localHealth.boss_device_id ?? null;
          const item = healthToItem(h, {
            isRemote: true,
            peerUrl: peer.url,
            lastSeenMs: peer.last_ok_ms ?? undefined,
          });
          // override isLeader with the authoritative boss from local
          item.isLeader = bossId !== null && bossId === h.device_id;
          devices.push(item);
        }),
      );
      void peerResults; // results handled via side effects above
    }
  } catch {
    // peers fetch failed — just return local
  }

  // Local is always first; sort remotes alphabetically after
  const local = devices.filter((d) => !d.isRemote);
  const remote = devices.filter((d) => d.isRemote).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json([...local, ...remote]);
}
