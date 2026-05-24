"use client";

// V23.4 T2-C — Fleet view (per wiki/434 rev-2).
//
// Single-file client component (OQ-CRIT-3, Critic C-T2C-6): inline StatusDot,
// Bar, PcCapacityCard, AddPcWizard + main FleetPage. Mirrors the single-file
// convention of `/c/[id]/page.tsx` (250 LOC) and `/m/[id]/page.tsx` (309 LOC).
//
// Vocab discipline (no K8s leakage; see [[feedback-no-yagni-architecture]]):
//   musu uses PC + peer + workflow + capacity + pairing.
//   Do NOT introduce K8s nouns here (see vocabulary-audit.ts for the
//   banned-pattern list).
//
// Data source: bridge `GET /api/machines` returns `{ machines: [...], count }`
// where each machine has `{ id, hostname, os, arch, status, last_seen_at,
// capacity: {gpu_vram_total_gb, gpu_vram_free_gb, mem_total_gb, mem_free_gb,
// cpu_cores, cpu_idle_pct, ...} | null, inflight_requests: int }`. Note the
// musu-bridge axis_routes.py shape uses *_gb, NOT *_mb as the spec body
// loosely indicated — ground-truth wins (see Builder FINDINGS).
//
// Refresh: 5s setInterval + single EventSource on `machines` table (OQ-CRIT-4
// drops `machine_capacity` SSE; polling covers slow-moving capacity). The
// alive-guard inside useEffect prevents setState after unmount (C-T2C-4),
// mirroring /m/[id]/page.tsx:106,113-115.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BRIDGE_URL = process.env.NEXT_PUBLIC_MUSU_BRIDGE_URL || "http://localhost:8070";
const REFRESH_INTERVAL = 5_000;

// ---- Types ----------------------------------------------------------------

interface FleetCapacity {
  gpu_models: string[];
  gpu_vram_total_gb: number;
  gpu_vram_free_gb: number;
  cpu_cores: number;
  cpu_idle_pct: number;
  mem_total_gb: number;
  mem_free_gb: number;
  runtime_classes: string[];
  last_heartbeat_at: string | null;
}

interface FleetMachine {
  id: string;
  hostname: string;
  os: string;
  arch: string;
  status: string; // "online" | "offline" | "stale" | etc — bridge-authoritative
  last_seen_at: string | null;
  capacity: FleetCapacity | null;
  inflight_requests: number;
}

interface MachinesListResponse {
  machines: FleetMachine[];
  count: number;
}

interface AgentSummary {
  id: string;
  name: string;
}

// ---- Inline primitives (StatusDot, Bar) -----------------------------------

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" || status === "running" || status === "bound"
      ? "var(--status-online)"
      : status === "draining" || status === "pending" || status === "stale"
        ? "var(--status-warn)"
        : "var(--status-error)";
  return (
    <span
      aria-label={`status-${status}`}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
        boxShadow: `0 0 6px ${color}40`,
      }}
    />
  );
}

function Bar({
  label,
  used,
  total,
  unit,
}: {
  label: string;
  used: number;
  total: number;
  unit: string;
}) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--fg2)",
        }}
      >
        <span>{label}</span>
        <span>
          {used.toFixed(1)} / {total.toFixed(1)} {unit} ({pct}%)
        </span>
      </div>
      <div
        style={{
          height: 5,
          background: "var(--border-default)",
          borderRadius: 3,
          overflow: "hidden",
          marginTop: 3,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background:
              pct > 90
                ? "var(--status-error)"
                : pct > 60
                  ? "var(--status-warn)"
                  : "var(--status-online)",
            transition: "width 200ms",
          }}
        />
      </div>
    </div>
  );
}

// ---- PcCapacityCard -------------------------------------------------------

function PcCapacityCard({ machine }: { machine: FleetMachine }) {
  const router = useRouter();
  const cap = machine.capacity;
  const gpuUsed = cap ? cap.gpu_vram_total_gb - cap.gpu_vram_free_gb : 0;
  const memUsed = cap ? cap.mem_total_gb - cap.mem_free_gb : 0;
  const cpuUsedPct = cap ? Math.max(0, 100 - cap.cpu_idle_pct) : 0;

  return (
    <div
      data-testid={`pc-${machine.id}`}
      onClick={() => router.push(`/m/${machine.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/m/${machine.id}`);
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--musu-color-brand-accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <StatusDot status={machine.status} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: "var(--fg1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {machine.hostname || machine.id}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }}>
              {machine.os} · {machine.arch} · {machine.status}
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            background: "var(--accent-muted)",
            color: "var(--musu-color-brand-accent)",
            padding: "3px 8px",
            borderRadius: 4,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {machine.inflight_requests} active
        </span>
      </div>

      {cap ? (
        <div>
          {cap.gpu_vram_total_gb > 0 && (
            <Bar
              label={
                cap.gpu_models.length > 0
                  ? `GPU VRAM (${cap.gpu_models.join(", ")})`
                  : "GPU VRAM"
              }
              used={gpuUsed}
              total={cap.gpu_vram_total_gb}
              unit="GB"
            />
          )}
          <Bar label="Memory" used={memUsed} total={cap.mem_total_gb} unit="GB" />
          <Bar
            label={`CPU (${cap.cpu_cores} cores)`}
            used={cpuUsedPct}
            total={100}
            unit="%"
          />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--fg3)", padding: "8px 0" }}>
          No capacity heartbeat yet.
        </div>
      )}
    </div>
  );
}

// ---- AddPcWizard ----------------------------------------------------------

function AddPcWizard({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [agentsList, setAgentsList] = useState<AgentSummary[] | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsFallback, setAgentsFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per OQ-CRIT-2: fetch agents list on modal open. 503 → free-text fallback.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setName("");
    setUrl("");
    setAgents([]);
    setError(null);
    setAgentsLoading(true);
    setAgentsFallback(false);
    (async () => {
      try {
        const res = await fetch(`${BRIDGE_URL}/api/agents`);
        if (!alive) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Array<{ id: string; name: string }>;
        if (!alive) return;
        setAgentsList(data.map((a) => ({ id: a.id, name: a.name })));
        setAgentsFallback(false);
      } catch {
        if (!alive) return;
        setAgentsList(null);
        setAgentsFallback(true);
      } finally {
        if (alive) setAgentsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // Per F-R7 + OQ: body keys MUST be exactly ["name","url","agents"];
      // NO `version` field (server defaults it).
      const body = { name, url, agents };
      const res = await fetch(`${BRIDGE_URL}/api/admin/pair/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add PC"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#261813",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 24,
          color: "var(--fg1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
          Add a PC
        </h2>
        <p style={{ margin: 0, marginBottom: 16, fontSize: 12, color: "var(--fg3)" }}>
          Pair a new PC with this fleet. The PC must already be running a
          musu-bridge instance.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid var(--status-error)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--status-error)",
            }}
          >
            {error}
          </div>
        )}

        <label style={fieldLabel}>PC name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="workstation-1"
          disabled={submitting}
          style={fieldInput}
        />

        <label style={fieldLabel}>Bridge URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.10:8070"
          disabled={submitting}
          style={fieldInput}
        />

        <label style={fieldLabel}>Agents</label>
        {agentsLoading && (
          <div style={{ fontSize: 12, color: "var(--fg3)", padding: "6px 0" }}>
            Loading agents...
          </div>
        )}
        {!agentsLoading && agentsFallback && (
          <>
            <div
              style={{
                background: "var(--accent-tint)",
                border: "1px solid var(--status-warn)",
                borderRadius: 6,
                padding: "8px 10px",
                marginBottom: 8,
                fontSize: 12,
                color: "var(--status-warn)",
              }}
            >
              Agents list unavailable, enter comma-separated ids.
            </div>
            <input
              type="text"
              placeholder="agent-id-1, agent-id-2"
              disabled={submitting}
              onChange={(e) =>
                setAgents(
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              style={fieldInput}
            />
          </>
        )}
        {!agentsLoading && !agentsFallback && agentsList && (
          <select
            multiple
            value={agents}
            onChange={(e) =>
              setAgents(
                Array.from(e.target.selectedOptions, (o) => o.value),
              )
            }
            disabled={submitting}
            style={{ ...fieldInput, minHeight: 100, padding: 8 }}
          >
            {agentsList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id})
              </option>
            ))}
          </select>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              color: "var(--fg2)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name || !url}
            style={{
              padding: "8px 16px",
              background: "var(--musu-color-brand-accent)",
              border: "none",
              borderRadius: 6,
              color: "var(--fg-on-accent)",
              cursor: submitting || !name || !url ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 13,
              opacity: submitting || !name || !url ? 0.5 : 1,
            }}
          >
            {submitting ? "Pairing..." : "Pair PC"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- FleetPage (main) -----------------------------------------------------

export default function FleetPage() {
  const [machines, setMachines] = useState<FleetMachine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [wizardOpen, setWizardOpen] = useState(false);

  // Bump a counter to force a re-fetch on demand (e.g. after AddPcWizard success).
  const [refetchTick, setRefetchTick] = useState(0);

  useEffect(() => {
    let alive = true;

    const fetchData = async () => {
      try {
        const resp = await fetch(`${BRIDGE_URL}/api/machines`);
        if (!alive) return;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = (await resp.json()) as MachinesListResponse;
        if (!alive) return;
        setMachines(json.machines || []);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to fetch");
      }
    };

    fetchData();
    const timer = setInterval(fetchData, REFRESH_INTERVAL);

    // SINGLE EventSource on the `machines` table per OQ-CRIT-4. 5s polling
    // covers `machine_capacity` (slow-moving). Frees 1 SSE slot against
    // browser HTTP/1.1 6-connections-per-host cap.
    const es = new EventSource(
      `${BRIDGE_URL}/api/watch/subscribe?table=machines`,
    );
    es.onmessage = () => {
      if (alive) fetchData();
    };
    es.onerror = () => {
      // Browser auto-retries; polling continues. Don't crash on transient err.
    };

    return () => {
      alive = false;
      clearInterval(timer);
      es.close();
    };
  }, [refetchTick]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg1)",
        fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
        padding: "32px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg3)",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Fleet view
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 0" }}>
            Your PCs
          </h1>
          {lastUpdated && (
            <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
              Last updated: {lastUpdated} (auto-refresh{" "}
              {REFRESH_INTERVAL / 1000}s)
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            padding: "10px 18px",
            background: "var(--musu-color-brand-accent)",
            border: "none",
            borderRadius: 8,
            color: "var(--fg-on-accent)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          + Add a PC
        </button>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            background: "var(--bg-card)",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
            color: "var(--status-error)",
            fontSize: 13,
          }}
        >
          Bridge unreachable: {error}
        </div>
      )}

      {machines.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {machines.map((m) => (
            <PcCapacityCard key={m.id} machine={m} />
          ))}
        </div>
      ) : !error ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px dashed var(--border-default)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--fg3)",
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 6 }}>No PCs paired yet.</div>
          <div style={{ fontSize: 12 }}>
            Click <strong>Add a PC</strong> to pair your first PC.
          </div>
        </div>
      ) : null}

      <AddPcWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => setRefetchTick((t) => t + 1)}
      />
    </div>
  );
}

// ---- Shared inline styles -------------------------------------------------

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--fg3)",
  marginBottom: 4,
  marginTop: 8,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  color: "var(--fg1)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
