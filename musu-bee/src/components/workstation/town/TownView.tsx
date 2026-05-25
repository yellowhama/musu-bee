"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { VscSettingsGear, VscAdd, VscTrash, VscPlay } from "react-icons/vsc";
import { WIDGETS, WidgetPayload, WidgetType } from "./widgets/WidgetRegistry";

interface TownViewProps {
  machineIds: string[];
}

interface Point {
  x: number;
  y: number;
}

export type ModelType = 'gemini' | 'claude' | 'codex' | 'grok' | 'local';

export interface AgentProfile {
  id: string;
  name: string;
  modelType: ModelType;
  machineId: string;
  role: string;
  systemPrompt: string;
  avatar: string;
  color: string;
}

// Default presets
const PRESETS: Record<ModelType, Omit<AgentProfile, "id" | "machineId" | "name">> = {
  gemini: {
    modelType: "gemini",
    role: "Generalist / Orchestrator",
    systemPrompt: "You are an expert orchestrator that delegates tasks...",
    avatar: "/agents/gemini.png",
    color: "#6d28d9"
  },
  claude: {
    modelType: "claude",
    role: "Analyst / Code Reviewer",
    systemPrompt: "You are an extremely thorough code reviewer and logic analyst...",
    avatar: "/agents/claude.png",
    color: "#d97706"
  },
  codex: {
    modelType: "codex",
    role: "Code Generator",
    systemPrompt: "You are a fast code generator. Write clean and precise code...",
    avatar: "/agents/codex.png",
    color: "#16a34a"
  },
  grok: {
    modelType: "grok",
    role: "System Hacker",
    systemPrompt: "You are an edgy hacker analyzing system logs for vulnerabilities...",
    avatar: "/agents/grok.png",
    color: "#2563eb"
  },
  local: {
    modelType: "local",
    role: "Private Worker",
    systemPrompt: "You are a private LLM executing highly sensitive offline tasks...",
    avatar: "/agents/local.png",
    color: "#4b5563"
  }
};

const TILE_SIZE = 48; // 48px per tile

export default function TownView({ machineIds }: TownViewProps) {
  // Agent State
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null);

  // Position & Dynamic UI state
  const [positions, setPositions] = useState<Record<string, { pos: Point, status: string }>>({});
  const [activeWidgets, setActiveWidgets] = useState<Record<string, WidgetPayload | null>>({});

  // Desks
  const desks = machineIds.map((m, i) => ({
    id: `desk-${m}`,
    machineId: m,
    x: 2 + (i % 3) * 4,
    y: 2 + Math.floor(i / 3) * 4,
  }));

  // Initialize default agents
  useEffect(() => {
    if (agents.length === 0 && machineIds.length > 0) {
      const initialAgents: AgentProfile[] = machineIds.map((m, i) => {
        const types: ModelType[] = ["gemini", "claude", "codex", "grok", "local"];
        const t = types[i % types.length];
        const preset = PRESETS[t];
        return {
          id: `agent-${Date.now()}-${i}`,
          machineId: m,
          name: `${t.toUpperCase()} Alpha`,
          ...preset
        };
      });
      setAgents(initialAgents);

      const initialPos: Record<string, { pos: Point, status: string }> = {};
      initialAgents.forEach((a, i) => {
        initialPos[a.id] = { pos: { x: 0, y: i }, status: "Idle" };
      });
      setPositions(initialPos);
    }
  }, [machineIds, agents.length]);

  // Walk to desk
  useEffect(() => {
    if (agents.length === 0) return;
    const timer = setTimeout(() => {
      setPositions(prev => {
        const next = { ...prev };
        agents.forEach((a) => {
          const desk = desks.find(d => d.machineId === a.machineId);
          if (desk) {
            next[a.id] = { pos: { x: desk.x, y: desk.y + 1 }, status: "Working..." };
          }
        });
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [agents, desks]);

  const handleUpdateAgent = (updated: AgentProfile) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a));
    setEditingAgent(null);
  };

  const handleChangePreset = (agent: AgentProfile, type: ModelType) => {
    const preset = PRESETS[type];
    const updated = {
      ...agent,
      ...preset,
      name: `${type.toUpperCase()} Worker`
    };
    setEditingAgent(updated);
  };

  // --- SHOWROOM DEBUG ACTIONS ---
  const handleShowWidget = (agentId: string, payload: WidgetPayload) => {
    setActiveWidgets(prev => ({ ...prev, [agentId]: payload }));
    // Auto-clear widget after 5 seconds for demo
    setTimeout(() => {
      setActiveWidgets(prev => ({ ...prev, [agentId]: null }));
    }, 5000);
  };

  const triggerDemoEvent = (type: WidgetType) => {
    if (agents.length === 0) return;
    // Pick random agent
    const agent = agents[Math.floor(Math.random() * agents.length)];
    
    if (type === "ServerHealth") {
      handleShowWidget(agent.id, { type: "ServerHealth", props: { cpu: 85, memory: 1800, status: "OK" }});
    } else if (type === "ProgressCircle") {
      handleShowWidget(agent.id, { type: "ProgressCircle", props: { progress: 65, taskName: "Building Docker Image" }});
    } else if (type === "TerminalLog") {
      handleShowWidget(agent.id, { type: "TerminalLog", props: { log: "Error parsing syntax at line 42\\nModule not found: react-dom", level: "error" }});
    }
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", gap: 16 }}>
      {/* 2D Town Map */}
      <div style={{
        flex: 1, 
        background: "#251714",
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        fontFamily: "'Space Mono', monospace"
      }}>
        {/* Floor Grid */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: `
            linear-gradient(45deg, #1d1210 25%, transparent 25%, transparent 75%, #1d1210 75%, #1d1210),
            linear-gradient(45deg, #1d1210 25%, transparent 25%, transparent 75%, #1d1210 75%, #1d1210)
          `,
          backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
          backgroundPosition: `0 0, ${TILE_SIZE/2}px ${TILE_SIZE/2}px`,
          opacity: 0.5
        }} />

        {/* Desks */}
        {desks.map(desk => (
          <div key={desk.id} style={{
            position: "absolute",
            left: desk.x * TILE_SIZE,
            top: desk.y * TILE_SIZE,
            width: TILE_SIZE * 2,
            height: TILE_SIZE,
            background: "#4a3525",
            border: "2px solid #2d2015",
            borderRadius: 4,
            boxShadow: "4px 4px 0 rgba(0,0,0,0.3)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg2)",
            fontSize: 10,
            zIndex: desk.y
          }}>
            <div style={{ fontSize: 16 }}>💻</div>
            <div style={{ background: "#111", padding: "2px 4px", borderRadius: 2, marginTop: 4 }}>
              {desk.machineId}
            </div>
          </div>
        ))}

        {/* Agents & Dynamic Widgets */}
        {agents.map(agent => {
          const state = positions[agent.id] || { pos: { x: 0, y: 0 }, status: "" };
          const activeWidget = activeWidgets[agent.id];
          
          return (
            <div key={agent.id} style={{
              position: "absolute",
              left: state.pos.x * TILE_SIZE,
              top: state.pos.y * TILE_SIZE,
              width: TILE_SIZE,
              height: TILE_SIZE,
              transition: "all 1s cubic-bezier(0.4, 0, 0.2, 1)",
              zIndex: state.pos.y + 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
              cursor: "pointer"
            }}
            onClick={() => setEditingAgent(agent)}
            title={`Role: ${agent.role}`}
            >
              <div style={{ 
                position: "relative", 
                width: 48, 
                height: 48, 
                filter: `drop-shadow(0 0 8px ${agent.color}88)`,
                imageRendering: "pixelated"
              }}>
                <Image src={agent.avatar} alt={agent.name} fill style={{ objectFit: "contain" }} />
              </div>

              {/* Status Bubble (Only if no widget active) */}
              {!activeWidget && state.status && (
                <div style={{
                  position: "absolute",
                  top: -30,
                  background: agent.color,
                  color: "#fff",
                  padding: "4px 8px",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.4)"
                }}>
                  {state.status}
                  <div style={{
                    position: "absolute",
                    bottom: -4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    borderWidth: "4px 4px 0",
                    borderStyle: "solid",
                    borderColor: `${agent.color} transparent transparent transparent`
                  }}/>
                </div>
              )}

              {/* Generative UI Widget Overlay */}
              {activeWidget && (
                <div style={{
                  position: "absolute",
                  bottom: 60, // Float above head
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 999
                }}>
                  {(() => {
                    const Component = WIDGETS[activeWidget.type];
                    return Component ? <Component {...activeWidget.props} /> : null;
                  })()}
                </div>
              )}
            </div>
          );
        })}
        
        {/* Mode Overlay Badge */}
        <div style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          background: "rgba(255, 166, 2, 0.2)",
          color: "#FFA602",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #FFA602",
          fontSize: 12,
          fontWeight: "bold",
          pointerEvents: "none"
        }}>
          ✨ AI TOWN MODE
        </div>

        {/* DEMO SHOWROOM CONTROLS */}
        <div style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          background: "rgba(0, 0, 0, 0.6)",
          padding: "8px",
          borderRadius: 8,
          border: "1px solid var(--border-default)",
          display: "flex",
          gap: 8,
          zIndex: 100
        }}>
          <button onClick={() => triggerDemoEvent("ServerHealth")} style={btnStyle}>📊 Trigger Health UI</button>
          <button onClick={() => triggerDemoEvent("ProgressCircle")} style={btnStyle}>⏳ Trigger Progress UI</button>
          <button onClick={() => triggerDemoEvent("TerminalLog")} style={btnStyle}>⚠️ Trigger Log UI</button>
        </div>

      </div>

      {/* Agent Roster / Configuration Sidebar */}
      <div style={{
        width: 300,
        background: "#111",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Space Mono', monospace"
      }}>
        <div style={{ padding: "12px", borderBottom: "1px solid var(--border-default)", fontWeight: "bold", color: "var(--fg1)", display: "flex", alignItems: "center", gap: 8 }}>
          <VscSettingsGear /> AGENT ROSTER
        </div>

        {editingAgent ? (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "var(--accent-orange)" }}>Edit Agent</h3>
            
            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 4 }}>Model Preset</label>
              <select 
                value={editingAgent.modelType}
                onChange={(e) => handleChangePreset(editingAgent, e.target.value as ModelType)}
                style={{ width: "100%", padding: 6, background: "#222", border: "1px solid var(--border-strong)", color: "var(--fg1)", borderRadius: 4 }}
              >
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="grok">Grok</option>
                <option value="local">Local</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 4 }}>Name</label>
              <input 
                type="text" 
                value={editingAgent.name}
                onChange={(e) => setEditingAgent({...editingAgent, name: e.target.value})}
                style={{ width: "100%", padding: 6, background: "#222", border: "1px solid var(--border-strong)", color: "var(--fg1)", borderRadius: 4 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 4 }}>Role</label>
              <input 
                type="text" 
                value={editingAgent.role}
                onChange={(e) => setEditingAgent({...editingAgent, role: e.target.value})}
                style={{ width: "100%", padding: 6, background: "#222", border: "1px solid var(--border-strong)", color: "var(--fg1)", borderRadius: 4 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 4 }}>System Prompt</label>
              <textarea 
                value={editingAgent.systemPrompt}
                onChange={(e) => setEditingAgent({...editingAgent, systemPrompt: e.target.value})}
                style={{ width: "100%", padding: 6, background: "#222", border: "1px solid var(--border-strong)", color: "var(--fg1)", borderRadius: 4, height: 100, resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button 
                onClick={() => handleUpdateAgent(editingAgent)}
                style={{ flex: 1, padding: "8px", background: "var(--accent-orange)", border: "none", color: "#000", fontWeight: "bold", borderRadius: 4, cursor: "pointer" }}
              >
                Save
              </button>
              <button 
                onClick={() => setEditingAgent(null)}
                style={{ flex: 1, padding: "8px", background: "transparent", border: "1px solid var(--border-strong)", color: "var(--fg2)", borderRadius: 4, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {agents.map(a => (
              <div 
                key={a.id} 
                onClick={() => setEditingAgent(a)}
                style={{ 
                  display: "flex", alignItems: "center", gap: 12, padding: 8, 
                  background: "#1a1a1a", border: `1px solid ${a.color}55`, borderRadius: 6,
                  cursor: "pointer", transition: "all 0.2s"
                }}
              >
                <div style={{ width: 32, height: 32, position: "relative", imageRendering: "pixelated" }}>
                  <Image src={a.avatar} alt={a.name} fill style={{ objectFit: "contain" }} />
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: "bold", color: "var(--fg1)" }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.role}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#333",
  color: "var(--fg1)",
  border: "1px solid #444",
  padding: "4px 8px",
  borderRadius: 4,
  fontSize: 10,
  cursor: "pointer",
  fontWeight: "bold",
  display: "flex",
  alignItems: "center",
  gap: 4
};
