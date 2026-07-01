"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";
import RemoteFileExplorer from "../../../components/workstation/RemoteFileExplorer";
import TownView from "../../../components/workstation/town/TownView";
import ButlerView from "../../../components/workstation/butler/ButlerView";
import { VscServer, VscTerminal, VscFiles, VscCircuitBoard, VscOrganization, VscSend, VscCommentDiscussion } from "react-icons/vsc";

const RemoteTerminal = dynamic(() => import("../../../components/workstation/RemoteTerminal"), { ssr: false });
import { WIDGETS } from "../../../components/workstation/town/widgets/WidgetRegistry";
import { useFleetStore, ChatMessage } from "../../../store/useFleetStore";

interface FleetNodeStatus {
  name: string;
  addr: string;
  healthy: boolean;
  is_self: boolean;
  tasks_running: number;
  tasks_pending: number;
  shared_dirs: string[];
  version: string;
}

interface FleetDashboardData {
  this_node: FleetNodeStatus;
  peers: FleetNodeStatus[];
  total_nodes: number;
  online_nodes: number;
  total_tasks_running: number;
  total_tasks_pending: number;
}

const FLEET_STATUS_POLL_INTERVAL_MS = 30_000;

export default function FleetDashboardPage() {
  const [data, setData] = useState<FleetDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  
  const {
    messages, addMessage,
    activeViewMode, setActiveViewMode,
    selectedMachines, toggleMachine, setSelectedMachines,
    machineViewModes, setNodeViewMode, setInitialMachineViewModes,
    isTyping, setIsTyping, initSSE, closeSSE
  } = useFleetStore();

  const fetchFleetStatus = async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/fleet/status", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (signal?.aborted) return;
      setData(json);
      
      // Auto-select the first couple of healthy machines if none selected
      if (selectedMachines.length === 0 && json.peers) {
        const healthyPeers = json.peers.filter((p: FleetNodeStatus) => p.healthy).map((p: FleetNodeStatus) => p.name);
        const toSelect = [];
        if (json.this_node) toSelect.push(json.this_node.name);
        if (healthyPeers.length > 0) toSelect.push(healthyPeers[0]);
        setSelectedMachines(toSelect);
        
        const initialModes: Record<string, "terminal" | "explorer" | "split"> = {};
        toSelect.forEach((m) => initialModes[m] = "split");
        setInitialMachineViewModes(initialModes);
      }
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Failed to fetch fleet status");
      if (signal) throw err;
    }
  };

  useLowDutyPolling(fetchFleetStatus, { intervalMs: FLEET_STATUS_POLL_INTERVAL_MS });

  // Set up SSE Connection for Real-time AI events
  useEffect(() => {
    initSSE();
    return () => closeSSE();
  }, [initSSE, closeSSE]);

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    
    // Add user message
    const userText = chatInput;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: userText
    };
    addMessage(userMsg);
    setChatInput("");
    setIsTyping(true);

    try {
      // Hit the real backend API (musu-rs) which will trigger SSE events asynchronously
      await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userText })
      });
    } catch (err) {
      console.error("Failed to send chat to backend:", err);
      setIsTyping(false);
    }
  };

  const allNodes = data ? [data.this_node, ...data.peers] : [];

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-base)", color: "var(--fg1)", fontFamily: "'Space Mono', monospace" }}>
      
      {/* 1. LEFT PANEL: Navigation & Context (250px) */}
      <div style={{ width: "250px", borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column", background: "#111" }}>
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border-default)" }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--fg1)", display: "flex", alignItems: "center", gap: 8 }}>
            <VscServer style={{ color: "var(--accent-orange)" }} />
            MUSU
          </h2>
          <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
            {data ? `${data.online_nodes} / ${data.total_nodes} Direct Online` : "Loading..."}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Connected Devices */}
          <div style={{ padding: "16px 12px 8px 12px", fontSize: 11, fontWeight: "bold", color: "var(--fg3)", textTransform: "uppercase" }}>
            Connected Devices
          </div>
          <div style={{ padding: "0 8px" }}>
            {error && <div style={{ color: "var(--status-error)", fontSize: 12 }}>{error}</div>}
            {allNodes.map((node, i) => (
              <div 
                key={i} 
                style={{ 
                  padding: "8px", 
                  marginBottom: "4px",
                  borderRadius: "6px",
                  background: selectedMachines.includes(node.name) ? "var(--bg-active)" : "transparent",
                  border: "1px solid",
                  borderColor: selectedMachines.includes(node.name) ? "var(--accent-orange)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onClick={() => toggleMachine(node.name)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <div style={{ 
                    width: 8, height: 8, borderRadius: "50%", 
                    background: node.healthy ? "var(--status-success)" : "var(--status-error)" 
                  }} />
                  <span style={{ fontWeight: 600 }}>{node.name}</span>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* 2. CENTER PANEL: Main AI Workspace (flex: 1) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: activeViewMode === "town" || activeViewMode === "butler" ? "#251714" : "var(--bg-base)", transition: "background 0.3s" }}>
        
        {/* Top Navbar for Workspace (Mode Toggles) */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0a0a0a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: "bold", color: "var(--fg1)" }}>Workspace 뷰 모드:</span>
            <div style={{ display: "flex", background: "#1a1a1a", borderRadius: 6, padding: 4 }}>
              <button onClick={() => setActiveViewMode("dev")} style={{
                padding: "4px 12px", border: "none", borderRadius: 4, cursor: "pointer",
                background: activeViewMode === "dev" ? "var(--border-strong)" : "transparent",
                color: activeViewMode === "dev" ? "var(--fg1)" : "var(--fg3)",
                fontSize: 12, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s"
              }}><VscCircuitBoard /> Dev</button>
              
              <button onClick={() => setActiveViewMode("town")} style={{
                padding: "4px 12px", border: "none", borderRadius: 4, cursor: "pointer",
                background: activeViewMode === "town" ? "rgba(255,166,2,0.2)" : "transparent",
                color: activeViewMode === "town" ? "var(--accent-orange)" : "var(--fg3)",
                fontSize: 12, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s"
              }}><VscOrganization /> Town</button>
              
              <button onClick={() => setActiveViewMode("butler")} style={{
                padding: "4px 12px", border: "none", borderRadius: 4, cursor: "pointer",
                background: activeViewMode === "butler" ? "rgba(255,166,2,0.2)" : "transparent",
                color: activeViewMode === "butler" ? "var(--accent-orange)" : "var(--fg3)",
                fontSize: 12, display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s"
              }}><VscServer /> Butler</button>
            </div>
          </div>
        </div>

        {/* Viewport Render (CSS 은닉 처리로 상태 보존) */}
        <div style={{ flex: 1, padding: 16, overflowY: "auto", position: "relative" }}>
          
          {selectedMachines.length === 0 && (
             <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg3)" }}>
               좌측 패널에서 제어할 기기를 선택해주세요.
             </div>
          )}

          {selectedMachines.length > 0 && (
            <>
              {/* Butler Mode */}
              <div style={{ display: activeViewMode === "butler" ? "block" : "none", width: "100%", height: "100%" }}>
                <ButlerView />
              </div>

              {/* Town Mode */}
              <div style={{ display: activeViewMode === "town" ? "block" : "none", width: "100%", height: "100%" }}>
                {/* TownView re-renders based on machineIds, but we keep it mounted */}
                <TownView machineIds={selectedMachines} />
              </div>

              {/* Dev Mode Grid */}
              <div style={{ display: activeViewMode === "dev" ? "flex" : "none", flexWrap: "wrap", gap: 16, alignContent: "flex-start", width: "100%", height: "100%" }}>
                {selectedMachines.map(machineName => {
                  const mode = machineViewModes[machineName] || "split";
                  const widthPct = selectedMachines.length === 1 ? "100%" : selectedMachines.length === 2 ? "calc(50% - 8px)" : "calc(33.333% - 11px)";
                  return (
                    <div key={machineName} style={{ 
                      width: widthPct, height: "500px", display: "flex", flexDirection: "column",
                      background: "#1a1a1a", borderRadius: 8, border: "1px solid var(--border-default)", overflow: "hidden"
                    }}>
                      <div style={{ padding: "8px 12px", background: "#111", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-orange)" }}>{machineName}</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => setNodeViewMode(machineName, "terminal")} style={{ background: mode === "terminal" ? "var(--border-strong)" : "transparent", border: "none", color: "var(--fg1)", cursor: "pointer", padding: "4px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><VscTerminal /> Term</button>
                          <button onClick={() => setNodeViewMode(machineName, "explorer")} style={{ background: mode === "explorer" ? "var(--border-strong)" : "transparent", border: "none", color: "var(--fg1)", cursor: "pointer", padding: "4px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}><VscFiles /> Files</button>
                          <button onClick={() => setNodeViewMode(machineName, "split")} style={{ background: mode === "split" ? "var(--border-strong)" : "transparent", border: "none", color: "var(--fg1)", cursor: "pointer", padding: "4px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>Split</button>
                        </div>
                      </div>
                      <div style={{ flex: 1, position: "relative", display: "flex" }}>
                        <div style={{ display: mode === "split" || mode === "explorer" ? "block" : "none", flex: mode === "split" ? "0 0 35%" : 1, borderRight: "1px solid var(--border-default)" }}>
                          <RemoteFileExplorer machineId={machineName} />
                        </div>
                        <div style={{ display: mode === "split" || mode === "terminal" ? "block" : "none", flex: "1 1 0%" }}>
                          <RemoteTerminal machineId={machineName} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. RIGHT PANEL: AI Chat Window (350px) */}
      <div style={{ width: "350px", borderLeft: "1px solid var(--border-default)", background: "#111", display: "flex", flexDirection: "column" }}>
        
        {/* Chat Header */}
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 8, color: "var(--fg1)", fontWeight: "bold" }}>
          <VscCommentDiscussion style={{ fontSize: 18 }} /> AI Console
        </div>

        {/* Message List */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.sender === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>
                {msg.sender === "user" ? "You" : "AI"}
              </div>
              <div style={{
                background: msg.sender === "user" ? "rgba(255, 166, 2, 0.15)" : "#222",
                color: msg.sender === "user" ? "var(--accent-orange)" : "var(--fg1)",
                border: msg.sender === "user" ? "1px solid rgba(255,166,2,0.3)" : "1px solid #333",
                padding: "8px 12px",
                borderRadius: 8,
                maxWidth: "95%",
                fontSize: 13,
                lineHeight: "1.4"
              }}>
                {msg.text}
              </div>
              {/* Optional Inline Widget render in Chat */}
              {msg.widget && (
                <div style={{ marginTop: 8, zoom: 0.8, alignSelf: "flex-start", width: "100%" }}>
                  {(() => {
                    const Component = WIDGETS[msg.widget.type];
                    return Component ? <Component {...msg.widget.props} /> : null;
                  })()}
                </div>
              )}
            </div>
          ))}
          {isTyping && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", opacity: 0.6 }}>
              <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>AI</div>
              <div style={{ background: "#222", color: "var(--fg1)", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
                명령을 분석 중입니다...
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div style={{ padding: "16px", borderTop: "1px solid var(--border-default)", background: "#0a0a0a" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input 
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
              placeholder="상태 띄워줘, 로그 분석해..."
              style={{
                flex: 1,
                background: "#222",
                border: "1px solid var(--border-strong)",
                color: "var(--fg1)",
                padding: "10px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontSize: 13
              }}
            />
            <button 
              onClick={handleSendChat}
              style={{
                background: "var(--accent-orange)",
                border: "none",
                color: "#000",
                padding: "0 16px",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <VscSend />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
