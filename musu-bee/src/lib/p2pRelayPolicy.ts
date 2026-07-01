import { p2pRelayLeaseStoreStatus } from "@/lib/p2pRelayLeaseStore";

export const RELAY_POLICY = "connect_pro_fallback_only";
export const RELEASE_GRADE_RELAY_TRANSPORT_KIND = "quic_relay_tunnel";
export const RELAY_TRANSPORT_KIND = RELEASE_GRADE_RELAY_TRANSPORT_KIND;
export const RELAY_CONNECT_PATH = "/api/v1/relay/connect";
export const RELAY_PAYLOAD_PATH = "/api/v1/relay/payload";
export const RELEASE_GRADE_TRANSPORT_REQUIRED = "quic_tls_1_3";
export const RELAY_CONNECT_ENDPOINT_IMPLEMENTED = true;
export const RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED = true;
export const RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED = true;
export const RELAY_TUNNEL_RUNTIME_IMPLEMENTED = false;

export function envEnabled(name: string): boolean {
  return process.env[name] === "1" || process.env[name]?.toLowerCase() === "true";
}

export function relayUrl(): string {
  return process.env.MUSU_P2P_RELAY_URL?.trim() ?? "";
}

export function hasConnectProEntitlement(): boolean {
  const entitlement = process.env.MUSU_P2P_RELAY_ENTITLEMENT?.trim().toLowerCase();
  return entitlement === "connect" || entitlement === "pro" || entitlement === "enterprise";
}

export function relayTransportFlagEnabled(): boolean {
  return envEnabled("MUSU_P2P_RELAY_TRANSPORT_WIRED");
}

export function relayPayloadEndpointWired(): boolean {
  return RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED && relayConnectEndpointWired();
}

export function relayConnectEndpointWired(): boolean {
  return RELAY_CONNECT_ENDPOINT_IMPLEMENTED;
}

export function relayPayloadQueueEndpointWired(): boolean {
  return RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED;
}

export function relayTransportKindReleaseGrade(): boolean {
  const transportKind: string = RELAY_TRANSPORT_KIND;
  return transportKind === RELEASE_GRADE_RELAY_TRANSPORT_KIND;
}

export function relayTunnelRuntimeImplemented(): boolean {
  return RELAY_TUNNEL_RUNTIME_IMPLEMENTED;
}

export function relayTransportWired(): boolean {
  return (
    relayTransportFlagEnabled() &&
    relayTransportKindReleaseGrade() &&
    relayPayloadEndpointWired() &&
    relayTunnelRuntimeImplemented()
  );
}

export function relayUrlIsWss(value = relayUrl()): boolean {
  try {
    return new URL(value).protocol === "wss:";
  } catch {
    return false;
  }
}

export function relayConnectPath(value = relayUrl()): string {
  try {
    return new URL(value).pathname || RELAY_CONNECT_PATH;
  } catch {
    return RELAY_CONNECT_PATH;
  }
}

export function relayLeaseStoreFields() {
  const status = p2pRelayLeaseStoreStatus();
  return {
    relay_lease_store_configured: status.configured,
    relay_lease_store_backend: status.backend,
    relay_lease_store_release_grade: status.release_grade,
  };
}

export function relayTransportPreflightBlockers(): string[] {
  const blockers: string[] = [];
  const store = p2pRelayLeaseStoreStatus();
  const url = relayUrl();
  if (!envEnabled("MUSU_P2P_RELAY_ENABLED")) {
    blockers.push("relay_disabled");
  }
  if (!relayTransportWired()) {
    blockers.push("relay_transport_not_wired");
  }
  if (!relayTunnelRuntimeImplemented()) {
    blockers.push("relay_tunnel_runtime_not_implemented");
  }
  if (!relayTransportKindReleaseGrade()) {
    blockers.push("relay_transport_kind_not_release_grade");
  }
  if (!relayPayloadEndpointWired()) {
    blockers.push("relay_payload_endpoint_not_wired");
  }
  if (!url) {
    blockers.push("relay_url_not_configured");
  } else if (!relayUrlIsWss(url)) {
    blockers.push("relay_url_not_wss");
  }
  if (!hasConnectProEntitlement()) {
    blockers.push("connect_pro_entitlement_required");
  }
  if (!store.configured) {
    blockers.push("relay_lease_store_not_configured");
  }
  if (!store.release_grade) {
    blockers.push("relay_lease_store_not_release_grade");
  }
  return blockers;
}
