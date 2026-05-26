"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface NodeHealth {
  name: string;
  tailscale_ip: string;
  worker_url: string;
  roles: string[];
  gpu: string;
  status: "online" | "offline" | "degraded" | "error";
  health?: {
    status?: string;
    hostname?: string;
    platform?: string;
    gpu?: any;
  };
  capabilities?: {
    available_clis?: string[];
  };
  error?: string;
}

interface NodesResponse {
  nodes: NodeHealth[];
  worker_port: number;
}

interface ExecuteRequest {
  node_name: string;
  command: string;
  args?: string[];
  cwd?: string;
  timeout_sec?: number;
}

interface ExecuteResult {
  node: string;
  result: {
    exit_code: number;
    stdout: string;
    stderr: string;
    duration_ms?: number;
  };
}

const STATUS_COLOR: Record<NodeHealth["status"], string> = {
  online: "var(--status-online)",
  offline: "var(--status-error)",
  degraded: "var(--status-warn)",
  error: "var(--fg3)",
};

const STATUS_DOT: Record<NodeHealth["status"], string> = {
  online: "●",
  offline: "○",
  degraded: "◐",
  error: "✕",
};

export default function NodesPanel() {
  const [nodes, setNodes] = useState<NodeHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [executing, setExecuting] = useState<Set<string>>(new Set());
  const [execResults, setExecResults] = useState<Map<string, ExecuteResult | { error: string }>>(new Map());

  const mountedRef = useRef(true);

  const fetchNodes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/nodes/mesh");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: NodesResponse = await res.json();
      if (mountedRef.current) {
        setNodes(data.nodes);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || "Failed to fetch nodes");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchNodes();

    const interval = setInterval(() => {
      void fetchNodes();
    }, 10000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchNodes]);

  const handleExecute = useCallback(
    async (nodeName: string, command: string, args: string[] = []) => {
      const key = nodeName;
      setExecuting((prev) => new Set(prev).add(key));

      try {
        const payload: ExecuteRequest = {
          node_name: nodeName,
          command,
          args,
          timeout_sec: 30,
        };

        const res = await fetch("/api/nodes/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        const result: ExecuteResult = await res.json();

        setExecResults((prev) => {
          const updated = new Map(prev);
          updated.set(key, result);
          return updated;
        });
      } catch (err: any) {
        setExecResults((prev) => {
          const updated = new Map(prev);
          updated.set(key, { error: err.message });
          return updated;
        });
      } finally {
        setExecuting((prev) => {
          const updated = new Set(prev);
          updated.delete(key);
          return updated;
        });
      }
    },
    []
  );

  const handleTestCommand = useCallback(
    (nodeName: string) => {
      void handleExecute(nodeName, "echo", ["Hello from musu-bee!"]);
    },
    [handleExecute]
  );

  if (loading && nodes.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          background: "var(--bg-base)",
          padding: 24,
          overflowY: "auto",
          color: "var(--fg2)",
        }}
      >
        Loading nodes...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          background: "var(--bg-base)",
          padding: 24,
          overflowY: "auto",
          color: "var(--status-error)",
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "3px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🖥️</span>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--fg1)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Mesh Nodes
          </h2>
          <span
            style={{
              fontSize: 11,
              color: "var(--fg3)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 999,
              padding: "3px 10px",
            }}
          >
            {nodes.length} node{nodes.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => void fetchNodes()}
          className="btn"
          style={{
            padding: "6px 12px",
            fontSize: 12,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Nodes list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
            gap: 16,
          }}
        >
          {nodes.map((node) => {
            const isExpanded = expandedNode === node.name;
            const isExecuting = executing.has(node.name);
            const execResult = execResults.get(node.name);

            return (
              <div
                key={node.name}
                className="neo-card"
                style={{
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Node header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 14,
                        color: STATUS_COLOR[node.status],
                      }}
                    >
                      {STATUS_DOT[node.status]}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: "var(--fg1)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {node.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: STATUS_COLOR[node.status],
                      background: `${STATUS_COLOR[node.status]}22`,
                      border: `1px solid ${STATUS_COLOR[node.status]}44`,
                      borderRadius: 999,
                      padding: "3px 8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {node.status}
                  </span>
                </div>

                {/* Node info */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "var(--fg2)" }}>
                    <span style={{ color: "var(--fg3)" }}>IP:</span>{" "}
                    <span style={{ fontFamily: "monospace" }}>{node.tailscale_ip}</span>
                  </div>
                  {node.gpu && (
                    <div style={{ fontSize: 12, color: "var(--fg2)" }}>
                      <span style={{ color: "var(--fg3)" }}>GPU:</span> {node.gpu}
                    </div>
                  )}
                  {node.roles && node.roles.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {node.roles.map((role) => (
                        <span
                          key={role}
                          style={{
                            fontSize: 10,
                            color: "var(--fg2)",
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-default)",
                            borderRadius: 0,
                            padding: "2px 6px",
                          }}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleTestCommand(node.name)}
                    disabled={isExecuting || node.status === "offline"}
                    className="btn btn-primary"
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      opacity: isExecuting || node.status === "offline" ? 0.5 : 1,
                    }}
                  >
                    {isExecuting ? "Running..." : "Test: echo hello"}
                  </button>
                  <button
                    onClick={() =>
                      setExpandedNode(isExpanded ? null : node.name)
                    }
                    className="btn"
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                    }}
                  >
                    {isExpanded ? "Hide details" : "Show details"}
                  </button>
                </div>

                {/* Execute result */}
                {execResult && (
                  <div
                    style={{
                      background: "var(--code-bg)",
                      border: "var(--neo-border)",
                      padding: 12,
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                  >
                    {"error" in execResult ? (
                      <div style={{ color: "var(--status-error)" }}>
                        Error: {execResult.error}
                      </div>
                    ) : (
                      <div>
                        <div style={{ color: "var(--fg3)", marginBottom: 4 }}>
                          Exit code: {execResult.result.exit_code}
                          {execResult.result.duration_ms && (
                            <span style={{ marginLeft: 8 }}>
                              ({execResult.result.duration_ms}ms)
                            </span>
                          )}
                        </div>
                        {execResult.result.stdout && (
                          <div style={{ color: "var(--status-online)", marginBottom: 4 }}>
                            <div style={{ color: "var(--fg3)" }}>stdout:</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                              {execResult.result.stdout}
                            </pre>
                          </div>
                        )}
                        {execResult.result.stderr && (
                          <div style={{ color: "var(--status-error)" }}>
                            <div style={{ color: "var(--fg3)" }}>stderr:</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                              {execResult.result.stderr}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div
                    style={{
                      background: "var(--code-bg)",
                      border: "var(--neo-border)",
                      padding: 12,
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "var(--fg1)",
                    }}
                  >
                    {node.health && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: "var(--fg3)", marginBottom: 4 }}>
                          Health:
                        </div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(node.health, null, 2)}
                        </pre>
                      </div>
                    )}
                    {node.capabilities && (
                      <div>
                        <div style={{ color: "var(--fg3)", marginBottom: 4 }}>
                          Capabilities:
                        </div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(node.capabilities, null, 2)}
                        </pre>
                      </div>
                    )}
                    {node.error && (
                      <div style={{ color: "var(--status-error)" }}>
                        Error: {node.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
