// musu.pro WebRTC signaling server (V23.1 T1.1)
//
// Role under V23 product model (per docs/V23_MASTER_PLAN_2026_05_15.md §0,§9,§14):
//   - Stateless, cloud-hosted (Fly.io free tier per T1.7)
//   - Exchanges WebRTC SDP offers/answers + ICE candidates between
//     external visitors and the user's musu-relay-gateway running
//     on the user's PC
//   - Carries NO traffic. Once peers exchange ICE, they connect
//     directly via WebRTC DataChannel. musu.pro never sees workspace
//     data
//   - Authenticates paid-tier users via musu.pro identity (token
//     validation kept from old server.ts; circuit breaker preserved)
//
// What this file is NOT (deliberately stripped from old server.ts):
//   - Bidirectional HTTP-over-WS tunnel (that was the v21 cloud broker
//     model; superseded by True P2P per L1+L2+L7)
//   - HTTP request/response proxying (signaling-only)
//   - WebSocket-frame relay (no traffic mediation)
//
// Telemetry endpoints (per V23 plan §9.3) live in src/signaling/telemetry.ts
// (T1.5, separate file).

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import { randomUUID } from "crypto";
import { makeTelemetryRouter } from "./telemetry";

const PORT = parseInt(
  process.env.PORT || process.env.MUSU_SIGNALING_PORT || "9900",
  10,
);
const VALIDATION_API =
  process.env.MUSU_VALIDATION_API ||
  "https://musu.pro/api/v1/nodes/validate";

// ── Token Validation Cache + Circuit Breaker (preserved from v21) ──────────
// Rationale: paid-tier users authenticate via musu.pro identity before
// signaling messages are routed. Free-tier users never reach this server
// (LAN-only). Token validation is therefore mandatory at WS handshake.

interface CacheEntry {
  valid: boolean;
  timestamp: number;
}

const validationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

let _circuitFailures = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;

async function validateToken(
  token: string,
  userId: string,
  forceRefresh = false,
): Promise<boolean> {
  const cacheKey = `${token}:${userId}`;

  if (!forceRefresh) {
    const cached = validationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.valid;
    }
  }

  if (Date.now() < _circuitOpenUntil) {
    console.warn(
      `[signaling] circuit open — rejecting validation for user=${userId}`,
    );
    return false;
  }

  try {
    const response = await fetch(VALIDATION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, user_id: userId }),
    });

    _circuitFailures = 0;
    const valid = response.ok;
    validationCache.set(cacheKey, { valid, timestamp: Date.now() });

    if (!valid) {
      console.warn(
        `[signaling] token validation failed for user=${userId}: ${response.status}`,
      );
    }

    return valid;
  } catch (err) {
    _circuitFailures++;
    console.error(
      `[signaling] validation error for user=${userId} ` +
        `(${_circuitFailures}/${CIRCUIT_FAILURE_THRESHOLD}):`,
      err instanceof Error ? err.message : String(err),
    );
    if (_circuitFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      _circuitFailures = 0;
      console.error(
        `[signaling] circuit OPEN — rejecting validations for ${CIRCUIT_COOLDOWN_MS / 1000}s`,
      );
      return false;
    }
    return true; // fail-open below threshold
  }
}

// ── Peer model ────────────────────────────────────────────────────────────
// A "peer" is one party in a signaling exchange. Two peers in the same
// "room" (= same user's workspace) exchange OFFER/ANSWER/ICE_CANDIDATE.
//
// Free tier: no signaling needed (LAN-only). All peers here are paid users
// or paid-user invitees.

type PeerRole = "gateway" | "visitor";

interface Peer {
  peerId: string; // ephemeral, generated at WS connect
  userId: string; // musu.pro user id (paid tier)
  role: PeerRole; // gateway = user's PC; visitor = browser from outside
  ws: WebSocket;
  joinedAt: number;
}

// userId → set of peers in that user's workspace
const rooms = new Map<string, Set<Peer>>();

function joinRoom(peer: Peer): void {
  let room = rooms.get(peer.userId);
  if (!room) {
    room = new Set();
    rooms.set(peer.userId, room);
  }
  room.add(peer);
}

function leaveRoom(peer: Peer): void {
  const room = rooms.get(peer.userId);
  if (!room) return;
  room.delete(peer);
  if (room.size === 0) rooms.delete(peer.userId);
}

// ── Signaling message protocol (T1.3) ──────────────────────────────────────
// Each WS message is JSON: { type, ...payload }. Server forwards to the
// peer's room counterpart. Server never inspects SDP / ICE payloads.

type SignalingMessage =
  | { type: "HELLO"; token: string; user_id: string; role: PeerRole }
  | { type: "OFFER"; to_peer: string; sdp: string }
  | { type: "ANSWER"; to_peer: string; sdp: string }
  | { type: "ICE_CANDIDATE"; to_peer: string; candidate: string }
  | { type: "BYE"; to_peer?: string };

interface ServerMessage {
  type:
    | "WELCOME"
    | "PEER_JOINED"
    | "PEER_LEFT"
    | "OFFER"
    | "ANSWER"
    | "ICE_CANDIDATE"
    | "ERROR";
  peer_id?: string;
  from_peer?: string;
  sdp?: string;
  candidate?: string;
  reason?: string;
  room_peers?: { peer_id: string; role: PeerRole }[];
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoomChange(userId: string): void {
  const room = rooms.get(userId);
  if (!room) return;
  const peer_list = Array.from(room).map((p) => ({
    peer_id: p.peerId,
    role: p.role,
  }));
  for (const p of room) {
    send(p.ws, { type: "PEER_JOINED", room_peers: peer_list });
  }
}

function findPeerInRoom(userId: string, peerId: string): Peer | null {
  const room = rooms.get(userId);
  if (!room) return null;
  for (const p of room) {
    if (p.peerId === peerId) return p;
  }
  return null;
}

// ── Express HTTP surface ──────────────────────────────────────────────────

const app = express();

const _startTime = Date.now();
let _totalPeers = 0;
let _totalRooms = 0;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Telemetry endpoints (V23.1 T1.5)
app.use("/v1/telemetry", makeTelemetryRouter());

app.get("/metrics", (_req, res) => {
  res.json({
    uptime_seconds: Math.floor((Date.now() - _startTime) / 1000),
    rooms_active: rooms.size,
    peers_active: Array.from(rooms.values()).reduce(
      (n, r) => n + r.size,
      0,
    ),
    peers_total: _totalPeers,
    rooms_total: _totalRooms,
    circuit_breaker: {
      failures: _circuitFailures,
      open_until:
        _circuitOpenUntil > Date.now()
          ? new Date(_circuitOpenUntil).toISOString()
          : null,
    },
  });
});

// ── HTTP server + WS upgrade ──────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/signaling") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", async (ws: WebSocket) => {
  let peer: Peer | null = null;

  ws.on("message", async (raw) => {
    let msg: SignalingMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "ERROR", reason: "invalid JSON" });
      return;
    }

    if (peer === null) {
      // First message MUST be HELLO
      if (msg.type !== "HELLO") {
        send(ws, { type: "ERROR", reason: "expected HELLO first" });
        ws.close(4001, "protocol violation");
        return;
      }
      const ok = await validateToken(msg.token, msg.user_id);
      if (!ok) {
        send(ws, { type: "ERROR", reason: "invalid token" });
        ws.close(4003, "unauthorized");
        return;
      }
      peer = {
        peerId: randomUUID(),
        userId: msg.user_id,
        role: msg.role,
        ws,
        joinedAt: Date.now(),
      };
      const wasNewRoom = !rooms.has(peer.userId);
      joinRoom(peer);
      _totalPeers++;
      if (wasNewRoom) _totalRooms++;

      send(ws, { type: "WELCOME", peer_id: peer.peerId });
      broadcastRoomChange(peer.userId);
      console.log(
        `[signaling] peer joined: user=${peer.userId} peer=${peer.peerId} role=${peer.role}`,
      );
      return;
    }

    // Subsequent messages
    switch (msg.type) {
      case "OFFER":
      case "ANSWER":
      case "ICE_CANDIDATE": {
        const target = findPeerInRoom(peer.userId, msg.to_peer);
        if (!target) {
          send(ws, { type: "ERROR", reason: `peer ${msg.to_peer} not in room` });
          return;
        }
        const forwarded: ServerMessage = {
          type: msg.type,
          from_peer: peer.peerId,
        };
        if (msg.type === "OFFER" || msg.type === "ANSWER") {
          forwarded.sdp = msg.sdp;
        } else {
          forwarded.candidate = msg.candidate;
        }
        send(target.ws, forwarded);
        return;
      }
      case "BYE":
        ws.close(1000, "BYE");
        return;
      default:
        send(ws, { type: "ERROR", reason: "unknown message type" });
        return;
    }
  });

  ws.on("close", () => {
    if (peer) {
      leaveRoom(peer);
      const room = rooms.get(peer.userId);
      if (room) {
        for (const p of room) {
          send(p.ws, { type: "PEER_LEFT" });
        }
      }
      console.log(
        `[signaling] peer left: user=${peer.userId} peer=${peer.peerId}`,
      );
    }
  });

  ws.on("error", (err) => {
    console.error(`[signaling] ws error:`, err);
  });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[signaling] listening on ${PORT}`);
  });
}

export { app, server, wss, validateToken, rooms };
