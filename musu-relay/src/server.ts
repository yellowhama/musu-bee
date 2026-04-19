import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import { randomUUID } from "crypto";

const RELAY_SECRET = process.env.MUSU_RELAY_SECRET || "";
const PORT = parseInt(process.env.PORT || process.env.MUSU_RELAY_PORT || "9900", 10);

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

// ── State ──────────────────────────────────────────────────────────────────

// nodeId → active tunnel WebSocket
const tunnels = new Map<string, WebSocket>();

// requestId → pending promise handlers
const pending = new Map<string, PendingRequest>();

// ── Express app (proxy endpoint) ───────────────────────────────────────────

const app = express();
app.use(express.raw({ type: "*/*", limit: "10mb" }));

function requireSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!RELAY_SECRET) {
    // No secret configured — deny all proxy requests
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

// Proxy: forward any HTTP method/path to a registered node tunnel
// Pattern: /proxy/:nodeId/*
app.all("/proxy/:nodeId/*", requireSecret, async (req, res) => {
  const { nodeId } = req.params;
  // Express params[0] captures the wildcard after nodeId
  const rawPath = (req.params as Record<string, string>)["0"] ?? "";
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const path = `/${rawPath}${qs}`;

  const ws = tunnels.get(nodeId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
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

      ws.send(JSON.stringify(reqFrame), (err) => {
        if (err) {
          pending.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    // Strip hop-by-hop headers before forwarding
    const HOP_BY_HOP = new Set([
      "transfer-encoding",
      "connection",
      "keep-alive",
      "upgrade",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailers",
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

// ── WebSocket server (tunnel endpoint) ────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/tunnel" });

wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/, "");
  if (!token) {
    ws.close(4001, "missing Authorization header");
    return;
  }

  let nodeId: string | null = null;

  ws.on("message", (data: Buffer) => {
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
      nodeId = id;
      // Close any existing stale tunnel for same node
      const existing = tunnels.get(nodeId);
      if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
        existing.close(4003, "replaced by new connection");
      }
      tunnels.set(nodeId, ws);
      console.log(`[relay] tunnel connected: ${nodeId}`);
      ws.send(JSON.stringify({ type: "hello_ack", node_id: nodeId }));
      return;
    }

    // Response frame from musu-bridge
    const id = msg["id"];
    if (typeof id === "string") {
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(msg as unknown as RelayResponse);
      }
    }
  });

  ws.on("close", () => {
    if (nodeId) {
      // Only remove if this is still the registered tunnel (not replaced)
      if (tunnels.get(nodeId) === ws) tunnels.delete(nodeId);
      console.log(`[relay] tunnel disconnected: ${nodeId}`);
      nodeId = null;
    }
  });

  ws.on("error", (err) => {
    console.error(`[relay] ws error (node=${nodeId ?? "unknown"}):`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`[musu-relay] listening on :${PORT}`);
  if (!RELAY_SECRET) console.warn("[musu-relay] WARNING: MUSU_RELAY_SECRET not set — proxy endpoint disabled");
});
