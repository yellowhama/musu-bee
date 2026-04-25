"use client";

import { useState } from "react";

const BRIDGE_URL = process.env.NEXT_PUBLIC_MUSU_BRIDGE_URL || "http://localhost:8070";

export default function ScreenPage() {
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [vncUrl, setVncUrl] = useState<string | null>(null);

  const launch = async () => {
    setStatus("starting");
    setError(null);

    try {
      // 1. Start VNC on bridge
      const startRes = await fetch(`${BRIDGE_URL}/api/screen/vnc/start`, {
        method: "POST",
        cache: "no-store",
      });
      const startBody = await startRes.json();

      if (!startRes.ok) {
        setError(startBody.detail || startBody.error || "Failed to start VNC");
        setStatus("error");
        return;
      }

      if (!startBody.running) {
        setError("VNC started but exited immediately. Likely no display available. Check if Xvfb is installed: sudo apt install xvfb");
        setStatus("error");
        return;
      }

      // 2. Get one-time token
      const tokenRes = await fetch(`${BRIDGE_URL}/api/screen/vnc/token`);
      const tokenBody = await tokenRes.json();

      if (!tokenBody.token || !tokenBody.launcher_path) {
        setError("Failed to get VNC token");
        setStatus("error");
        return;
      }

      // 3. Open launcher in new tab
      const url = `${BRIDGE_URL}${tokenBody.launcher_path}`;
      setVncUrl(url);
      window.open(url, "_blank");
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setStatus("error");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--fg1)",
        fontFamily: "var(--font-ui)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "var(--bg-card)",
          border: "2px solid var(--border-default)",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "var(--neo-shadow-sm)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Remote Screen</h1>
        <p style={{ fontSize: 13, color: "var(--fg2)", marginTop: 8 }}>
          View and control this machine&apos;s desktop via VNC.
        </p>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "var(--status-error-bg)",
              border: "1px solid var(--status-error)",
              borderRadius: 8,
              color: "var(--status-error)",
              fontSize: 12,
              textAlign: "left",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={launch}
          disabled={status === "starting"}
          style={{
            marginTop: 20,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            background: status === "starting" ? "var(--fg4)" : "var(--musu-color-brand-accent)",
            color: status === "starting" ? "var(--fg3)" : "var(--musu-color-brand-ink)",
            cursor: status === "starting" ? "wait" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {status === "starting" ? "Starting VNC..." : status === "ready" ? "Launch Again" : "Launch Remote Desktop"}
        </button>

        {vncUrl && status === "ready" && (
          <div style={{ marginTop: 16, fontSize: 11, color: "var(--fg3)" }}>
            VNC viewer opened in new tab.
            <br />
            <a
              href={vncUrl}
              target="_blank"
              rel="noopener"
              style={{ color: "var(--musu-color-brand-accent)", textDecoration: "underline" }}
            >
              Click here if tab didn&apos;t open
            </a>
            <br />
            <span style={{ opacity: 0.5 }}>Token expires in 60s.</span>
          </div>
        )}
      </div>
    </div>
  );
}
