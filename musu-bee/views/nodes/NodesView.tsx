import { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";

interface MeshNode {
  node_id: string;
  bridge_url: string;
  label?: string;
  healthy?: boolean;
  agent_count?: number;
}

const POLL_INTERVAL_MS = 10000;

export default function NodesView() {
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const { app, isConnected, error: appError } = useApp({
    appInfo: { name: "MUSU Nodes", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result) => {
        const sc = result.structuredContent as { nodes?: MeshNode[] } | null;
        if (sc?.nodes && mountedRef.current) {
          setNodes(sc.nodes);
          setError(null);
          setLoading(false);
        }
      };
      app.onhostcontextchanged = (ctx) => {
        if (ctx.theme) applyDocumentTheme(ctx.theme);
        if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
      };
    },
  });

  const pollNodes = useCallback(async () => {
    if (!app) return;
    try {
      const result = await app.callServerTool({ name: "poll_agents", arguments: {} });
      const sc = result.structuredContent as { nodes?: MeshNode[] } | null;
      if (sc?.nodes && mountedRef.current) {
        setNodes(sc.nodes);
        setError(null);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) setError("poll failed");
    }
  }, [app]);

  useEffect(() => {
    if (!app || !isConnected) return;
    mountedRef.current = true;
    void pollNodes();
    const id = setInterval(() => void pollNodes(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [app, isConnected, pollNodes]);

  const showAppError = !isConnected && appError;

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
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            color: isConnected ? "#22c55e" : "#6b7280",
          }}
        >
          {isConnected ? "● live" : "○ connecting…"}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {showAppError && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            Connection failed: {appError.message}
          </p>
        )}
        {!showAppError && loading && (
          <p style={{ color: "#6b7280", fontSize: 13, padding: "20px 8px" }}>
            Loading…
          </p>
        )}
        {!showAppError && !loading && error && (
          <p style={{ color: "#f87171", fontSize: 13, padding: "20px 8px" }}>
            {error}
          </p>
        )}
        {!showAppError && !loading && !error && nodes.length === 0 && (
          <p style={{ color: "#4b5563", fontSize: 13, padding: "20px 8px" }}>
            No nodes registered.
          </p>
        )}
        {!showAppError &&
          !loading &&
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
                    display: "inline-block",
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
