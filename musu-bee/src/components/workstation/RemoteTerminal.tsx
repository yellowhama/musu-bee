"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

interface RemoteTerminalProps {
  machineId: string;
}

export default function RemoteTerminal({ machineId }: RemoteTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR">("CONNECTING");

  useEffect(() => {
    if (!terminalRef.current) return;

    // 1. Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'Space Mono', monospace",
      fontSize: 13,
      theme: {
        background: "#1a1a1a",
        foreground: "#fdfbf7",
        cursor: "#ffa602",
        cursorAccent: "#251714",
        selectionBackground: "rgba(255, 166, 2, 0.3)",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    termRef.current = term;

    // 2. Connect to local musu-bridge PTY proxy
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Note: in dev mode, musu-bridge usually runs on port 8070 on localhost. 
    // If running in production, it's served by the same host.
    const wsUrl = `${protocol}//127.0.0.1:8070/api/v1/proxy/pty?node_id=${machineId}`;
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
    } catch (e) {
      console.error(e);
      setStatus("ERROR");
      return;
    }

    ws.onopen = () => {
      setStatus("CONNECTED");
      const attachAddon = new AttachAddon(ws);
      term.loadAddon(attachAddon);
      term.focus();
    };

    ws.onclose = () => {
      setStatus("DISCONNECTED");
      term.write("\r\n\x1b[31m[Connection closed]\x1b[0m\r\n");
    };

    ws.onerror = () => {
      setStatus("ERROR");
      term.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");
    };

    wsRef.current = ws;

    const handleCustomCommand = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.machineId === machineId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(customEvent.detail.command);
      }
    };
    
    document.addEventListener("fleet-terminal-command", handleCustomCommand);

    // Handle resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("fleet-terminal-command", handleCustomCommand);
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [machineId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a1a1a", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-default)" }}>
      {/* Header */}
      <div style={{ padding: "8px 12px", background: "#111", borderBottom: "1px solid var(--border-default)", fontSize: 12, fontWeight: 700, color: "var(--fg2)", display: "flex", justifyContent: "space-between" }}>
        <span>TERMINAL (PTY)</span>
        <span style={{ 
          color: status === "CONNECTED" ? "var(--status-online)" : 
                 status === "ERROR" ? "var(--status-error)" : "var(--status-warn)" 
        }}>
          {status}
        </span>
      </div>

      {/* Terminal Container */}
      <div style={{ flex: 1, padding: 8, overflow: "hidden" }}>
        <div ref={terminalRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
