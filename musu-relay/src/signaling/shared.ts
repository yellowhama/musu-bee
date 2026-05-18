// musu-relay/src/signaling/shared.ts
//
// V23.4 T2-F (wiki/433): wire-protocol primitives shared by
//   - server.ts (cloud variant on signaling.musu.pro — legacy backward-compat)
//   - user-server.ts (user-PC rendezvous on LAN — self-contained product per
//     V23.4 Phase 4 [[feedback-self-contained-product]])
//
// HARD INVARIANT (Critic C-T2F-H1): this module imports ONLY:
//   - node:* builtins
//   - ws (WebSocket types)
// It MUST NOT import:
//   - ./telemetry       (pulls better-sqlite3)
//   - better-sqlite3    (native binding, ~20MB compile on user PC)
//   - any cloud-only auth-bootstrap helpers
//
// All wire-protocol behavior is lifted byte-for-byte from the pre-refactor
// server.ts at :100-516. signaling.test.ts MUST pass UNMODIFIED after the
// refactor (C-T2F-H5 zero-behavior-change gate). server.ts imports these
// back and continues to re-export `_validationCache` for tests that load
// from "./server".

import { WebSocket } from "ws";
import { randomUUID } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────
// VALIDATION_API and circuit-breaker constants live here (per OQ-A2 /
// NEW-A1) because both cloud and user-server need token validation against
// musu.pro until V23.5 LAN-no-auth.
export const VALIDATION_API =
  process.env.MUSU_VALIDATION_API ||
  "https://musu.pro/api/v1/nodes/validate";

const CACHE_TTL_MS = 30_000;
// During an upstream outage, previously-valid tokens get this much extra
// grace before being rejected. Bounds how long a real revocation takes to
// propagate when musu.pro is also down.
const DEGRADED_GRACE_MS = 5 * 60_000;

export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_COOLDOWN_MS = 30_000;

// ── Types (lifted verbatim from server.ts ground truth) ───────────────────
// (NEW-A1 / NEW-A2: PeerRole, SignalingMessage, ServerMessage MUST be exported
//  because the lifted _wssConnectionHandler closure references them.)
export type PeerRole = "gateway" | "visitor";

export interface Peer {
  peerId: string; // ephemeral, generated at WS connect
  userId: string; // musu.pro user id (paid tier)
  role: PeerRole; // gateway = user's PC; visitor = browser from outside
  ws: WebSocket;
  joinedAt: number;
}

export interface CacheEntry {
  valid: boolean;
  // Canonical userId returned by the validation API. Only trusted when
  // valid=true. Becomes the room key — never the HELLO-supplied user_id.
  canonicalUserId: string | null;
  timestamp: number;
}

/**
 * Result of token validation.
 *
 * V23.2 T2.AUTH.3 hardening: HELLO's `user_id` field is now untrusted.
 * The canonical room key is the `userId` field of this result, which is
 * sourced from the validation API response — never from the client's
 * HELLO message.
 */
export interface ValidationResult {
  valid: boolean;
  /** Canonical userId from musu.pro. Null when valid=false, or when a
   *  200 response is missing the `user_id` field (post-B2 strict mode).
   *  HELLO handler rejects null with 4003. */
  userId: string | null;
}

export type SignalingMessage =
  | { type: "HELLO"; token: string; user_id: string; role: PeerRole }
  | { type: "OFFER"; to_peer: string; sdp: string }
  | { type: "ANSWER"; to_peer: string; sdp: string }
  | { type: "ICE_CANDIDATE"; to_peer: string; candidate: string }
  | { type: "BYE"; to_peer?: string };

export interface ServerMessage {
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

// ── Module-level mutable state ────────────────────────────────────────────
// READ + WRITE by validateToken, _resetAuthState, and /metrics. Exported
// under underscore-prefixed names per NEW-A3 / OQ-A1. server.ts imports
// via alias so internal call sites stay byte-identical:
//   import { _validationCache as validationCache } from "./shared";
// signaling.test.ts continues to import `_validationCache` from "./server"
// (server.ts re-exports it for backward compat).

export const _validationCache: Map<string, CacheEntry> = new Map();
export const rooms: Map<string, Set<Peer>> = new Map();

// Circuit-breaker state — `let` so cross-file mutations persist via
// in-module read/writes (the validateToken function below mutates these).
// External readers should access via getters or accept that they see the
// up-to-date value because all mutations happen inside this same module.
export let _circuitFailures = 0;
export let _circuitOpenUntil = 0;

// /metrics counters — incremented by _wssConnectionHandler when peers join.
export let _totalPeers = 0;
export let _totalRooms = 0;

// ── Token validation (lifted verbatim from server.ts:100-215) ─────────────
// Behavior unchanged: cache hit → cache result; circuit open → degraded
// grace; otherwise fetch + record + fail-closed-with-grace.

export async function validateToken(
  token: string,
  claimedUserId: string,
  forceRefresh = false,
): Promise<ValidationResult> {
  // Cache key is the token alone — V23.2 fix for audit HIGH #3.
  const cacheKey = token;

  if (!forceRefresh) {
    const cached = _validationCache.get(cacheKey);
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
    _validationCache.set(cacheKey, {
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
 * within the degraded-grace window.
 */
function degradedGrace(cacheKey: string): ValidationResult {
  const cached = _validationCache.get(cacheKey);
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

// ── Room helpers (lifted verbatim from server.ts:237-251, 287-306) ───────

export function joinRoom(peer: Peer): void {
  let room = rooms.get(peer.userId);
  if (!room) {
    room = new Set();
    rooms.set(peer.userId, room);
  }
  room.add(peer);
}

export function leaveRoom(peer: Peer): void {
  const room = rooms.get(peer.userId);
  if (!room) return;
  room.delete(peer);
  if (room.size === 0) rooms.delete(peer.userId);
}

export function findPeerInRoom(userId: string, peerId: string): Peer | null {
  const room = rooms.get(userId);
  if (!room) return null;
  for (const p of room) {
    if (p.peerId === peerId) return p;
  }
  return null;
}

export function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function broadcastRoomChange(userId: string): void {
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

// ── Connection handler (lifted verbatim from server.ts:409-516) ──────────
// Per OQ-CRIT-5: named exported function with explicit signature so both
// server.ts and user-server.ts can do `wss.on("connection", _wssConnectionHandler)`.
// signaling.test.ts MUST pass UNMODIFIED after this extraction.

export function _wssConnectionHandler(ws: WebSocket): void {
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
}

// ── Test helpers ─────────────────────────────────────────────────────────

/** Resets the in-memory validation cache + circuit breaker. Test-only.
 *  Per NEW-A1 MUST-do: resets ALL THREE pieces of state. */
export function _resetAuthState(): void {
  _validationCache.clear();
  _circuitFailures = 0;
  _circuitOpenUntil = 0;
}
