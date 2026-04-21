import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import { randomUUID } from "crypto";

const RELAY_SECRET = process.env.MUSU_RELAY_SECRET || "";
const PORT = parseInt(process.env.PORT || process.env.MUSU_RELAY_PORT || "9900", 10);
const VALIDATION_API = process.env.MUSU_VALIDATION_API || "https://musu.pro/api/v1/nodes/validate";

// ── Token Validation Cache ─────────────────────────────────────────────────

interface CacheEntry {
  valid: boolean;
  timestamp: number;
}

const validationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30s

async function validateToken(token: string, nodeId: string): Promise<boolean> {
  const cacheKey = `${token}:${nodeId}`;
  const cached = validationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.valid;
  }

  try {
    const response = await fetch(VALIDATION_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, node_id: nodeId }),
    });

    const valid = response.ok;
    validationCache.set(cacheKey, { valid, timestamp: Date.now() });

    if (!valid) {
      console.warn(`[relay] token validation failed for node=${nodeId}: ${response.status}`);
    }

    return valid;
  } catch (err) {
    console.error(`[relay] token validation error for node=${nodeId}:`, err instanceof Error ? err.message : String(err));
    // Fail open on network errors to prevent service disruption
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
const wss = new WebSocketServer({ server, noServer: true });

// Route upgrade requests to the right handler
server.on("upgrade", (req, socket, head) => {
  const rawUrl = req.url ?? "";
  const parsedUrl = new URL(rawUrl, "http://localhost");
  const mode = parsedUrl.searchParams.get("mode") ?? "";

  // Railway only forwards WS upgrades on the /tunnel path.
  // VNC proxy connections use /tunnel?mode=vnc-proxy&node=X&token=Y
  if (rawUrl.startsWith("/tunnel") && mode !== "vnc-proxy") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("tunnel-connection", ws, req);
    });
  } else if (rawUrl.startsWith("/tunnel") && mode === "vnc-proxy") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("ws-proxy-connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ── Tunnel endpoint (/tunnel) — musu-bridge connects here ─────────────────

wss.on("tunnel-connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/, "");
  if (!token) {
    ws.close(4001, "missing Authorization header");
    return;
  }

  let nodeId: string | null = null;

  ws.on("message", async (data: Buffer) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      console.warn("[relay] non-JSON message from tunnel");
      return;
    }

    // Handshake: musu-bridge identifies itself
    if (msg["type"] === "hello") {
      const id = msg["node_id"];
      if (typeof id !== "string" || !id) {
        ws.close(4002, "hello missing node_id");
        return;
      }

      // Validate token + node_id pair with musu.pro
      const valid = await validateToken(token, id);
      if (!valid) {
        ws.close(4005, "token validation failed");
        return;
      }

      nodeId = id;
      const existing = tunnels.get(nodeId);
      if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
        existing.ws.close(4003, "replaced by new connection");
      }
      tunnels.set(nodeId, { ws, token });
      console.log(`[relay] tunnel connected: ${nodeId}`);
      ws.send(JSON.stringify({ type: "hello_ack", node_id: nodeId }));
      return;
    }

    // HTTP response frame from musu-bridge
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
    if (nodeId) {
      if (tunnels.get(nodeId)?.ws === ws) tunnels.delete(nodeId);
      console.log(`[relay] tunnel disconnected: ${nodeId}`);
      nodeId = null;
    }
  });

  ws.on("error", (err) => {
    console.error(`[relay] ws error (node=${nodeId ?? "unknown"}):`, err.message);
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
  const session: WsSession = { sessionId, clientWs };
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

server.listen(PORT, () => {
  console.log(`[musu-relay] listening on :${PORT}`);
  if (!RELAY_SECRET) console.warn("[musu-relay] WARNING: MUSU_RELAY_SECRET not set — HTTP proxy endpoint disabled");
});
