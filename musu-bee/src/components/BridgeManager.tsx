"use client";

import { useCallback, useState } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

interface BridgeHealth {
  status: string;
  version?: string;
}

export default function BridgeManager() {
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      // Use the proxy route to hit the local bridge health
      const res = await fetch("/api/bridge/health", { signal });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    }
  }, []);

  useLowDutyPolling(fetchHealth, {
    intervalMs: 15_000,
    maxBackoffMs: 60_000,
  });

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateMsg(null);
    try {
      const res = await fetch("/api/bridge/system/update", {
        method: "POST",
      });
      if (res.ok) {
        setUpdateMsg({ ok: true, text: "Update started. The bridge will restart." });
      } else {
        const data = await res.json().catch(() => ({}));
        setUpdateMsg({ ok: false, text: data.error || "Update failed." });
      }
    } catch {
      setUpdateMsg({ ok: false, text: "Cannot reach bridge." });
    } finally {
      setIsUpdating(false);
    }
  };

  const copyInstallCommand = () => {
    const cmd = "irm https://musu.pro/install.ps1 | iex";
    navigator.clipboard.writeText(cmd);
    setUpdateMsg({ ok: true, text: "Copied to clipboard!" });
    setTimeout(() => setUpdateMsg(null), 3000);
  };

  return (
    <div style={{ padding: "0 4px", marginBottom: 20 }}>
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
          System Manager
        </span>
      </div>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid #242424",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: health ? "var(--status-online)" : "var(--fg4)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: "var(--fg1)", fontWeight: 600 }}>
            Local Bridge
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg4)" }}>
            {health ? (health.version ? `v${health.version}` : "Online") : "Offline"}
          </span>
        </div>

        {health ? (
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="btn btn-primary"
            style={{ width: "100%", fontSize: 12, padding: "6px 0" }}
          >
            {isUpdating ? "Updating..." : "Check for Updates"}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--fg3)", lineHeight: 1.4 }}>
              The bridge is required for local agent execution.
            </span>
            <button
              onClick={copyInstallCommand}
              className="btn"
              style={{ width: "100%", fontSize: 12, padding: "6px 0", background: "var(--bg-card)", color: "var(--accent)", border: "1px solid var(--accent)" }}
            >
              Copy Install Command
            </button>
          </div>
        )}

        {updateMsg && (
          <div
            style={{
              fontSize: 11,
              color: updateMsg.ok ? "var(--status-online)" : "var(--status-error)",
              textAlign: "center",
            }}
          >
            {updateMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
