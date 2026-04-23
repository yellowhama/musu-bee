import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import { randomUUID } from "crypto";

const RELAY_SECRET = process.env.MUSU_RELAY_SECRET || "";
const PORT = parseInt(process.env.PORT || process.env.MUSU_RELAY_PORT || "9900", 10);
const VALIDATION_API = process.env.MUSU_VALIDATION_API || "https://musu.pro/api/v1/nodes/validate";

// ── Token Validation Cache + Circuit Breaker ───────────────────────────────

interface CacheEntry {
  valid: boolean;
  timestamp: number;
}

const validationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30s

// Circuit breaker: if validation API is unreachable, stop accepting new
// relay_client registrations for CIRCUIT_COOLDOWN_MS to prevent mass token bypass.
let _circuitFailures = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_FAILURE_THRESHOLD = 5;  // open circuit after 5 consecutive errors
const CIRCUIT_COOLDOWN_MS = 30_000;   // stay open for 30s, then half-open

async function validateToken(token: string, nodeId: string): Promise<boolean> {
  const cacheKey = `${token}:${nodeId}`;
  const cached = validationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.valid;
  }

  // Circuit breaker: open circuit → reject new (uncached) validations
  if (Date.now() < _circuitOpenUntil) {
    console.warn(`[relay] circuit open — rejecting token validation for node=${nodeId} (API unreachable)`);
    return false;
  }

  try {
    const response = await fetch(VALIDATION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, node_id: nodeId }),
    });

    // Successful response (even 401) resets failure counter
    _circuitFailures = 0;

    const valid = response.ok;
    validationCache.set(cacheKey, { valid, timestamp: Date.now() });

    if (!valid) {
      console.warn(`[relay] token validation failed for node=${nodeId}: ${response.status}`);
    }

    return valid;
  } catch (err) {
    _circuitFailures++;
    console.error(
      `[relay] token validation error for node=${nodeId} (failure ${_circuitFailures}/${CIRCUIT_FAILURE_THRESHOLD}):`,
      err instanceof Error ? err.message : String(err)
    );
    if (_circuitFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      _circuitFailures = 0;
      console.error(`[relay] circuit breaker OPEN — validation API unreachable. Rejecting new connections for ${CIRCUIT_COOLDOWN_MS / 1000}s`);
      return false;
    }
    // Below threshold: fail open (prefer availability during transient errors)
    return true;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface RelayRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null; // base64
}

interface RelayResponse {
  id: string;
  status: number;
  headers: Record<string, string>;
  body: string; // base64
}

interface PendingRequest {
  resolve: (r: RelayResponse) => void;
  reject: (e: Error) => void;
}

// WS proxy session: browser ↔ relay ↔ node tunnel
interface WsSession {
  sessionId: string;
  clientWs: WebSocket;
  createdAt: number;
  nodeId: string | null; // associated node tunnel (for TTL cleanup notification)
}

// ── State ──────────────────────────────────────────────────────────────────

// nodeId → { ws: active tunnel WebSocket, token: MUSU_TOKEN used to register }
interface TunnelEntry {
  ws: WebSocket;
  token: string;
}
const tunnels = new Map<string, TunnelEntry>();

// requestId → pending HTTP-over-tunnel promise handlers
const pending = new Map<string, PendingRequest>();

// sessionId → WsSession (browser-side WebSocket waiting for WS frames from node)
const wsSessions = new Map<string, WsSession>();

// ── Express app (proxy endpoint) ───────────────────────────────────────────

const app = express();
app.use(express.raw({ type: "*/*", limit: "10mb" }));

function requireSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!RELAY_SECRET) {
    res.status(500).json({ error: "MUSU_RELAY_SECRET not configured" });
    return;
  }
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${RELAY_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// Health check (unauthenticated)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", tunnels: Array.from(tunnels.keys()) });
});

// HTTP proxy: forward any HTTP method/path to a registered node tunnel
// Pattern: /proxy/:nodeId/*
app.all("/proxy/:nodeId/*", requireSecret, async (req, res) => {
  const { nodeId } = req.params;
  const rawPath = (req.params as Record<string, string>)["0"] ?? "";
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const path = `/${rawPath}${qs}`;

  const entry = tunnels.get(nodeId);
  if (!entry || entry.ws.readyState !== WebSocket.OPEN) {
    res.status(502).json({ error: `no active tunnel for node: ${nodeId}` });
    return;
  }

  const id = randomUUID();
  const bodyBuf = req.body instanceof Buffer ? req.body : null;
  const reqFrame: RelayRequest = {
    id,
    method: req.method,
    path,
    headers: req.headers as Record<string, string>,
    body: bodyBuf?.length ? bodyBuf.toString("base64") : null,
  };

  try {
    const result = await new Promise<RelayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout: no response from ${nodeId} within 30s`));
      }, 30_000);

      pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      entry.ws.send(JSON.stringify(reqFrame), (err) => {
        if (err) {
          pending.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    const HOP_BY_HOP = new Set([
      "transfer-encoding", "connection", "keep-alive", "upgrade",
      "proxy-authenticate", "proxy-authorization", "te", "trailers",
    ]);
    res.status(result.status);
    for (const [k, v] of Object.entries(result.headers ?? {})) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) res.setHeader(k, v);
    }
    const responseBody = result.body ? Buffer.from(result.body, "base64") : Buffer.alloc(0);
    res.end(responseBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

// ── WebSocket server (tunnel + ws-proxy endpoints) ────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Route upgrade requests to the right handler.
// Railway only allows WS upgrades on /tunnel (strips query params before forwarding).
// All connections — relay_client and VNC browser — go to tunnel-connection.
// Connection type is determined by first message type field.
server.on("upgrade", (req, socket, head) => {
  const rawUrl = req.url ?? "";
  if (rawUrl.startsWith("/tunnel")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("tunnel-connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ── Tunnel endpoint (/tunnel) — musu-bridge and VNC browsers connect here ──
//
// Two connection types, distinguished by first message:
//   relay_client: requires Authorization header, first msg { type: "hello", node_id }
//   VNC browser:  no auth header,               first msg { type: "vnc-proxy", node, token }
//
// Railway only allows WebSocket upgrades on /tunnel (no other paths, no query params).

wss.on("tunnel-connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const authToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/, "");

  // relay_client state
  let nodeId: string | null = null;

  // VNC browser proxy state
  let isVncBrowser = false;
  let vncSessionId: string | null = null;
  let vncNodeId: string | null = null;

  ws.on("message", async (data: Buffer) => {
    // ── VNC browser: relay binary RFB frames after handshake ────────────────
    if (isVncBrowser && vncSessionId && vncNodeId) {
      const entry = tunnels.get(vncNodeId);
      if (entry && entry.ws.readyState === WebSocket.OPEN) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as unknown as ArrayBuffer);
        entry.ws.send(JSON.stringify({
          type: "ws_data",
          session_id: vncSessionId,
          data_b64: buf.toString("base64"),
        }));
      }
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      console.warn("[relay] non-JSON message from tunnel");
      return;
    }

    // ── VNC browser handshake: { type: "vnc-proxy", node, token } ───────────
    if (msg["type"] === "vnc-proxy") {
      const reqNodeId = msg["node"];
      const vncToken = msg["token"];
      if (typeof reqNodeId !== "string" || !reqNodeId || typeof vncToken !== "string" || !vncToken) {
        ws.close(4000, "vnc-proxy missing node or token");
        return;
      }
      const entry = tunnels.get(reqNodeId);
      if (!entry || entry.ws.readyState !== WebSocket.OPEN) {
        ws.close(4004, `no active tunnel for node: ${reqNodeId}`);
        return;
      }
      const sessionId = randomUUID();
      wsSessions.set(sessionId, { sessionId, clientWs: ws, createdAt: Date.now(), nodeId: reqNodeId });
      vncSessionId = sessionId;
      vncNodeId = reqNodeId;
      isVncBrowser = true;

      console.log(`[relay] vnc-proxy opened: node=${reqNodeId} session=${sessionId}`);

      // Tell the node to open a local WS to the VNC bridge endpoint
      entry.ws.send(JSON.stringify({
        type: "ws_open",
        session_id: sessionId,
        target_path: `/api/screen/ws-vnc?token=${encodeURIComponent(vncToken)}`,
      }));
      // Acknowledge to browser — it will now pass this WS to noVNC RFB
      ws.send(JSON.stringify({ type: "vnc-ready" }));
      return;
    }

    // ── relay_client handshake: { type: "hello", node_id } ──────────────────
    if (msg["type"] === "hello") {
      if (!authToken) {
        ws.close(4001, "missing Authorization header");
        return;
      }
      const id = msg["node_id"];
      if (typeof id !== "string" || !id) {
        ws.close(4002, "hello missing node_id");
        return;
      }

      const valid = await validateToken(authToken, id);
      if (!valid) {
        ws.close(4005, "token validation failed");
        return;
      }

      nodeId = id;
      const existing = tunnels.get(nodeId);
      if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
        existing.ws.close(4003, "replaced by new connection");
      }
      tunnels.set(nodeId, { ws, token: authToken });
      console.log(`[relay] tunnel connected: ${nodeId}`);
      ws.send(JSON.stringify({ type: "hello_ack", node_id: nodeId }));
      return;
    }

    // ── HTTP response frame from musu-bridge ────────────────────────────────
    const id = msg["id"];
    if (typeof id === "string") {
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(msg as unknown as RelayResponse);
      }
    }

    // WS proxy data frame from musu-bridge: { type: "ws_data", session_id, data_b64 }
    if (msg["type"] === "ws_data") {
      const sessionId = msg["session_id"];
      const dataB64 = msg["data_b64"];
      if (typeof sessionId === "string" && typeof dataB64 === "string") {
        const session = wsSessions.get(sessionId);
        if (session && session.clientWs.readyState === WebSocket.OPEN) {
          session.clientWs.send(Buffer.from(dataB64, "base64"));
        }
      }
    }

    // WS proxy close from musu-bridge: { type: "ws_close", session_id, code?, reason? }
    if (msg["type"] === "ws_close") {
      const sessionId = msg["session_id"];
      if (typeof sessionId === "string") {
        const session = wsSessions.get(sessionId);
        if (session) {
          const code = typeof msg["code"] === "number" ? msg["code"] : 1000;
          const reason = typeof msg["reason"] === "string" ? msg["reason"] : "";
          session.clientWs.close(code, reason);
          wsSessions.delete(sessionId);
        }
      }
    }
  });

  ws.on("close", () => {
    if (isVncBrowser) {
      // VNC browser disconnected — tell node to close the WS session
      if (vncSessionId) {
        wsSessions.delete(vncSessionId);
        if (vncNodeId) {
          const entry = tunnels.get(vncNodeId);
          if (entry && entry.ws.readyState === WebSocket.OPEN) {
            entry.ws.send(JSON.stringify({
              type: "ws_close",
              session_id: vncSessionId,
              code: 1001,
              reason: "browser disconnected",
            }));
          }
        }
        console.log(`[relay] vnc-proxy closed: session=${vncSessionId}`);
      }
    } else if (nodeId) {
      if (tunnels.get(nodeId)?.ws === ws) tunnels.delete(nodeId);
      console.log(`[relay] tunnel disconnected: ${nodeId}`);
      nodeId = null;
    }
  });

  ws.on("error", (err) => {
    console.error(`[relay] ws error (node=${nodeId ?? vncNodeId ?? "unknown"}):`, err.message);
  });
});

// ── WS proxy endpoint (/ws-proxy/:nodeId/:path) ───────────────────────────
//
// Auth: ?token=<MUSU_TOKEN> must match the token the node used to register its tunnel.
// This lets browser clients proxy WebSocket connections to musu-port without
// needing the server-only RELAY_SECRET.
//
// Frame protocol (relay ↔ node tunnel):
//   ws_open:  { type: "ws_open",  session_id, target_path }
//   ws_data:  { type: "ws_data",  session_id, data_b64 }    (binary base64)
//   ws_close: { type: "ws_close", session_id, code?, reason? }

wss.on("ws-proxy-connection", async (clientWs: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url ?? "", "ws://localhost");
  // Support two URL formats:
  //   Legacy: /ws-proxy/:nodeId/:rest?token=X
  //   New:    /tunnel?mode=vnc-proxy&node=X&token=Y  (Railway-compatible)
  let nodeId: string;
  let targetPath: string;
  const token = url.searchParams.get("token") ?? "";
  const mode = url.searchParams.get("mode") ?? "";

  if (mode === "vnc-proxy") {
    // New format: params in query string
    nodeId = url.searchParams.get("node") ?? "";
    targetPath = `/api/screen/ws-vnc?token=${encodeURIComponent(token)}`;
  } else {
    // Legacy format: /ws-proxy/:nodeId/:rest
    const parts = url.pathname.split("/").filter(Boolean); // ["ws-proxy", nodeId, ...rest]
    nodeId = parts[1] ?? "";
    const urlWithoutMode = new URL(url.toString());
    urlWithoutMode.searchParams.delete("mode");
    targetPath = "/" + parts.slice(2).join("/") + urlWithoutMode.search;
  }

  if (!nodeId) {
    clientWs.close(4000, "missing nodeId");
    return;
  }

  const entry = tunnels.get(nodeId);
  if (!entry || entry.ws.readyState !== WebSocket.OPEN) {
    clientWs.close(4004, `no active tunnel for node: ${nodeId}`);
    return;
  }

  // VNC paths use a one-time token validated by the bridge endpoint itself.
  // Skip relay-level token check for /api/screen/ws-vnc — the single-use
  // VNC token (60s TTL) provides sufficient auth downstream.
  const isVncPath = targetPath.startsWith("/api/screen/ws-vnc");
  if (!isVncPath) {
    // Non-VNC ws-proxy: require matching MUSU_TOKEN
    if (!token || token !== entry.token) {
      clientWs.close(4001, "invalid token");
      return;
    }
    const valid = await validateToken(token, nodeId);
    if (!valid) {
      clientWs.close(4005, "token validation failed");
      return;
    }
  }

  const sessionId = randomUUID();
  const session: WsSession = { sessionId, clientWs, createdAt: Date.now(), nodeId };
  wsSessions.set(sessionId, session);

  console.log(`[relay] ws-proxy opened: node=${nodeId} session=${sessionId} path=${targetPath}`);

  // Tell the node to open a local WS to the target path
  entry.ws.send(JSON.stringify({
    type: "ws_open",
    session_id: sessionId,
    target_path: targetPath,
  }));

  // Client → node: forward messages as ws_data frames
  clientWs.on("message", (data: Buffer | string) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(JSON.stringify({
        type: "ws_data",
        session_id: sessionId,
        data_b64: buf.toString("base64"),
      }));
    }
  });

  // Client disconnect → tell node to close
  clientWs.on("close", (code, reason) => {
    wsSessions.delete(sessionId);
    if (entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(JSON.stringify({
        type: "ws_close",
        session_id: sessionId,
        code,
        reason: reason?.toString() ?? "",
      }));
    }
    console.log(`[relay] ws-proxy closed: session=${sessionId}`);
  });

  clientWs.on("error", (err) => {
    console.error(`[relay] client ws error (session=${sessionId}):`, err.message);
  });
});

// ── VNC session TTL cleanup (30 min) ──────────────────────────────────────
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const _sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of wsSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      console.info(`[relay] session TTL exceeded — closing session=${id}`);
      session.clientWs.close(1001, "session TTL exceeded");
      // Notify the node tunnel to close the corresponding WS session
      if (session.nodeId) {
        const nodeEntry = tunnels.get(session.nodeId);
        if (nodeEntry && nodeEntry.ws.readyState === WebSocket.OPEN) {
          nodeEntry.ws.send(JSON.stringify({
            type: "ws_close",
            session_id: id,
            code: 1001,
            reason: "session TTL exceeded",
          }));
        }
      }
      wsSessions.delete(id);
    }
  }
}, SESSION_TTL_MS);

// Export for testing
export { app, server, tunnels, pending, wsSessions, validationCache, validateToken, _sessionCleanupTimer };

/** Reset all mutable state — test-only */
export function _resetState() {
  tunnels.clear();
  pending.clear();
  wsSessions.clear();
  validationCache.clear();
  _circuitFailures = 0;
  _circuitOpenUntil = 0;
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[musu-relay] listening on :${PORT}`);
    if (!RELAY_SECRET) console.warn("[musu-relay] WARNING: MUSU_RELAY_SECRET not set — HTTP proxy endpoint disabled");
  });
}
