import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextResponse } from "next/server";

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

export async function GET() {
  const BRIDGE_URL = getBridgeUrl();

  try {
    const res = await fetch(`${BRIDGE_URL}/api/fleet/status`, {
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`fleet/status returned ${res.status}`);
    }

    const data = (await res.json()) as FleetDashboard;

    const devices: DeviceStatusItem[] = [];

    // 1. This Node
    devices.push({
      id: data.this_node.addr,
      name: data.this_node.name,
      isLeader: data.this_node.is_self, // In V27, we just mark the local one as primary for now
      isRemote: false,
      status: data.this_node.healthy ? "online" : "offline",
      tasks_running: data.this_node.tasks_running,
      tasks_pending: data.this_node.tasks_pending,
      version: data.this_node.version,
    });

    // 2. Peers
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

    return NextResponse.json(devices);
  } catch (err) {
    console.error("Failed to fetch fleet status:", err);
    // Return a dummy offline local node if bridge is completely down
    return NextResponse.json([
      {
        id: "local-device",
        name: "This Machine",
        isLeader: true,
        isRemote: false,
        status: "offline",
        tasks_running: 0,
        tasks_pending: 0,
        version: "unknown",
      }
    ]);
  }
}
