"use client";

import { useState } from "react";

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "active" | "paused" | "error" | string;
  model?: string;
  company_id?: string | null;
}

export const CANONICAL_TEAM_SIZE = 12; // max display slots

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "qwen-9b",
  "qwen-14b",
];

const AGENT_DOT: Record<string, string> = {
  active: "#22c55e",
  paused: "rgba(253,251,247,0.2)",
  error: "#ff6b6b",
};

const STATUS_LABEL: Record<string, string> = {
  active: "active",
  paused: "idle",
  error: "error",
};

interface AgentGridProps {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  onAgentUpdated?: (agentId: string, patch: Partial<Agent>) => void;
}

interface EditState {
  agentId: string;
  role: string;
  model: string;
  saving: boolean;
  error: string | null;
}

/** Extract short label from agent name: "abc12345-engineer" → "Engineer", "ceo" → "CEO" */
function agentLabel(name: string): string {
  const base = name.includes("-") ? name.split("-").pop()! : name;
  return base.length <= 3 ? base.toUpperCase() : base.charAt(0).toUpperCase() + base.slice(1);
}

export function AgentGrid({ agents, loading, error, onAgentUpdated }: AgentGridProps) {
  const [editing, setEditing] = useState<EditState | null>(null);

  // Deduplicate by name, prefer active
  const seen = new Map<string, Agent>();
  for (const a of agents) {
    const key = a.name.toLowerCase();
    if (!seen.has(key) || a.status === "active") seen.set(key, a);
  }
  const displayAgents = [...seen.values()].slice(0, CANONICAL_TEAM_SIZE);

  async function saveEdit(agentId: string) {
    if (!editing) return;
    setEditing({ ...editing, saving: true, error: null });
    try {
      const res = await fetch(`/api/bridge/agents/${encodeURIComponent(agentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editing.role || undefined,
          model: editing.model || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { detail?: string }).detail ?? `HTTP ${res.status}`;
        setEditing({ ...editing, saving: false, error: msg });
        return;
      }
      onAgentUpdated?.(agentId, {
        role: editing.role || undefined,
        model: editing.model || undefined,
      });
      setEditing(null);
    } catch {
      setEditing({ ...editing, saving: false, error: "Network error" });
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "8px",
      }}
    >
      {displayAgents.length === 0 && !loading && !error && (
        <div style={{ gridColumn: "1 / -1", fontSize: "11px", color: "rgba(253,251,247,0.3)", padding: "8px 0" }}>
          No agents registered
        </div>
      )}
      {displayAgents.map((agent) => {
        const status = loading ? "paused" : agent.status;
        const model = agent.model;
        const agentId = agent.id;
        const label = agentLabel(agent.name);
        const isEditing = editing?.agentId === agent.id;
        const isScoped = !!agent.company_id;

        return (
          <div
            key={agent.id}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: isEditing
                ? "1px solid rgba(255,166,2,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
              borderRadius: "10px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              position: "relative",
            }}
          >
            {/* Header row: dot + label + scope badge + edit button */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: AGENT_DOT[status] ?? "rgba(253,252,240,0.2)",
                  flexShrink: 0,
                  animation:
                    status === "active"
                      ? "musu-status-pulse 1.5s ease-in-out infinite"
                      : undefined,
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#FDFBF7",
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                {label}
              </span>
              {isScoped && (
                <span style={{ fontSize: "9px", color: "rgba(255,166,2,0.5)", fontWeight: 600 }}>
                  CO
                </span>
              )}
              {!isEditing && (
                <button
                  onClick={() =>
                    setEditing({
                      agentId: agent.id,
                      role: agent.role,
                      model: model ?? "",
                      saving: false,
                      error: null,
                    })
                  }
                  title="Edit"
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "rgba(253,251,247,0.25)",
                    cursor: "pointer",
                    fontSize: "11px",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  ✏
                </button>
              )}
            </div>

            {/* Status label */}
            <span
              style={{
                fontSize: "10px",
                color: "rgba(253,251,247,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {STATUS_LABEL[status] ?? status}
            </span>

            {/* Model badge (view mode only) */}
            {model && !isEditing && (
              <span
                style={{
                  fontSize: "10px",
                  color: "rgba(253,251,247,0.4)",
                  fontFamily: "var(--font-jetbrains), monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {model}
              </span>
            )}

            {/* Edit form */}
            {isEditing && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginTop: "4px",
                }}
              >
                <input
                  autoFocus
                  placeholder="Role"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "5px",
                    color: "#FDFBF7",
                    fontSize: "11px",
                    padding: "4px 8px",
                    fontFamily: "inherit",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <select
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  style={{
                    background: "#432c1c",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "5px",
                    color: "#FDFBF7",
                    fontSize: "11px",
                    padding: "4px 8px",
                    fontFamily: "var(--font-jetbrains), monospace",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer",
                  }}
                >
                  <option value="">— model —</option>
                  {MODELS.map((m) => (
                    <option key={m} value={m} style={{ background: "#432c1c" }}>
                      {m}
                    </option>
                  ))}
                </select>

                {editing.error && (
                  <span style={{ fontSize: "10px", color: "#ff6b6b" }}>
                    {editing.error}
                  </span>
                )}

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    disabled={editing.saving}
                    onClick={() => void saveEdit(agentId)}
                    style={{
                      flex: 1,
                      background: "rgba(255,166,2,0.1)",
                      border: "1px solid rgba(255,166,2,0.3)",
                      borderRadius: "5px",
                      color: "#FFA602",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: editing.saving ? "wait" : "pointer",
                      padding: "4px 0",
                      fontFamily: "inherit",
                    }}
                  >
                    {editing.saving ? "…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "5px",
                      color: "rgba(253,251,247,0.5)",
                      fontSize: "11px",
                      cursor: "pointer",
                      padding: "4px 0",
                      fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && (
        <div
          style={{
            gridColumn: "1 / -1",
            fontSize: "11px",
            color: "#ff6b6b",
            padding: "8px 12px",
            background: "rgba(255,107,107,0.07)",
            borderRadius: "7px",
            border: "1px solid rgba(255,107,107,0.2)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
