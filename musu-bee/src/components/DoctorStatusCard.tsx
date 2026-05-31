"use client";

import { useEffect, useState } from "react";
import { VscDebugStart, VscRefresh, VscWarning, VscCheck } from "react-icons/vsc";

type Level = "ok" | "warn" | "fail";

interface DoctorStatus {
  overall: Level;
  account: { status: Level; note: string; tokenPresent: boolean };
  bridge_token: { status: Level; note: string; tokenPresent: boolean };
  bridge: {
    status: Level;
    note: string;
    url: string;
    httpStatus: number | null;
    service_registry_addr: string | null;
  };
  dashboard: { status: Level; note: string; url: string };
  next_steps: string[];
}

const tone: Record<Level, { color: string; bg: string; label: string }> = {
  ok: { color: "var(--status-success)", bg: "rgba(34,197,94,0.08)", label: "OK" },
  warn: { color: "var(--status-warn)", bg: "rgba(245,158,11,0.08)", label: "WARN" },
  fail: { color: "var(--status-error)", bg: "rgba(239,68,68,0.08)", label: "FAIL" },
};

const REFRESH_INTERVAL_MS = 30_000;

function StatusPill({ status }: { status: Level }) {
  const t = tone[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        minWidth: 58,
        justifyContent: "center",
        border: `1px solid ${t.color}`,
        background: t.bg,
        color: t.color,
        borderRadius: 6,
        padding: "3px 6px",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {status === "ok" ? <VscCheck /> : <VscWarning />}
      {t.label}
    </span>
  );
}

function Row({ label, status, note }: { label: string; status: Level; note: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
      <StatusPill status={status} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--fg3)", textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--fg1)", overflowWrap: "anywhere" }}>
          {note}
        </div>
      </div>
    </div>
  );
}

export default function DoctorStatusCard() {
  const [status, setStatus] = useState<DoctorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/doctor", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as DoctorStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "doctor unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const overall = status?.overall ?? "warn";
  const t = tone[overall];

  return (
    <section
      aria-label="MUSU readiness"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${t.color}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase" }}>
            Readiness
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <StatusPill status={overall} />
            <span style={{ color: "var(--fg1)", fontSize: 13, fontWeight: 700 }}>
              {overall === "ok" ? "Ready for first task" : "Needs attention"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh"
          style={{
            width: 34,
            height: 34,
            borderRadius: 6,
            border: "1px solid var(--border-default)",
            background: "transparent",
            color: "var(--fg2)",
            cursor: loading ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <VscRefresh />
        </button>
      </div>

      {error && (
        <div style={{ color: "var(--status-error)", fontSize: 12, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {status && (
        <div style={{ display: "grid", gap: 10 }}>
          <Row label="Account" status={status.account.status} note={status.account.note} />
          <Row label="Token" status={status.bridge_token.status} note={status.bridge_token.note} />
          <Row label="Bridge" status={status.bridge.status} note={`${status.bridge.url} · ${status.bridge.note}`} />
          <Row label="Dashboard" status={status.dashboard.status} note={status.dashboard.note} />

          {status.next_steps.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                borderTop: "1px solid var(--border-default)",
                paddingTop: 10,
                flexWrap: "wrap",
              }}
            >
              <VscDebugStart style={{ color: "var(--accent-orange)" }} />
              <code style={{ fontSize: 12, color: "var(--fg1)" }}>
                {status.next_steps[0]}
              </code>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
