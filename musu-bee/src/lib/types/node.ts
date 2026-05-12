export interface NodeToken {
  id: string;
  user_id: string;
  token: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface RegistryNode {
  id: string;
  user_id: string;
  node_name: string;
  public_url: string;
  last_seen: string | null;
  health_status?: "online" | "stale" | "offline" | "unknown";
  meta: Record<string, unknown>;
  cert_fingerprint?: string | null;
  machine_group?: string | null;
  mac_address?: string | null;
  broadcast_ip?: string | null;
  gpu?: string;
  roles?: string[];
}
