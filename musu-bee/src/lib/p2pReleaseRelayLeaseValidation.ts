import type { StoredP2pRelayLease } from "@/lib/p2pRelayLeaseStore";
import { RELAY_POLICY, relayUrl, relayUrlIsWss } from "@/lib/p2pRelayPolicy";

export function releaseRelayLeaseBlockers(lease: StoredP2pRelayLease): string[] {
  const blockers: string[] = [];
  const currentRelayUrl = relayUrl();

  if (lease.route_kind !== "relay") {
    blockers.push("release_relay_lease_not_relay_route");
  }
  if (lease.policy !== RELAY_POLICY) {
    blockers.push("release_relay_lease_policy_mismatch");
  }
  if (lease.default_data_path !== false) {
    blockers.push("release_relay_lease_default_data_path");
  }
  if (lease.payload_transited_musu_infra !== true) {
    blockers.push("release_relay_lease_payload_transit_not_musu_infra");
  }
  if (!relayUrlIsWss(lease.relay_url)) {
    blockers.push("release_relay_lease_relay_url_not_wss");
  }
  if (currentRelayUrl && lease.relay_url !== currentRelayUrl) {
    blockers.push("release_relay_lease_relay_url_mismatch");
  }
  if (!lease.attempted_route_kinds.some((kind) => kind !== "relay")) {
    blockers.push("release_relay_lease_direct_route_attempt_missing");
  }
  if (!lease.failure_class) {
    blockers.push("release_relay_lease_failure_class_missing");
  }

  return blockers;
}

export function publicReleaseRelayLease(lease: StoredP2pRelayLease) {
  return {
    lease_id: lease.lease_id,
    session_id: lease.session_id,
    source_node_id: lease.source_node_id,
    target_node_id: lease.target_node_id,
    route_kind: lease.route_kind,
    attempted_route_kinds: lease.attempted_route_kinds,
    failure_class: lease.failure_class,
    relay_url: lease.relay_url,
    default_data_path: lease.default_data_path,
    payload_transited_musu_infra: lease.payload_transited_musu_infra,
    policy: lease.policy,
    expires_at: lease.expires_at,
  };
}
