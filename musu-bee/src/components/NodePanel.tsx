"use client";

import { useCallback, useEffect, useState } from "react";

interface NodeInfo {
  name: string;
  url: string;
  status: "online" | "offline" | "self" | "error" | "unknown";
  is_self: boolean;
  agents?: string[];
}

interface RegistryNode {
  node_name: string;
  public_url: string;
  last_seen: string;
}

export default function NodePanel() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("8070");
  const [pairing, setPairing] = useState(false);
  const [pairMsg, setPairMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [assignBanner, setAssignBanner] = useState<string | null>(null);

  // Cloud registry state
  const [registryNodes, setRegistryNodes] = useState<RegistryNode[]>([]);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [cloudPairing, setCloudPairing] = useState<string | null>(null);

  // mDNS discovered state
  const [discoveredNodes, setDiscoveredNodes] = useState<{ name: string; url: string; agents: string[] }[]>([]);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch("/api/nodes");
      if (res.ok) setNodes(await res.json());
    } catch {
      // bridge unavailable
    }
  }, []);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await fetch("/api/registry");
      if (res.ok) {
        const data = await res.json();
        setTokenConfigured(data.token_configured ?? false);
        setRegistryNodes(data.nodes ?? []);
      }
    } catch {
      // registry unavailable — graceful degradation
    }
  }, []);

  const fetchDiscovered = useCallback(async () => {
    try {
      const res = await fetch("/api/nodes/discovered");
      if (res.ok) {
        const data = await res.json();
        setDiscoveredNodes(Array.isArray(data) ? data : []);
      }
    } catch {
      // bridge unavailable
    }
  }, []);

  useEffect(() => {
    void fetchNodes();
    void fetchRegistry();
    void fetchDiscovered();
    const interval = setInterval(() => {
      void fetchNodes();
      void fetchRegistry();
      void fetchDiscovered();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchNodes, fetchRegistry, fetchDiscovered]);

  const handlePair = async () => {
    if (!ip.trim()) return;
    setPairing(true);
    setPairMsg(null);
    try {
      const res = await fetch("/api/nodes/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), port: parseInt(port) || 8070 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPairMsg({ ok: true, text: `${data.node_name} connected` });
        if (data.assigned_agents?.length > 0) {
          const agents = (data.assigned_agents as string[]).join(", ");
          setAssignBanner(`${agents} → ${data.node_name} auto-assigned`);
          setTimeout(() => setAssignBanner(null), 5000);
        }
        setIp("");
        setShowForm(false);
        await fetchNodes();
      } else {
        setPairMsg({ ok: false, text: data.error ?? data.detail ?? "Connection failed" });
      }
    } catch {
      setPairMsg({ ok: false, text: "Cannot reach bridge" });
    } finally {
      setPairing(false);
    }
  };

  const handleCloudPair = async (registryNode: RegistryNode) => {
    let parsedIp: string;
    let parsedPort: number;
    try {
      const u = new URL(registryNode.public_url);
      parsedIp = u.hostname;
      parsedPort = parseInt(u.port) || 8070;
    } catch {
      setPairMsg({ ok: false, text: "Invalid node URL from registry" });
      return;
    }
    setCloudPairing(registryNode.node_name);
    setPairMsg(null);
    try {
      const res = await fetch("/api/nodes/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: parsedIp, port: parsedPort }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPairMsg({ ok: true, text: `${data.node_name} connected` });
        if (data.assigned_agents?.length > 0) {
          const agents = (data.assigned_agents as string[]).join(", ");
          setAssignBanner(`${agents} → ${data.node_name} auto-assigned`);
          setTimeout(() => setAssignBanner(null), 5000);
        }
        await fetchNodes();
      } else {
        setPairMsg({ ok: false, text: data.error ?? "Connection failed" });
      }
    } catch {
      setPairMsg({ ok: false, text: "Cannot reach bridge" });
    } finally {
      setCloudPairing(null);
    }
  };

  const handleDisconnect = async (name: string) => {
    try {
      await fetch(`/api/nodes/${encodeURIComponent(name)}`, { method: "DELETE" });
      await fetchNodes();
    } catch {
      // ignore
    }
  };

  const statusDot = (status: NodeInfo["status"]) => {
    const color =
      status === "online" || status === "self"
        ? "var(--status-online)"
        : status === "offline"
        ? "var(--fg3)"
        : "var(--status-error)";
    return (
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          marginRight: 6,
          flexShrink: 0,
        }}
      />
    );
  };

  // Check if a registry node is already paired (by URL match)
  const pairedUrls = new Set(nodes.map((n) => n.url));
  const isStale = (lastSeen: string) =>
    Date.now() - new Date(lastSeen).getTime() > 90_000;

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--fg3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Nodes
        </span>
        <button
          onClick={() => { setShowForm(!showForm); setPairMsg(null); }}
          style={{
            background: "none",
            border: "1px solid var(--border-default)",
            borderRadius: 4,
            color: "var(--fg2)",
            fontSize: 11,
            padding: "2px 7px",
            cursor: "pointer",
          }}
        >
          {tokenConfigured ? "+ Manual IP" : "+ Connect"}
        </button>
      </div>

      {/* Cloud registry — "My Nodes" (only when MUSU_TOKEN configured) */}
      {tokenConfigured && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--fg4)", padding: "2px 6px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            My Nodes (musu.pro)
          </div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid #242424",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {registryNodes.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--fg4)" }}>
                No registered nodes yet
              </div>
            ) : (
              registryNodes.map((rn) => {
                const stale = isStale(rn.last_seen);
                const paired = pairedUrls.has(rn.public_url);
                const isPairing = cloudPairing === rn.node_name;
                return (
                  <div
                    key={rn.node_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "7px 10px",
                      borderBottom: "1px solid var(--border-subtle)",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: stale ? "var(--fg4)" : "var(--status-online)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--fg1)", flex: 1 }}>
                      {rn.node_name}
                    </span>
                    {paired ? (
                      <span style={{ fontSize: 10, color: "var(--status-online)" }}>Connected</span>
                    ) : (
                      <button
                        onClick={() => void handleCloudPair(rn)}
                        disabled={isPairing}
                        style={{
                          background: "none",
                          border: "1px solid var(--fg4)",
                          borderRadius: 4,
                          color: isPairing ? "var(--fg4)" : "var(--fg2)",
                          fontSize: 10,
                          padding: "2px 6px",
                          cursor: isPairing ? "not-allowed" : "pointer",
                        }}
                      >
                        {isPairing ? "..." : "Pair"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* mDNS discovered nodes */}
      {discoveredNodes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--fg4)", padding: "2px 6px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Discovered (network)
          </div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid #242424",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {discoveredNodes.map((dn) => {
              const alreadyPaired = pairedUrls.has(dn.url);
              const isPairing = cloudPairing === dn.name;
              return (
                <div
                  key={dn.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "7px 10px",
                    borderBottom: "1px solid var(--border-subtle)",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "var(--status-online)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--fg1)", flex: 1 }}>
                    {dn.name}
                  </span>
                  {alreadyPaired ? (
                    <span style={{ fontSize: 10, color: "var(--status-online)" }}>Connected</span>
                  ) : (
                    <button
                      onClick={() => {
                        try {
                          const u = new URL(dn.url);
                          void handleCloudPair({ node_name: dn.name, public_url: dn.url, last_seen: new Date().toISOString() });
                        } catch {
                          // ignore
                        }
                      }}
                      disabled={isPairing}
                      style={{
                        background: "none",
                        border: "1px solid var(--fg4)",
                        borderRadius: 4,
                        color: isPairing ? "var(--fg4)" : "var(--fg2)",
                        fontSize: 10,
                        padding: "2px 6px",
                        cursor: isPairing ? "not-allowed" : "pointer",
                      }}
                    >
                      {isPairing ? "..." : "Pair"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Local bridge node list */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid #242424",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {nodes.length === 0 ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg4)" }}>
            No connected nodes
          </div>
        ) : (
          nodes.map((node) => (
            <div
              key={node.name}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "7px 10px",
                borderBottom: "1px solid var(--border-subtle)",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {statusDot(node.status)}
                <span style={{ fontSize: 12, color: "var(--fg1)", flex: 1 }}>
                  {node.name}
                </span>
                <span style={{ fontSize: 11, color: "var(--fg4)" }}>
                  {node.status === "self" ? "this machine" : node.status}
                </span>
                {!node.is_self && (
                  <button
                    onClick={() => void handleDisconnect(node.name)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--fg4)",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: "1px 4px",
                    }}
                    title="Disconnect"
                  >
                    ✕
                  </button>
                )}
              </div>
              {!node.is_self && node.agents && node.agents.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, paddingLeft: 13 }}>
                  {node.agents.map((agent) => (
                    <span
                      key={agent}
                      style={{
                        fontSize: 9,
                        color: "var(--fg3)",
                        background: "var(--bg-card)",
                        border: "1px solid #2a2a2a",
                        borderRadius: 3,
                        padding: "1px 5px",
                        fontFamily: "monospace",
                        textTransform: "lowercase",
                      }}
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Auto-assignment banner */}
      {assignBanner && (
        <div
          style={{
            marginTop: 6,
            padding: "5px 10px",
            background: "#0a1f0a",
            border: "1px solid #14532d",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--status-online)",
          }}
        >
          ✓ {assignBanner}
        </div>
      )}

      {/* Manual IP connect form */}
      {showForm && (
        <div
          style={{
            marginTop: 6,
            background: "var(--bg-surface)",
            border: "1px solid #242424",
            borderRadius: 8,
            padding: "10px 10px",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 6 }}>
            {tokenConfigured ? "Connect via Manual IP" : "Enter IP address"}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              placeholder="100.121.211.106"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handlePair()}
              style={{
                flex: 1,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: 5,
                color: "var(--fg1)",
                fontSize: 12,
                padding: "5px 8px",
                outline: "none",
              }}
            />
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              style={{
                width: 52,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: 5,
                color: "var(--fg2)",
                fontSize: 12,
                padding: "5px 6px",
                outline: "none",
              }}
            />
            <button
              onClick={() => void handlePair()}
              disabled={pairing || !ip.trim()}
              style={{
                background: pairing ? "var(--bg-card)" : "#1f2937",
                border: "1px solid var(--fg4)",
                borderRadius: 5,
                color: "var(--fg1)",
                fontSize: 12,
                padding: "5px 10px",
                cursor: pairing ? "not-allowed" : "pointer",
              }}
            >
              {pairing ? "..." : "Connect"}
            </button>
          </div>
          {pairMsg && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: pairMsg.ok ? "var(--status-online)" : "var(--status-error)",
              }}
            >
              {pairMsg.text}
            </div>
          )}
        </div>
      )}

      {/* pairMsg when form is hidden (from cloud pair) */}
      {!showForm && pairMsg && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: pairMsg.ok ? "var(--status-online)" : "var(--status-error)",
            padding: "0 4px",
          }}
        >
          {pairMsg.text}
        </div>
      )}
    </div>
  );
}
