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
import { checkTelemetryAuthBootConfig, makeTelemetryRouter } from "./telemetry";

const PORT = parseInt(
  process.env.PORT || process.env.MUSU_SIGNALING_PORT || "9900",
  10,
);
const VALIDATION_API =
  process.env.MUSU_VALIDATION_API ||
  "https://musu.pro/api/v1/nodes/validate";

// ── Token Validation Cache + Circuit Breaker (V23.2 T2.AUTH.1) ─────────────
// Rationale: paid-tier users authenticate via musu.pro identity before
// signaling messages are routed. Free-tier users never reach this server
// (LAN-only). Token validation is therefore mandatory at WS handshake.
//
// V23.2 changes (audit finding HIGH #1):
//   - Previously: on fetch error below circuit-breaker threshold, return
//     true (fail-open). That granted up to 5 unauthenticated handshakes
//     per outage window.
//   - Now: fail-closed on network error, EXCEPT for tokens that have a
//     recent successful cache entry — those are extended in a "degraded
//     grace" window so users already in mid-session are not kicked out
//     by a transient musu.pro outage. New tokens get rejected.
//   - Circuit breaker remains, but its role is logging + skipping the
//     fetch attempt during a known outage. It does NOT permit unauthed
//     access.

interface CacheEntry {
  valid: boolean;
  // Canonical userId returned by the validation API. Only trusted when
  // valid=true. Becomes the room key — never the HELLO-supplied user_id.
  canonicalUserId: string | null;
  timestamp: number;
}

const validationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;
// During an upstream outage, previously-valid tokens get this much extra
// grace before being rejected. Bounds how long a real revocation takes to
// propagate when musu.pro is also down.
const DEGRADED_GRACE_MS = 5 * 60_000;

let _circuitFailures = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;

/**
 * Result of token validation.
 *
 * V23.2 T2.AUTH.3 hardening: HELLO's `user_id` field is now untrusted.
 * The canonical room key is the `userId` field of this result, which is
 * sourced from the validation API response — never from the client's
 * HELLO message. This closes the V23.1 audit HIGH #3 user-id squatting
 * vector where attacker-supplied user_id was used as the cache key /
 * room key.
 *
 * History: prior to B2 (wiki/365), v21-era musu.pro `/validate` returned
 * 200/!200 without a `user_id` body field, so this code fell back to the
 * HELLO-supplied id with a one-time warning. Post-B2-pro (musu-pro
 * 7397d74 deployed 2026-05-16), `/validate` returns `{ user_id }` in the
 * 200 body in every case; the fallback was removed in B2-bee (wiki/365).
 * If the upstream ever returns 200 without `user_id` again, `userId` is
 * null and the HELLO handler rejects the connection with 4003.
 */
export interface ValidationResult {
  valid: boolean;
  /** Canonical userId from musu.pro. Null when valid=false, or when a
   *  200 response is missing the `user_id` field (post-B2 strict mode).
   *  HELLO handler rejects null with 4003. */
  userId: string | null;
}

async function validateToken(
  token: string,
  claimedUserId: string,
  forceRefresh = false,
): Promise<ValidationResult> {
  // Cache key is the token alone — V23.2 fix for audit HIGH #3.
  const cacheKey = token;

  if (!forceRefresh) {
    const cached = validationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { valid: cached.valid, userId: cached.canonicalUserId };
    }
  }

  // Circuit open — skip the network attempt entirely. Fall through to the
  // degraded-grace path so existing sessions keep working.
  if (Date.now() < _circuitOpenUntil) {
    console.warn(
      `[signaling] circuit open — using cached grace only for token-prefix=${token.slice(0, 6)}`,
    );
    return degradedGrace(cacheKey);
  }

  try {
    const response = await fetch(VALIDATION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // V23.2: still send claimed user_id for the validation API to use as
      // a check (the upstream may bind token→user_id and reject if they
      // disagree). But we no longer trust the claim on our side.
      body: JSON.stringify({ token, user_id: claimedUserId }),
    });

    _circuitFailures = 0;
    const valid = response.ok;
    let canonicalUserId: string | null = null;
    if (valid) {
      // Read the canonical userId from the validation response. Post-B2
      // (wiki/365) the upstream is guaranteed to return { user_id } in
      // every 200 body. If it does not, canonicalUserId stays null and
      // the HELLO handler rejects the connection with 4003.
      try {
        const body = (await response.json()) as { user_id?: unknown };
        if (typeof body.user_id === "string" && body.user_id.length > 0) {
          canonicalUserId = body.user_id;
        } else {
          canonicalUserId = null;
        }
      } catch {
        canonicalUserId = null;
      }
    }
    validationCache.set(cacheKey, {
      valid,
      canonicalUserId,
      timestamp: Date.now(),
    });

    if (!valid) {
      console.warn(
        `[signaling] token validation failed for token-prefix=${token.slice(0, 6)}: ${response.status}`,
      );
    }

    return { valid, userId: canonicalUserId };
  } catch (err) {
    _circuitFailures++;
    console.error(
      `[signaling] validation error for token-prefix=${token.slice(0, 6)} ` +
        `(${_circuitFailures}/${CIRCUIT_FAILURE_THRESHOLD}):`,
      err instanceof Error ? err.message : String(err),
    );
    if (_circuitFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      _circuitFailures = 0;
      console.error(
        `[signaling] circuit OPEN — skipping validations for ${CIRCUIT_COOLDOWN_MS / 1000}s; ` +
          `cached-grace fallback only`,
      );
    }
    return degradedGrace(cacheKey);
  }
}

/**
 * Fallback when the upstream validation API is unreachable. Returns the
 * cached canonical id if any, IFF the token has a successful cache entry
 * within the degraded-grace window. Never grants access to tokens we
 * have not seen a "valid" answer for from musu.pro previously.
 */
function degradedGrace(cacheKey: string): ValidationResult {
  const cached = validationCache.get(cacheKey);
  if (!cached) {
    console.warn(
      `[signaling] degraded mode rejected unseen token-prefix=${cacheKey.slice(0, 6)}`,
    );
    return { valid: false, userId: null };
  }
  if (!cached.valid) {
    return { valid: false, userId: null };
  }
  const age = Date.now() - cached.timestamp;
  if (age > DEGRADED_GRACE_MS) {
    console.warn(
      `[signaling] degraded grace expired for token-prefix=${cacheKey.slice(0, 6)} ` +
        `(age=${Math.round(age / 1000)}s > ${DEGRADED_GRACE_MS / 1000}s)`,
    );
    return { valid: false, userId: null };
  }
  console.warn(
    `[signaling] degraded grace granted for token-prefix=${cacheKey.slice(0, 6)} ` +
      `(cache age=${Math.round(age / 1000)}s)`,
  );
  return { valid: true, userId: cached.canonicalUserId };
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

// V23.3 B2 (wiki/390 §3.4 + Critic C-B2-H1): Fly proxy is a single hop;
// trust exactly one hop so req.ip consumes the right-most X-Forwarded-For
// entry (the actual client IP), not the Fly proxy socket peer. Without
// this, the new /v1/telemetry/install_attempt rate-limit dimension
// "(install_id, source_ip)" would collapse to "(install_id, fly-proxy-ip)"
// — i.e. functionally per-install_id-only — and an attacker rotating
// install_id (a free [Guid]::NewGuid()) would get unlimited 20-token
// buckets.
//
// Side effect (intentional, positive defensive change): /install,
// /nat_pierce, /agent_spawn now also see real client IPs if any future
// code path reads req.ip. None do today.
app.set("trust proxy", 1);

const _startTime = Date.now();
let _totalPeers = 0;
let _totalRooms = 0;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Telemetry endpoints (V23.1 T1.5)
//
// V23.2 B1 commit 4: inject validateToken so the /issue_install_key route
// can derive a canonical user_id from the supplied tunnel token. We pass
// "" as the claimedUserId — historically (pre-B2) this hint mattered
// because the v21-era /validate upstream fell back to echoing the claim;
// post-B2 (wiki/365) the upstream always returns the canonical user_id
// in the 200 body and the claim is ignored on our side. The adapter
// normalizes ""→null defensively in case the upstream is ever rolled
// back to v21-era behavior.
//
// forceRefresh=true RETAINED as defense-in-depth (Critic LOW #2 RESOLVED,
// wiki/365 §15). Rationale:
//   - The validationCache is keyed on the token alone (server.ts:62 +
//     audit HIGH #3 fix). Even with the v21 fallback removed in B2-bee
//     (wiki/365), forceRefresh guarantees the bootstrap path never reads
//     a stale or attacker-poisoned cache entry written by a concurrent
//     WS HELLO.
//   - The HELLO handler at server.ts:429-432 now rejects userId=null
//     with 4003, but the cache write at server.ts:153-157 still happens
//     before HELLO sees the result — so a 200-with-empty-user_id from a
//     misconfigured upstream would land in the cache as
//     {valid:true, canonicalUserId:null} and the bootstrap path would
//     also see null and return 503 (correct). forceRefresh just ensures
//     this path never trusts cache writes it didn't initiate.
//
// This is a defense-in-depth gate: the WS HELLO path itself logs HELLO
// mismatches (server.ts:434-441) but does NOT reject the cache entry,
// so the bootstrap path must independently bypass it.
app.use(
  "/v1/telemetry",
  makeTelemetryRouter(async (token) => {
    const r = await validateToken(token, "", /* forceRefresh */ true);
    return {
      valid: r.valid,
      userId: r.userId && r.userId.length > 0 ? r.userId : null,
    };
  }),
);

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
      const result = await validateToken(msg.token, msg.user_id);
      if (!result.valid || !result.userId) {
        send(ws, { type: "ERROR", reason: "invalid token" });
        ws.close(4003, "unauthorized");
        return;
      }
      // Audit HIGH #3: use canonical userId from validation, never the
      // HELLO-supplied id. If the client claimed a different id, log the
      // mismatch but do not honor it — the validation API is authoritative.
      const canonicalUserId = result.userId;
      if (msg.user_id !== canonicalUserId) {
        console.warn(
          `[signaling] HELLO user_id mismatch: claimed=${msg.user_id} ` +
            `canonical=${canonicalUserId} — using canonical`,
        );
      }
      peer = {
        peerId: randomUUID(),
        userId: canonicalUserId,
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
      const departedPeerId = peer.peerId;
      leaveRoom(peer);
      const room = rooms.get(peer.userId);
      if (room) {
        for (const p of room) {
          // V23.2 T2.PROTO.1: include peer_id so the receiver can close
          // the specific session + native WebRTC handle (audit MED #6).
          send(p.ws, { type: "PEER_LEFT", peer_id: departedPeerId });
        }
      }
      console.log(
        `[signaling] peer left: user=${peer.userId} peer=${departedPeerId}`,
      );
    }
  });

  ws.on("error", (err) => {
    console.error(`[signaling] ws error:`, err);
  });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────

if (require.main === module) {
  // V23.2 audit HIGH #3: fail fast in production if the telemetry secret
  // is unset, so the operator sees the misconfig at deploy time rather
  // than discovering anonymous-telemetry months later.
  const bootErr = checkTelemetryAuthBootConfig(process.env);
  if (bootErr) {
    console.error(`[signaling] FATAL: ${bootErr}`);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`[signaling] listening on ${PORT}`);
  });
}

// ── Test helpers ─────────────────────────────────────────────────────────

/** Resets the in-memory validation cache + circuit breaker. Test-only. */
function _resetAuthState(): void {
  validationCache.clear();
  _circuitFailures = 0;
  _circuitOpenUntil = 0;
}

export {
  app,
  server,
  wss,
  validateToken,
  rooms,
  _resetAuthState,
  validationCache as _validationCache,
};
