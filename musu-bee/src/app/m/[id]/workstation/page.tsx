"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import WebRtcViewer from "../../../../components/WebRtcViewer";
import RemoteTerminal from "../../../../components/workstation/RemoteTerminal";
import RemoteFileExplorer from "../../../../components/workstation/RemoteFileExplorer";

type Preset = "cockpit" | "focus" | "headless";

export default function WorkstationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const machineId = params?.id || "";
  
  const [preset, setPreset] = useState<Preset>("cockpit");
  const [mounted, setMounted] = useState(false);

  // Load preset from local storage
  useEffect(() => {
    const saved = localStorage.getItem(`musu-workstation-preset-${machineId}`);
    if (saved === "cockpit" || saved === "focus" || saved === "headless") {
      setPreset(saved);
    }
    setMounted(true);
  }, [machineId]);

  const changePreset = (newPreset: Preset) => {
    setPreset(newPreset);
    localStorage.setItem(`musu-workstation-preset-${machineId}`, newPreset);
  };

  if (!mounted) return null; // Avoid hydration mismatch

  return (
    <div style={{
      height: "100vh",
      width: "100vw",
      background: "var(--bg-base)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
      color: "var(--fg1)",
      overflow: "hidden"
    }}>
      {/* Header */}
      <header style={{
        height: 48,
        background: "var(--bg-inset)",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => router.push(`/m/${machineId}`)}
            style={{
              background: "transparent",
              border: "1px solid var(--border-default)",
              color: "var(--fg2)",
              borderRadius: 4,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← Back
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>
            <span style={{ color: "var(--musu-color-brand-accent)" }}>MUSU</span> WORKSTATION
          </div>
          <div style={{ fontSize: 12, color: "var(--fg3)", fontFamily: "'Space Mono', monospace" }}>
            {machineId}
          </div>
        </div>
        
        {/* Preset Selector */}
        <div style={{ display: "flex", background: "var(--bg-card)", borderRadius: 6, padding: 2, border: "1px solid var(--border-default)" }}>
          {(["cockpit", "focus", "headless"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => changePreset(p)}
              style={{
                background: preset === p ? "var(--border-strong)" : "transparent",
                color: preset === p ? "var(--fg1)" : "var(--fg3)",
                border: "none",
                borderRadius: 4,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: preset === p ? 700 : 400,
                cursor: "pointer",
                textTransform: "uppercase",
                transition: "background 0.2s, color 0.2s"
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: 16, overflow: "hidden", display: "flex", gap: 16 }}>
        
        {/* Left Pane (KVM) - Hidden in headless mode */}
        {preset !== "headless" && (
          <div style={{ 
            flex: preset === "focus" ? 1 : 0.7, 
            background: "black", 
            borderRadius: 8, 
            overflow: "hidden",
            boxShadow: "0 8px 0 var(--border-default)", // Brutalist shadow
            border: "2px solid var(--border-strong)"
          }}>
            <WebRtcViewer machineId={machineId} />
          </div>
        )}

        {/* Right Pane (Terminal & Files) - Hidden in focus mode */}
        {preset !== "focus" && (
          <div style={{ 
            flex: preset === "headless" ? 1 : 0.3,
            display: "flex",
            flexDirection: preset === "headless" ? "row" : "column",
            gap: 16,
            overflow: "hidden"
          }}>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <RemoteTerminal machineId={machineId} />
            </div>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <RemoteFileExplorer machineId={machineId} />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
