import React from "react";
import { VscCheck, VscWarning, VscInfo } from "react-icons/vsc";

export type WidgetType = "TerminalLog" | "ProgressCircle" | "ServerHealth";

export interface WidgetPayload {
  type: WidgetType;
  props: any;
}

// 1. Terminal Log Widget
export function TerminalLogWidget({ log, level = "info" }: { log: string, level?: "info" | "warn" | "error" }) {
  const color = level === "error" ? "var(--status-error)" : level === "warn" ? "var(--status-warn)" : "var(--fg1)";
  return (
    <div style={{
      background: "rgba(0,0,0,0.85)", border: "1px solid var(--border-default)",
      borderRadius: 6, padding: "8px 12px", width: 200, fontFamily: "'Space Mono', monospace",
      fontSize: 10, color, boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {level === "info" ? <VscInfo/> : level === "error" ? <VscWarning/> : <VscInfo/>}
        <span style={{ fontWeight: "bold" }}>SYSTEM LOG</span>
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{log}</div>
    </div>
  );
}

// 2. Progress Circle Widget
export function ProgressWidget({ progress, taskName }: { progress: number, taskName: string }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.85)", border: "1px solid var(--border-default)",
      borderRadius: 6, padding: "8px 12px", width: 150, fontFamily: "'Space Mono', monospace",
      fontSize: 10, color: "var(--fg1)", display: "flex", flexDirection: "column", alignItems: "center",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    }}>
      <div style={{ fontWeight: "bold", marginBottom: 8, textAlign: "center" }}>{taskName}</div>
      
      {/* Simple CSS Pie Chart / Progress */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: `conic-gradient(var(--accent-orange) ${progress}%, #333 0)`,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{ width: 32, height: 32, background: "#111", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: "bold" }}>
          {progress}%
        </div>
      </div>
      {progress === 100 && <div style={{ color: "var(--status-success)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><VscCheck /> Done</div>}
    </div>
  );
}

// 3. Server Health Widget
export function ServerHealthWidget({ cpu, memory, status }: { cpu: number, memory: number, status: "OK" | "OVERLOAD" }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.85)", border: `1px solid ${status === "OK" ? "var(--status-success)" : "var(--status-error)"}`,
      borderRadius: 6, padding: "8px 12px", width: 160, fontFamily: "'Space Mono', monospace",
      fontSize: 10, color: "var(--fg1)", boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    }}>
      <div style={{ fontWeight: "bold", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>SERVER HEALTH</span>
        <span style={{ color: status === "OK" ? "var(--status-success)" : "var(--status-error)" }}>{status}</span>
      </div>
      
      <div style={{ marginBottom: 4 }}>CPU Usage: {cpu}%</div>
      <div style={{ width: "100%", height: 4, background: "#333", borderRadius: 2, marginBottom: 8 }}>
        <div style={{ width: `${cpu}%`, height: "100%", background: cpu > 80 ? "var(--status-error)" : "var(--accent-orange)", borderRadius: 2 }} />
      </div>

      <div style={{ marginBottom: 4 }}>RAM Usage: {memory}MB</div>
      <div style={{ width: "100%", height: 4, background: "#333", borderRadius: 2 }}>
        <div style={{ width: `${Math.min((memory / 2048) * 100, 100)}%`, height: "100%", background: "var(--status-success)", borderRadius: 2 }} />
      </div>
    </div>
  );
}

// Registry Mapper
export const WIDGETS = {
  TerminalLog: TerminalLogWidget,
  ProgressCircle: ProgressWidget,
  ServerHealth: ServerHealthWidget
};
