"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * V23.2 musu-bee spike demo (closes V23.1 T1.16-equivalent in-browser).
 *
 * Why this re-implements the wire format instead of importing
 * musu-relay's VisitorClient: VisitorClient imports gateway/bridge.ts
 * which uses Node's `http` + `crypto.randomUUID` + `Buffer`. Pulling
 * that into the Next bundle would either fail the build or balloon it
 * with polyfills. The wire format is small enough to inline here, and
 * keeping the browser-side independent lets us evolve the protocol
 * without coupling the public site bundle to musu-relay internals.
 *
 * Wire format mirrored from musu-relay/src/gateway/bridge.ts:
 *   request:  { id, kind: "req", method, path, headers, body? (base64) }
 *   response: { id, kind: "res", status, headers, body? (base64) }
 *   error:    { id, kind: "err", message }
 */

type Phase =
  | "idle"
  | "ws-connecting"
  | "hello-sent"
  | "welcome-received"
  | "offer-received"
  | "answer-sent"
  | "dc-open"
  | "request-sent"
  | "response-received"
  | "closed"
  | "error";

interface LogEntry {
  t: number;
  level: "info" | "warn" | "error";
  msg: string;
}

export default function SpikeDemoClient({
  defaultSignalingUrl,
}: {
  defaultSignalingUrl: string;
}) {
  const [signalingUrl, setSignalingUrl] = useState(defaultSignalingUrl);
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [requestPath, setRequestPath] = useState("/api/v1/namespaces");
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [response, setResponse] = useState<{
    status: number;
    headers: Record<string, string>;
    bodyPreview: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const myPeerIdRef = useRef<string | null>(null);
  const gatewayPeerIdRef = useRef<string | null>(null);
  const pendingLocalIceRef = useRef<string[]>([]);
  const pendingResolveRef = useRef<((env: ResEnv | ErrEnv) => void) | null>(
    null,
  );

  const log = useCallback(
    (level: LogEntry["level"], msg: string) => {
      setLogs((prev) => [...prev, { t: Date.now(), level, msg }]);
    },
    [setLogs],
  );

  const cleanup = useCallback(() => {
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      wsRef.current?.close(1000);
    } catch {}
    dcRef.current = null;
    pcRef.current = null;
    wsRef.current = null;
    myPeerIdRef.current = null;
    gatewayPeerIdRef.current = null;
    pendingLocalIceRef.current = [];
    pendingResolveRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    if (phase !== "idle" && phase !== "closed" && phase !== "error") {
      return;
    }
    setLogs([]);
    setResponse(null);

    if (!token.trim() || !userId.trim()) {
      log("error", "token and userId are required");
      setPhase("error");
      return;
    }

    setPhase("ws-connecting");
    log("info", `opening WS → ${signalingUrl}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(signalingUrl);
    } catch (err) {
      log("error", `WebSocket ctor threw: ${String(err)}`);
      setPhase("error");
      return;
    }
    wsRef.current = ws;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      const candidate = JSON.stringify(ev.candidate.toJSON());
      const gw = gatewayPeerIdRef.current;
      if (gw && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "ICE_CANDIDATE",
            to_peer: gw,
            candidate,
          }),
        );
      } else {
        pendingLocalIceRef.current.push(candidate);
      }
    };

    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dcRef.current = dc;
      dc.onopen = () => {
        log("info", "DataChannel open");
        setPhase("dc-open");
      };
      dc.onclose = () => {
        log("info", "DataChannel closed");
      };
      dc.onmessage = (mev) => {
        let env: AnyEnv;
        try {
          env = JSON.parse(typeof mev.data === "string" ? mev.data : "");
        } catch {
          log("warn", "non-JSON message on DC");
          return;
        }
        if (env.kind === "res" || env.kind === "err") {
          const r = pendingResolveRef.current;
          pendingResolveRef.current = null;
          r?.(env);
        }
      };
    };

    ws.onopen = () => {
      log("info", "WS open — sending HELLO");
      ws.send(
        JSON.stringify({
          type: "HELLO",
          token,
          user_id: userId,
          role: "visitor",
        }),
      );
      setPhase("hello-sent");
    };

    ws.onerror = () => {
      log("error", "WS error");
      setPhase("error");
    };

    ws.onclose = (ev) => {
      log("info", `WS close code=${ev.code}`);
      setPhase((p) => {
        if (p === "error" || p === "dc-open" || p === "response-received") return p;
        return "closed";
      });
    };

    ws.onmessage = async (ev) => {
      let m: SignalingMessage;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === "WELCOME") {
        myPeerIdRef.current = m.peer_id;
        log("info", `WELCOME peer_id=${m.peer_id}`);
        setPhase("welcome-received");
      } else if (m.type === "PEER_JOINED") {
        log(
          "info",
          `PEER_JOINED room_peers=${m.room_peers.map((p) => `${p.role}:${p.peer_id}`).join(",")}`,
        );
      } else if (m.type === "OFFER") {
        gatewayPeerIdRef.current = m.from_peer;
        log("info", `OFFER from ${m.from_peer}`);
        setPhase("offer-received");
        try {
          await pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(
            JSON.stringify({
              type: "ANSWER",
              to_peer: m.from_peer,
              sdp: answer.sdp,
            }),
          );
          setPhase("answer-sent");
          log("info", "ANSWER sent");
          for (const c of pendingLocalIceRef.current.splice(0)) {
            ws.send(
              JSON.stringify({
                type: "ICE_CANDIDATE",
                to_peer: m.from_peer,
                candidate: c,
              }),
            );
          }
        } catch (err) {
          log("error", `answer failed: ${String(err)}`);
          setPhase("error");
        }
      } else if (m.type === "ICE_CANDIDATE") {
        try {
          const parsed = JSON.parse(m.candidate);
          await pc.addIceCandidate(parsed);
        } catch (err) {
          log("warn", `addIceCandidate failed: ${String(err)}`);
        }
      } else if (m.type === "PEER_LEFT") {
        log("warn", `PEER_LEFT peer_id=${m.peer_id ?? "(legacy server)"}`);
      } else if (m.type === "ERROR") {
        log("error", `signaling ERROR: ${m.reason}`);
        setPhase("error");
      }
    };
  }, [phase, signalingUrl, token, userId, log]);

  const sendRequest = useCallback(async () => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      log("error", "DataChannel not open");
      return;
    }
    const id = cryptoRandomId();
    const env = {
      id,
      kind: "req" as const,
      method: "GET",
      path: requestPath,
      headers: {},
    };
    const result = await new Promise<ResEnv | ErrEnv>((resolve) => {
      pendingResolveRef.current = resolve;
      setPhase("request-sent");
      log("info", `→ GET ${requestPath} (id=${id.slice(0, 8)})`);
      dc.send(JSON.stringify(env));
      setTimeout(() => {
        if (pendingResolveRef.current === resolve) {
          pendingResolveRef.current = null;
          resolve({ id, kind: "err", message: "request timeout (10s)" });
        }
      }, 10_000);
    });
    if (result.kind === "err") {
      log("error", `← err: ${result.message}`);
      setPhase("error");
      return;
    }
    const bodyBytes = result.body ? base64ToString(result.body) : "";
    setResponse({
      status: result.status,
      headers: result.headers,
      bodyPreview: bodyBytes.slice(0, 2048),
    });
    setPhase("response-received");
    log("info", `← ${result.status} (${bodyBytes.length} bytes)`);
  }, [requestPath, log]);

  const stop = useCallback(() => {
    cleanup();
    setPhase("closed");
    log("info", "closed");
  }, [cleanup, log]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <fieldset style={fieldsetStyle} disabled={phase !== "idle" && phase !== "closed" && phase !== "error"}>
        <legend style={legendStyle}>1. Inputs</legend>
        <label style={labelStyle}>
          Signaling URL
          <input
            style={inputStyle}
            value={signalingUrl}
            onChange={(e) => setSignalingUrl(e.target.value)}
            placeholder="wss://signaling.musu.pro/signaling"
          />
        </label>
        <label style={labelStyle}>
          Token (paid-tier session token)
          <input
            style={inputStyle}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="from musu.pro account → settings → P2P token"
          />
        </label>
        <label style={labelStyle}>
          User ID (must match your gateway&apos;s userId)
          <input
            style={inputStyle}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="your musu user id"
          />
        </label>
        <label style={labelStyle}>
          Request path
          <input
            style={inputStyle}
            value={requestPath}
            onChange={(e) => setRequestPath(e.target.value)}
            placeholder="/api/v1/namespaces"
          />
        </label>
      </fieldset>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={start}
          disabled={phase !== "idle" && phase !== "closed" && phase !== "error"}
          style={buttonStyle(false)}
        >
          Connect
        </button>
        <button
          onClick={sendRequest}
          disabled={phase !== "dc-open" && phase !== "response-received"}
          style={buttonStyle(false)}
        >
          Send request
        </button>
        <button
          onClick={stop}
          disabled={phase === "idle" || phase === "closed"}
          style={buttonStyle(true)}
        >
          Close
        </button>
      </div>

      <div style={statusRowStyle}>
        <PhaseBadge phase={phase} />
      </div>

      {response && (
        <section style={panelStyle}>
          <h3 style={panelTitleStyle}>Response</h3>
          <div>
            <strong>Status</strong> {response.status}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Headers</strong>
            <pre style={preStyle}>
              {Object.entries(response.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n")}
            </pre>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Body (first 2KB)</strong>
            <pre style={preStyle}>{response.bodyPreview}</pre>
          </div>
        </section>
      )}

      <section style={panelStyle}>
        <h3 style={panelTitleStyle}>Log</h3>
        <pre style={{ ...preStyle, maxHeight: 320, overflow: "auto" }}>
          {logs.length === 0
            ? "(empty — click Connect to begin)"
            : logs
                .map((e) => `[${new Date(e.t).toISOString().slice(11, 23)}] ${e.level.toUpperCase()}  ${e.msg}`)
                .join("\n")}
        </pre>
      </section>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: Phase }) {
  const color =
    phase === "error"
      ? "#c1462b"
      : phase === "dc-open" || phase === "response-received"
        ? "#2b8a3e"
        : phase === "closed" || phase === "idle"
          ? "#6b7280"
          : "var(--musu-color-brand-accent)";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.04)",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
        }}
      />
      phase: {phase}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface ResEnv {
  id: string;
  kind: "res";
  status: number;
  headers: Record<string, string>;
  body?: string;
}

interface ErrEnv {
  id: string;
  kind: "err";
  message: string;
}

type AnyEnv = ResEnv | ErrEnv | { id: string; kind: "req" };

type SignalingMessage =
  | { type: "WELCOME"; peer_id: string }
  | {
      type: "PEER_JOINED";
      room_peers: { peer_id: string; role: string }[];
    }
  | { type: "PEER_LEFT"; peer_id?: string }
  | { type: "OFFER"; from_peer: string; sdp: string }
  | { type: "ANSWER"; from_peer: string; sdp: string }
  | { type: "ICE_CANDIDATE"; from_peer: string; candidate: string }
  | { type: "ERROR"; reason: string };

function cryptoRandomId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  c?.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToString(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "(base64 decode failed)";
  }
}

// ── Styles ────────────────────────────────────────────────────────────────

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 20,
  display: "grid",
  gap: 12,
  background: "rgba(255,255,255,0.6)",
};

const legendStyle: React.CSSProperties = {
  padding: "0 8px",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--musu-color-brand-accent)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  fontSize: 14,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};

const buttonStyle = (danger: boolean): React.CSSProperties => ({
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  background: danger ? "rgba(193,70,43,0.1)" : "var(--musu-color-brand-accent)",
  color: danger ? "#c1462b" : "white",
});

const statusRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 20,
  background: "rgba(255,255,255,0.6)",
};

const panelTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  fontWeight: 800,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  background: "rgba(0,0,0,0.04)",
  borderRadius: 6,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};
