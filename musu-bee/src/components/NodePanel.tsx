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

  // Cloud registry state
  const [registryNodes, setRegistryNodes] = useState<RegistryNode[]>([]);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [cloudPairing, setCloudPairing] = useState<string | null>(null);

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

  useEffect(() => {
    void fetchNodes();
    void fetchRegistry();
    const interval = setInterval(() => {
      void fetchNodes();
      void fetchRegistry();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchNodes, fetchRegistry]);

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
        setPairMsg({ ok: true, text: `${data.node_name} 연결됨` });
        setIp("");
        setShowForm(false);
        await fetchNodes();
      } else {
        setPairMsg({ ok: false, text: data.error ?? data.detail ?? "연결 실패" });
      }
    } catch {
      setPairMsg({ ok: false, text: "bridge 연결 불가" });
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
        setPairMsg({ ok: true, text: `${data.node_name} 연결됨` });
        await fetchNodes();
      } else {
        setPairMsg({ ok: false, text: data.error ?? "연결 실패" });
      }
    } catch {
      setPairMsg({ ok: false, text: "bridge 연결 불가" });
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
        ? "#22c55e"
        : status === "offline"
        ? "#6b7280"
        : "#ef4444";
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
            color: "#6b7280",
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
            border: "1px solid #2d2d2d",
            borderRadius: 4,
            color: "#9ca3af",
            fontSize: 11,
            padding: "2px 7px",
            cursor: "pointer",
          }}
        >
          {tokenConfigured ? "+ Manual IP" : "+ 연결"}
        </button>
      </div>

      {/* Cloud registry — "My Nodes" (only when MUSU_TOKEN configured) */}
      {tokenConfigured && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#4b5563", padding: "2px 6px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            My Nodes (musu.pro)
          </div>
          <div
            style={{
              background: "#141414",
              border: "1px solid #242424",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {registryNodes.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "#4b5563" }}>
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
                      borderBottom: "1px solid #1f1f1f",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: stale ? "#4b5563" : "#22c55e",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#e5e7eb", flex: 1 }}>
                      {rn.node_name}
                    </span>
                    {paired ? (
                      <span style={{ fontSize: 10, color: "#22c55e" }}>Connected</span>
                    ) : (
                      <button
                        onClick={() => void handleCloudPair(rn)}
                        disabled={isPairing}
                        style={{
                          background: "none",
                          border: "1px solid #374151",
                          borderRadius: 4,
                          color: isPairing ? "#4b5563" : "#9ca3af",
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

      {/* Local bridge node list */}
      <div
        style={{
          background: "#141414",
          border: "1px solid #242424",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {nodes.length === 0 ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "#4b5563" }}>
            연결된 노드 없음
          </div>
        ) : (
          nodes.map((node) => (
            <div
              key={node.name}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "7px 10px",
                borderBottom: "1px solid #1f1f1f",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {statusDot(node.status)}
                <span style={{ fontSize: 12, color: "#e5e7eb", flex: 1 }}>
                  {node.name}
                </span>
                <span style={{ fontSize: 11, color: "#4b5563" }}>
                  {node.status === "self" ? "this machine" : node.status}
                </span>
                {!node.is_self && (
                  <button
                    onClick={() => void handleDisconnect(node.name)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#4b5563",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: "1px 4px",
                    }}
                    title="연결 해제"
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
                        color: "#6b7280",
                        background: "#1a1a1a",
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

      {/* Manual IP connect form */}
      {showForm && (
        <div
          style={{
            marginTop: 6,
            background: "#141414",
            border: "1px solid #242424",
            borderRadius: 8,
            padding: "10px 10px",
          }}
        >
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
            {tokenConfigured ? "Manual IP 연결" : "IP 주소 입력"}
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
                background: "#111",
                border: "1px solid #2d2d2d",
                borderRadius: 5,
                color: "#e5e7eb",
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
                background: "#111",
                border: "1px solid #2d2d2d",
                borderRadius: 5,
                color: "#9ca3af",
                fontSize: 12,
                padding: "5px 6px",
                outline: "none",
              }}
            />
            <button
              onClick={() => void handlePair()}
              disabled={pairing || !ip.trim()}
              style={{
                background: pairing ? "#1a1a1a" : "#1f2937",
                border: "1px solid #374151",
                borderRadius: 5,
                color: "#e5e7eb",
                fontSize: 12,
                padding: "5px 10px",
                cursor: pairing ? "not-allowed" : "pointer",
              }}
            >
              {pairing ? "..." : "연결"}
            </button>
          </div>
          {pairMsg && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: pairMsg.ok ? "#22c55e" : "#ef4444",
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
            color: pairMsg.ok ? "#22c55e" : "#ef4444",
            padding: "0 4px",
          }}
        >
          {pairMsg.text}
        </div>
      )}
    </div>
  );
}
