// musu-relay-gateway WebRTC signaling client (V23.1 T1.8)
//
// Role under V23 product model (per docs/V23_MASTER_PLAN_2026_05_15.md §3 + §10):
//   - Runs on the user's PC alongside K3s
//   - Connects out to musu.pro signaling as role="gateway"
//   - When an external visitor (role="visitor") joins the same per-user room,
//     negotiates a direct WebRTC DataChannel and (T1.10) bridges it to the
//     local K3s HTTP API
//   - Carries no signaling state of its own — every decision is driven by
//     the server's WELCOME / PEER_JOINED / OFFER / ANSWER / ICE_CANDIDATE /
//     PEER_LEFT messages
//
// What this file is NOT (deliberately deferred to T1.9):
//   - The actual RTCPeerConnection. `@roamhq/wrtc` is the chosen binding
//     but its native build is the riskiest part of V23.1. T1.8 keeps the
//     client binding-agnostic by accepting a PeerConnectionFactory at
//     construction time — T1.9 plugs the real impl in; tests use a stub.
//
// Lifecycle:
//   connect() → WS open → HELLO → WELCOME (we now know our peerId) →
//   (room may already contain a visitor — server sends PEER_JOINED with
//    room_peers, we initiate OFFER to any peer with role="visitor") →
//   exchange ICE candidates → DataChannel "open" → handoff to bridge

import WebSocket from "ws";

// ── Protocol types (mirror src/signaling/server.ts) ──────────────────────

export type PeerRole = "gateway" | "visitor";

interface RoomPeer {
  peer_id: string;
  role: PeerRole;
}

type ServerMessage =
  | { type: "WELCOME"; peer_id: string }
  | { type: "PEER_JOINED"; room_peers: RoomPeer[] }
  | { type: "PEER_LEFT" }
  | { type: "OFFER"; from_peer: string; sdp: string }
  | { type: "ANSWER"; from_peer: string; sdp: string }
  | { type: "ICE_CANDIDATE"; from_peer: string; candidate: string }
  | { type: "ERROR"; reason: string };

type ClientMessage =
  | { type: "HELLO"; token: string; user_id: string; role: PeerRole }
  | { type: "OFFER"; to_peer: string; sdp: string }
  | { type: "ANSWER"; to_peer: string; sdp: string }
  | { type: "ICE_CANDIDATE"; to_peer: string; candidate: string }
  | { type: "BYE"; to_peer?: string };

// ── PeerConnection abstraction (T1.9 fills this in) ─────────────────────
//
// The factory pattern keeps T1.8 free of native-binding imports so tests
// can stub it out. Real impl in T1.9 uses `@roamhq/wrtc`'s RTCPeerConnection.

export interface SimplePeerConnection {
  createOffer(): Promise<string>;
  createAnswer(remoteSdp: string): Promise<string>;
  acceptAnswer(remoteSdp: string): Promise<void>;
  addRemoteIceCandidate(candidate: string): Promise<void>;
  onLocalIceCandidate(cb: (candidate: string) => void): void;
  onDataChannelOpen(cb: () => void): void;
  close(): void;
}

export interface PeerConnectionFactory {
  create(remotePeerId: string, stunServers: string[]): SimplePeerConnection;
}

// ── Gateway client config + state ────────────────────────────────────────

export interface GatewayConfig {
  signalingUrl: string;            // e.g. "wss://signaling.musu.pro/signaling"
  token: string;                   // paid-tier auth token
  userId: string;                  // musu.pro user id
  stunServers: string[];           // T1.13 — default to Google + 2 backups
  pcFactory: PeerConnectionFactory; // T1.9 injects real impl
  onLog?: (line: string) => void;  // optional log sink; defaults to console
  /** Fires once per remote peer when its DataChannel opens. T1.10 hooks
   *  the BridgeServer here so each session gets its own HTTP forwarder. */
  onPeerConnected?: (remotePeerId: string, pc: SimplePeerConnection) => void;
}

interface PeerSession {
  remotePeerId: string;
  pc: SimplePeerConnection;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private myPeerId: string | null = null;
  private sessions = new Map<string, PeerSession>(); // remotePeerId → session
  private log: (line: string) => void;

  constructor(private readonly cfg: GatewayConfig) {
    this.log = cfg.onLog ?? ((l) => console.log(l));
  }

  /** Establish the WebSocket to signaling and send HELLO. Resolves on WELCOME. */
  async connect(): Promise<void> {
    const ws = new WebSocket(this.cfg.signalingUrl);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e));
    });

    this.send({
      type: "HELLO",
      token: this.cfg.token,
      user_id: this.cfg.userId,
      role: "gateway",
    });

    ws.on("message", (raw) => this.handleServerMessage(raw.toString()));
    ws.on("close", (code) => {
      this.log(`[gateway] ws closed code=${code}`);
      for (const s of this.sessions.values()) s.pc.close();
      this.sessions.clear();
    });
    ws.on("error", (e) =>
      this.log(`[gateway] ws error: ${e instanceof Error ? e.message : String(e)}`),
    );

    // Wait for WELCOME to learn our peerId.
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("WELCOME timeout")), 5000);
      const check = setInterval(() => {
        if (this.myPeerId !== null) {
          clearTimeout(t);
          clearInterval(check);
          resolve();
        }
      }, 20);
    });
  }

  /** Graceful shutdown. */
  close(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "BYE" });
    }
    for (const s of this.sessions.values()) s.pc.close();
    this.sessions.clear();
    this.ws?.close();
  }

  /** For tests: current peer id once WELCOME arrived. */
  get peerId(): string | null {
    return this.myPeerId;
  }

  /** For tests: which remote peers we have active PCs to. */
  get activeRemotePeerIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private handleServerMessage(raw: string): void {
    let m: ServerMessage;
    try {
      m = JSON.parse(raw);
    } catch {
      this.log(`[gateway] bad JSON from signaling`);
      return;
    }

    switch (m.type) {
      case "WELCOME":
        this.myPeerId = m.peer_id;
        this.log(`[gateway] welcomed as peer=${m.peer_id}`);
        return;

      case "PEER_JOINED": {
        // Server tells us the current room roster. For each visitor in the
        // room that we don't already have a session with, initiate OFFER.
        for (const p of m.room_peers) {
          if (p.role !== "visitor") continue;
          if (p.peer_id === this.myPeerId) continue;
          if (this.sessions.has(p.peer_id)) continue;
          void this.initiateOfferTo(p.peer_id);
        }
        return;
      }

      case "PEER_LEFT": {
        // Server doesn't tell us *which* peer left in V23.1 — close all
        // sessions whose remote has gone away. T1.x: server-side enhancement
        // to include peer_id in PEER_LEFT would let us be selective.
        // For now this is a coarse cleanup that's acceptable for spike.
        return;
      }

      case "OFFER":
        void this.handleOffer(m.from_peer, m.sdp);
        return;

      case "ANSWER":
        void this.handleAnswer(m.from_peer, m.sdp);
        return;

      case "ICE_CANDIDATE":
        void this.handleRemoteIce(m.from_peer, m.candidate);
        return;

      case "ERROR":
        this.log(`[gateway] signaling ERROR: ${m.reason}`);
        return;
    }
  }

  private getOrCreateSession(remotePeerId: string): PeerSession {
    let s = this.sessions.get(remotePeerId);
    if (s) return s;
    const pc = this.cfg.pcFactory.create(remotePeerId, this.cfg.stunServers);
    pc.onLocalIceCandidate((candidate) => {
      this.send({ type: "ICE_CANDIDATE", to_peer: remotePeerId, candidate });
    });
    pc.onDataChannelOpen(() => {
      this.log(`[gateway] datachannel open to peer=${remotePeerId}`);
      this.cfg.onPeerConnected?.(remotePeerId, pc);
    });
    s = { remotePeerId, pc };
    this.sessions.set(remotePeerId, s);
    return s;
  }

  private async initiateOfferTo(remotePeerId: string): Promise<void> {
    const s = this.getOrCreateSession(remotePeerId);
    const sdp = await s.pc.createOffer();
    this.send({ type: "OFFER", to_peer: remotePeerId, sdp });
  }

  private async handleOffer(from: string, sdp: string): Promise<void> {
    // Gateway normally initiates, but accept incoming OFFER for robustness.
    const s = this.getOrCreateSession(from);
    const answer = await s.pc.createAnswer(sdp);
    this.send({ type: "ANSWER", to_peer: from, sdp: answer });
  }

  private async handleAnswer(from: string, sdp: string): Promise<void> {
    const s = this.sessions.get(from);
    if (!s) {
      this.log(`[gateway] ANSWER from unknown peer=${from}`);
      return;
    }
    await s.pc.acceptAnswer(sdp);
  }

  private async handleRemoteIce(from: string, candidate: string): Promise<void> {
    const s = this.sessions.get(from);
    if (!s) {
      this.log(`[gateway] ICE_CANDIDATE from unknown peer=${from}`);
      return;
    }
    await s.pc.addRemoteIceCandidate(candidate);
  }
}

// ── Default STUN servers (T1.13 final pick) ──────────────────────────────
//
// No TURN per V23 master plan §0.2 O4-b — TURN would defeat True P2P (L7).
// If both peers are behind symmetric NAT / CGNAT, handshake fails and
// musu.pro upsells the user to the "remote-only" paid tier (a separate
// product surface, not a covert relay).

export const DEFAULT_STUN_SERVERS: string[] = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun.cloudflare.com:3478",
];
