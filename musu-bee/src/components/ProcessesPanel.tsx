"use client";

import { useState, useCallback } from "react";
import { useProcesses, type ProcessInfo, type ProcessStartRequest } from "@/lib/useProcesses";
import { useDeviceDiscovery } from "@/lib/useDeviceDiscovery";

// ─── Styles (matching TasksPanel dark theme) ───────────────────────────────

const SELECT_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  background: "#1a1a1a",
  border: "1px solid #2d2d2d",
  borderRadius: 6,
  padding: "3px 8px",
  cursor: "pointer",
  outline: "none",
};

const BTN_BASE: React.CSSProperties = {
  fontSize: 11,
  border: "none",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  fontWeight: 500,
};

const STATUS_COLOR: Record<string, string> = {
  running: "#22c55e",
  sleeping: "#6b7280",
  stopped: "#f59e0b",
  zombie: "#ef4444",
  idle: "#6b7280",
};

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb.toFixed(0)}MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Start Process Form ────────────────────────────────────────────────────

interface StartFormProps {
  deviceId: string;
  onStart: (req: ProcessStartRequest) => Promise<{ pid: number; name: string }>;
  onCancel: () => void;
}

function StartProcessForm({ deviceId, onStart, onCancel }: StartFormProps) {
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onStart({
        command: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        cwd: cwd.trim() || undefined,
        device_id: deviceId,
      });
      setCommand("");
      setArgs("");
      setCwd("");
      onCancel();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 6,
    padding: "4px 8px",
    color: "#e5e7eb",
    width: "100%",
    outline: "none",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#111",
        border: "1px solid #2d2d2d",
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
        Start Process
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          style={inputStyle}
          placeholder="Command (e.g. python3)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          autoFocus
        />
        <input
          style={inputStyle}
          placeholder="Arguments (e.g. bot.py --headless)"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Working directory (optional)"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
        />
      </div>
      {err && (
        <div style={{ color: "#ef4444", fontSize: 11, marginTop: 6 }}>{err}</div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="submit"
          disabled={submitting || !command.trim()}
          style={{ ...BTN_BASE, background: "#22c55e", color: "#000" }}
        >
          {submitting ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ ...BTN_BASE, background: "#2d2d2d", color: "#9ca3af" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Kill Confirm Dialog ───────────────────────────────────────────────────

interface KillConfirmProps {
  proc: ProcessInfo;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}

function KillConfirmDialog({ proc, onConfirm, onCancel }: KillConfirmProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid #2d2d2d",
          borderRadius: 10,
          padding: 20,
          maxWidth: 380,
          width: "90%",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Kill Process?</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
          <strong style={{ color: "#e5e7eb" }}>{proc.name}</strong> (PID {proc.pid})
          <br />
          <span style={{ fontFamily: "monospace", fontSize: 11 }}>{proc.cmdline}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onConfirm(false)}
            style={{ ...BTN_BASE, background: "#f59e0b", color: "#000" }}
          >
            SIGTERM (graceful)
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={{ ...BTN_BASE, background: "#ef4444", color: "#fff" }}
          >
            SIGKILL (force)
          </button>
          <button
            onClick={onCancel}
            style={{ ...BTN_BASE, background: "#2d2d2d", color: "#9ca3af" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export default function ProcessesPanel() {
  const { devices } = useDeviceDiscovery();
  const [selectedDevice, setSelectedDevice] = useState("local");
  const [nameFilter, setNameFilter] = useState("");
  const [showStartForm, setShowStartForm] = useState(false);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);
  const [killError, setKillError] = useState<string | null>(null);

  const { processes, loading, error, refresh, killProcess, startProcess } = useProcesses(
    selectedDevice,
    nameFilter || undefined,
  );

  const handleKillConfirm = useCallback(
    async (force: boolean) => {
      if (!killTarget) return;
      setKillError(null);
      try {
        await killProcess(killTarget.pid, killTarget.device_id, force);
      } catch (e) {
        setKillError(String(e));
      } finally {
        setKillTarget(null);
      }
    },
    [killTarget, killProcess],
  );

  const deviceOptions = [
    { id: "local", label: "This Machine" },
    ...devices
      .filter((d) => d.isRemote && d.peerUrl)
      .map((d) => {
        // Extract host from peerUrl (e.g. http://100.x.x.x:1355 → 100.x.x.x)
        let host = d.id;
        try {
          host = new URL(d.peerUrl!).hostname;
        } catch {
          // fallback to device id
        }
        return { id: host, label: d.name };
      }),
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 16,
        overflowY: "auto",
        fontSize: 12,
        color: "#e5e7eb",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>Processes</span>

        {/* Device picker */}
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          style={SELECT_STYLE}
        >
          {deviceOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>

        {/* Name filter */}
        <input
          type="text"
          placeholder="Filter by name…"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          style={{
            fontSize: 11,
            color: "#9ca3af",
            background: "#1a1a1a",
            border: "1px solid #2d2d2d",
            borderRadius: 6,
            padding: "3px 8px",
            outline: "none",
            width: 130,
          }}
        />

        {/* Refresh */}
        <button
          onClick={refresh}
          style={{ ...BTN_BASE, background: "#2d2d2d", color: "#9ca3af", marginLeft: "auto" }}
        >
          ↻ Refresh
        </button>

        {/* Start */}
        <button
          onClick={() => setShowStartForm((v) => !v)}
          style={{ ...BTN_BASE, background: "#22c55e", color: "#000" }}
        >
          + Start
        </button>
      </div>

      {/* Start form */}
      {showStartForm && (
        <StartProcessForm
          deviceId={selectedDevice}
          onStart={startProcess}
          onCancel={() => setShowStartForm(false)}
        />
      )}

      {/* Kill error */}
      {killError && (
        <div
          style={{
            background: "#2d1111",
            border: "1px solid #ef4444",
            borderRadius: 6,
            padding: "6px 10px",
            marginBottom: 8,
            fontSize: 11,
            color: "#ef4444",
          }}
        >
          Kill failed: {killError}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && processes.length === 0 && (
        <div style={{ color: "#6b7280", fontSize: 12 }}>Loading processes…</div>
      )}

      {/* Empty state */}
      {!loading && !error && processes.length === 0 && (
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          No processes found{nameFilter ? ` matching "${nameFilter}"` : ""}.
        </div>
      )}

      {/* Process table */}
      {processes.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 11,
            }}
          >
            <thead>
              <tr style={{ color: "#6b7280", borderBottom: "1px solid #2d2d2d" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Name</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>PID</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>CPU%</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>Mem</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>Started</th>
                <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 500 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((proc) => (
                <tr
                  key={`${proc.device_id}-${proc.pid}`}
                  style={{ borderBottom: "1px solid #1f1f1f" }}
                >
                  <td
                    style={{ padding: "4px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={proc.cmdline}
                  >
                    {proc.name}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right", color: "#6b7280" }}>
                    {proc.pid}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>
                    {proc.cpu_percent.toFixed(1)}%
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>
                    {formatMem(proc.memory_mb)}
                  </td>
                  <td style={{ padding: "4px 8px" }}>
                    <span
                      style={{
                        color: STATUS_COLOR[proc.status] ?? "#6b7280",
                        fontWeight: 500,
                      }}
                    >
                      {proc.status}
                    </span>
                  </td>
                  <td style={{ padding: "4px 8px", color: "#6b7280" }}>
                    {formatDate(proc.started_at)}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>
                    <button
                      onClick={() => setKillTarget(proc)}
                      style={{ ...BTN_BASE, background: "#2d1111", color: "#ef4444" }}
                    >
                      Kill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ color: "#4b5563", fontSize: 10, marginTop: 6, textAlign: "right" }}>
            {processes.length} process{processes.length !== 1 ? "es" : ""} · auto-refresh 5s
          </div>
        </div>
      )}

      {/* Kill confirm dialog */}
      {killTarget && (
        <KillConfirmDialog
          proc={killTarget}
          onConfirm={handleKillConfirm}
          onCancel={() => setKillTarget(null)}
        />
      )}
    </div>
  );
}
