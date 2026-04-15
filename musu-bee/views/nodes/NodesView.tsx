import { useEffect, useState } from "react";
import { useMusuConfig } from "../shared/useMusuConfig";
import { authHeaders } from "../shared/api";

interface MeshNode {
  node_id: string;
  bridge_url: string;
  label?: string;
  healthy?: boolean;
  agent_count?: number;
}

export default function NodesView() {
  const config = useMusuConfig();
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res = await fetch(`${config.bridgeUrl}/api/admin/nodes`, {
          headers: authHeaders(config),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        const list = Array.isArray(data)
          ? (data as MeshNode[])
          : ((data as { nodes?: MeshNode[] }).nodes ?? []);
        setNodes(list);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load nodes");
      } finally {
        setLoading(false);
      }
    };
    void fetchNodes();
    const interval = setInterval(() => void fetchNodes(), 10000);
    return () => clearInterval(interval);
  }, [config]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--musu-bg-inset)",
      }}
    >
      <div
        style={{
          padding: "16px 20px 10px",
          borderBottom: "1px solid var(--musu-border-dim)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: "#f3f4f6" }}>
          Node Topology
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--musu-text-dim)",
            background: "var(--musu-bg-card)",
            border: "1px solid var(--musu-border)",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {nodes.length} nodes
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {loading && (
          <p style={{ color: "#6b7280", fontSize: 13, padding: "20px 8px" }}>
            Loading…
          </p>
        )}
        {!loading && error && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            {error}
          </p>
        )}
        {!loading && !error && nodes.length === 0 && (
          <p style={{ color: "#4b5563", fontSize: 13, padding: "20px 8px" }}>
            No nodes registered.
          </p>
        )}
        {!loading &&
          !error &&
          nodes.map((node) => (
            <div
              key={node.node_id}
              style={{
                background: "var(--musu-bg-card)",
                border: "1px solid var(--musu-border-dim)",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: node.healthy ? "#22c55e" : "#4b5563",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, color: "#f3f4f6", fontWeight: 500 }}>
                  {node.label ?? node.node_id}
                </span>
                {node.agent_count !== undefined && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--musu-text-dim)",
                      marginLeft: "auto",
                    }}
                  >
                    {node.agent_count} agents
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "#4b5563",
                  margin: "6px 0 0",
                  fontFamily: "monospace",
                }}
              >
                {node.bridge_url}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
