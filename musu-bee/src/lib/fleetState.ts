// Canonical fleet node-status type + 3-state derivation, shared by every web
// render surface (the /fleet page and the /m/[id] detail page) so the
// THREE-surface invariant (web / CLI / cockpit shell) cannot drift on the web
// side. See docs/FLEET_RETRY_AND_LAST_SEEN_CONTRACT_2026_06_12.md
// §"Relay-reachable state".
//
// Mirrors the bridge `FleetNodeStatus` returned by `GET /api/fleet/status`
// (musu-rs `src/bridge/handlers/fleet.rs`). Nodes are keyed by `name` — there is
// NO `id` field; route params like /m/[id] carry the node name.

export interface FleetNodeStatus {
  name: string;
  addr: string;
  healthy: boolean;
  reachable_via?: string | null; // "direct" | "relay" | absent
  is_self: boolean;
  last_seen?: string | null;
  status_error?: string | null;
  tasks_running: number;
  tasks_pending: number;
  shared_dirs: string[];
  version: string;
}

export interface FleetDashboard {
  this_node: FleetNodeStatus;
  peers: FleetNodeStatus[];
  total_nodes: number;
  online_nodes: number;
  total_tasks_running: number;
  total_tasks_pending: number;
}

export type NodeState = "online" | "relay" | "offline";

// Derive the display bucket from the bridge's healthy + reachable_via fields.
//   healthy                          → online (direct route confirmed)
//   !healthy && reachable_via=relay  → relay  (reachable over relay, not offline)
//   otherwise                        → offline
export function nodeState(node: FleetNodeStatus): NodeState {
  if (node.healthy) return "online";
  if (node.reachable_via === "relay") return "relay";
  return "offline";
}

export function stateLabel(state: NodeState): string {
  switch (state) {
    case "online":
      return "online";
    case "relay":
      return "relay";
    default:
      return "offline";
  }
}
