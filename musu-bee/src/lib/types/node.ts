export interface RegistryNode {
  node_name: string;
  public_url: string;
  last_seen: string;
  gpu?: string;
  roles?: string[];
}
