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

import { signAndPost } from "./telemetry-hmac";

// ── Protocol types (mirror src/signaling/server.ts) ──────────────────────

export type PeerRole = "gateway" | "visitor";

interface RoomPeer {
  peer_id: string;
  role: PeerRole;
}

type ServerMessage =
  | { type: "WELCOME"; peer_id: string }
  | { type: "PEER_JOINED"; room_peers: RoomPeer[] }
  // V23.2 T2.PROTO.1: peer_id is optional for backward compat with v1
  // signaling servers that don't include it. New servers always send it.
  | { type: "PEER_LEFT"; peer_id?: string }
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

// Minimal DataChannel-shaped interface that all PC implementations must
// be able to surface once the channel is open. Duplicated from
// gateway/bridge.ts's DataChannelLike to avoid a circular import — the
// shape is the W3C DataChannel surface our bridge actually uses.
export interface PcDataChannel {
  readyState: "connecting" | "open" | "closing" | "closed";
  send(data: string): void;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export interface SimplePeerConnection {
  createOffer(): Promise<string>;
  createAnswer(remoteSdp: string): Promise<string>;
  acceptAnswer(remoteSdp: string): Promise<void>;
  addRemoteIceCandidate(candidate: string): Promise<void>;
  onLocalIceCandidate(cb: (candidate: string) => void): void;
  onDataChannelOpen(cb: () => void): void;
  /** Returns the open DataChannel once onDataChannelOpen has fired; null
   *  before that or if the implementation does not expose the DC
   *  directly (e.g. relay impls). V23.2 audit LOW #12: lifted to a
   *  required-but-nullable method so callers stop reaching for
   *  `(pc as any).getDataChannel()`. */
  getDataChannel(): PcDataChannel | null;
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
  /** Telemetry endpoint base. If set, gateway POSTs nat_pierce events
   *  after each handshake attempt (T1.12). Example:
   *  `https://signaling.musu.pro/v1/telemetry`. Omit to disable. */
  telemetryBase?: string;
  /** Identifies this install for telemetry correlation. Required if
   *  telemetryBase is set. */
  musuInstallId?: string;
  /** Shared secret for telemetry endpoint auth (V23.2 T2.AUTH.2 interim).
   *  Sent in the `x-musu-telemetry-secret` header. The installer
   *  (Workstream B) configures gateway with this at build time. Server
   *  validates against its MUSU_TELEMETRY_SHARED_SECRET env var.
   *  Legacy path; superseded by `accountKey` (V23.2 B1, wiki/363 §6.1).
   *  Both fields may coexist during dual-accept rollout; `accountKey`
   *  takes precedence when set. Removed in V23.3 once HMAC_ONLY ships. */
  telemetrySharedSecret?: string;
  /** Per-account HMAC key (64-char lowercase hex, 256-bit) for telemetry
   *  endpoint auth (V23.2 B1 final, wiki/363 §6.1). When set, gateway
   *  signs each telemetry POST with HMAC-SHA256(accountKey, t + "." + body)
   *  and sends `x-musu-user-id` + `x-musu-telemetry-signature` headers
   *  (NOT `x-musu-telemetry-secret`). When unset and `telemetryBase` is
   *  set, gateway calls `/issue_install_key` on first connect to acquire
   *  one (in-memory only; persistence deferred to B4b per Critic HIGH #1).
   *  Hard-fails on 409 from the issue endpoint — caller must pass an
   *  existing key explicitly, or wait for rotation (B1.x). */
  accountKey?: string;
  /** Override the fetch impl (test injection). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Hard deadline for a single handshake attempt. After this, the
   *  pending session is recorded as `fail/timeout`. Default 15s. */
  handshakeTimeoutMs?: number;
}

interface PeerSession {
  remotePeerId: string;
  pc: SimplePeerConnection;
  startedAt: number;
  iceCount: number;
  settled: boolean;
  timeoutTimer: NodeJS.Timeout | null;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private myPeerId: string | null = null;
  private sessions = new Map<string, PeerSession>(); // remotePeerId → session
  private log: (line: string) => void;
  // Welcome-poll timers tracked so close() can cancel mid-handshake.
  private welcomeTimer: NodeJS.Timeout | null = null;
  private welcomeInterval: NodeJS.Timeout | null = null;
  private closed = false;
  /** Bootstrap-acquired HMAC key. Holds the value returned by
   *  /issue_install_key on first connect, when `cfg.accountKey` was unset.
   *  Header construction prefers `this.bootstrappedAccountKey ?? this.cfg.accountKey`.
   *  In-memory only — wiped on process exit. Persistence is B4b's job.
   *  Exposed publicly via the `accountKey` getter for B4b main.ts (C14). */
  private bootstrappedAccountKey: string | undefined;

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

    // Wait for WELCOME to learn our peerId. Track timers on the instance so
    // close() can cancel mid-handshake (audit #5).
    await new Promise<void>((resolve, reject) => {
      this.welcomeTimer = setTimeout(() => {
        if (this.welcomeInterval) clearInterval(this.welcomeInterval);
        this.welcomeInterval = null;
        this.welcomeTimer = null;
        reject(new Error("WELCOME timeout"));
      }, 5000);
      this.welcomeInterval = setInterval(() => {
        if (this.closed) {
          if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
          if (this.welcomeInterval) clearInterval(this.welcomeInterval);
          this.welcomeTimer = null;
          this.welcomeInterval = null;
          reject(new Error("closed before WELCOME"));
          return;
        }
        if (this.myPeerId !== null) {
          if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
          if (this.welcomeInterval) clearInterval(this.welcomeInterval);
          this.welcomeTimer = null;
          this.welcomeInterval = null;
          resolve();
        }
      }, 20);
    });

    // V23.2 B1 commit 5 (wiki/363 §6.3): acquire HMAC key BEFORE any
    // PEER_JOINED can trigger a handshake that drives recordOutcome().
    // No-op if accountKey is already configured or telemetry is disabled.
    // 409 rethrows here (hard-fail per Critic HIGH #1 resolution); other
    // failure modes (503, 401, network) leave accountKey unset and the
    // telemetry POST path falls through to legacy shared-secret / no-auth.
    await this.bootstrapAccountKey();
  }

  /** Graceful shutdown. */
  close(): void {
    this.closed = true;
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    if (this.welcomeInterval) clearInterval(this.welcomeInterval);
    this.welcomeTimer = null;
    this.welcomeInterval = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "BYE" });
    }
    for (const s of this.sessions.values()) {
      if (s.timeoutTimer) clearTimeout(s.timeoutTimer);
      s.pc.close();
    }
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
        // V23.2 T2.PROTO.1: server now sends peer_id with PEER_LEFT.
        // Backward compat: v1 servers (V23.1) omitted it — in that case
        // we no-op (best we can do, audit MED #6 partial).
        if (!m.peer_id) {
          this.log(`[gateway] PEER_LEFT without peer_id (v1 server)`);
          return;
        }
        const session = this.sessions.get(m.peer_id);
        if (session) {
          if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
          session.pc.close();
          this.sessions.delete(m.peer_id);
          this.log(`[gateway] cleaned up session for departed peer=${m.peer_id}`);
        }
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
    const session: PeerSession = {
      remotePeerId,
      pc,
      startedAt: Date.now(),
      iceCount: 0,
      settled: false,
      timeoutTimer: null,
    };
    pc.onLocalIceCandidate((candidate) => {
      session.iceCount++;
      this.send({ type: "ICE_CANDIDATE", to_peer: remotePeerId, candidate });
    });
    pc.onDataChannelOpen(() => {
      this.log(`[gateway] datachannel open to peer=${remotePeerId}`);
      void this.recordOutcome(session, "success", null);
      this.cfg.onPeerConnected?.(remotePeerId, pc);
    });
    // Arm handshake timeout — covers the case where SDP exchange completes
    // but ICE never finds a path (most common CGNAT failure mode in the wild).
    const timeoutMs = this.cfg.handshakeTimeoutMs ?? 15000;
    session.timeoutTimer = setTimeout(() => {
      if (!session.settled) {
        void this.recordOutcome(session, "fail", "timeout");
      }
    }, timeoutMs);
    s = session;
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

  // ── Telemetry (T1.12) ──────────────────────────────────────────────────

  /** V23.2 B1 commit 5 (wiki/363 §6.3). On first connect, when the caller
   *  has not provided `accountKey` and telemetry is enabled, fetch one
   *  from `/issue_install_key`. The acquired key is held in
   *  `this.bootstrappedAccountKey` for the lifetime of the process only — file
   *  persistence is deferred to B4b (Critic HIGH #1 resolution).
   *
   *  Outcomes:
   *  - `200`: stored, telemetry will use HMAC headers
   *  - `409`: throws (hard-fail; another install already issued for this
   *    user. B1.x adds rotation; B4b adds persistence to make this rare.)
   *  - `503`: musu.pro `/validate` does not yet return canonical user_id
   *    (Design A pre-B2-deploy state). Telemetry stays disabled; gateway
   *    proceeds. Caller observes via logs.
   *  - `401`: bad tunnel_token. Signaling will fail too; we log and continue.
   *  - Network error / other: log and continue (best-effort). */
  private async bootstrapAccountKey(): Promise<void> {
    // Caller already supplied a key — nothing to do.
    if (this.cfg.accountKey) return;
    // Telemetry disabled — no key needed.
    if (!this.cfg.telemetryBase) return;
    // Without an install id we can't correlate telemetry rows anyway;
    // server requires it in the request body.
    if (!this.cfg.musuInstallId) {
      this.log(
        `[gateway] bootstrapAccountKey skipped: musuInstallId unset`,
      );
      return;
    }
    const fetchImpl = this.cfg.fetchImpl ?? globalThis.fetch;
    let resp: Response;
    try {
      resp = await fetchImpl(
        `${this.cfg.telemetryBase}/issue_install_key`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tunnel_token: this.cfg.token,
            musu_install_id: this.cfg.musuInstallId,
          }),
        },
      );
    } catch (err) {
      // Network failure. Telemetry stays disabled until next process
      // start. Do NOT throw — gateway must still serve signaling.
      this.log(
        `[gateway] bootstrapAccountKey network error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (resp.status === 200) {
      const body = (await resp.json()) as { account_key?: string };
      if (typeof body.account_key === "string" && body.account_key.length > 0) {
        this.bootstrappedAccountKey = body.account_key;
        this.log(`[gateway] bootstrapAccountKey OK: account_key acquired`);
      } else {
        this.log(
          `[gateway] bootstrapAccountKey 200 but body missing account_key`,
        );
      }
      return;
    }
    if (resp.status === 409) {
      // Hard-fail. B1 has no persistence story; the operator must either
      // (a) wire the existing accountKey explicitly into config, or (b)
      // wait for the B1.x rotation header. Throwing here forces the
      // operator to confront the misconfiguration instead of silently
      // running with no auth.
      throw new Error(
        "Account already has a telemetry key. Provide it via accountKey config, " +
          "or rotate (lands in B1.x). Persistent storage lands in V23.2 B4b.",
      );
    }
    if (resp.status === 503) {
      // Design A: musu.pro hasn't deployed B2 yet (no canonical user_id).
      // Telemetry stays disabled for this process. Gateway proceeds.
      this.log(
        `[gateway] bootstrapAccountKey 503: musu.pro canonical user_id unavailable; telemetry disabled`,
      );
      return;
    }
    if (resp.status === 401) {
      this.log(`[gateway] bootstrapAccountKey 401: bad tunnel_token`);
      return;
    }
    this.log(
      `[gateway] bootstrapAccountKey unexpected status ${resp.status}`,
    );
  }

  private telemetryRecords: TelemetryNatPierce[] = [];

  /** For tests: read back what we would have POSTed. */
  get recordedTelemetry(): readonly TelemetryNatPierce[] {
    return this.telemetryRecords;
  }

  /** Bootstrap-path C14 gap fix: expose the effective accountKey so main.ts
   *  can sign install_completed regardless of whether the key came from the
   *  installer-pre-write path (cfg.accountKey) or the in-memory bootstrap path
   *  (bootstrappedAccountKey from /issue_install_key). Mirrors the fallback in
   *  recordOutcome(). Read-only.
   */
  get accountKey(): string | undefined {
    return this.bootstrappedAccountKey ?? this.cfg.accountKey;
  }

  private async recordOutcome(
    session: PeerSession,
    outcome: "success" | "fail",
    failCause: NatPierceFailCause | null,
  ): Promise<void> {
    if (session.settled) return;
    session.settled = true;
    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
      session.timeoutTimer = null;
    }
    const record: TelemetryNatPierce = {
      musu_install_id: this.cfg.musuInstallId ?? "unknown",
      attempt_outcome: outcome,
      fail_cause: failCause,
      ice_candidate_count: session.iceCount,
      elapsed_ms: Date.now() - session.startedAt,
    };
    this.telemetryRecords.push(record);
    if (!this.cfg.telemetryBase) return;
    if (!this.cfg.musuInstallId) {
      this.log(`[gateway] telemetry skipped: musuInstallId not set`);
      return;
    }
    const fetchImpl = this.cfg.fetchImpl ?? globalThis.fetch;
    // V23.2 B1 (wiki/363 §6.2) → V23.3 A3 (wiki/379 §2 A3): rawBody is
    // JSON.stringify'd ONCE here. The signAndPost helper from
    // telemetry-hmac.ts then uses the SAME string for both HMAC signing
    // input and fetch body, structurally guaranteeing the body-identity
    // invariant that V23.2 B1 commit 5 introduced as discipline.
    const rawBody = JSON.stringify(record);
    // Prefer the bootstrap-acquired key; fall back to caller-supplied.
    const effectiveAccountKey = this.bootstrappedAccountKey ?? this.cfg.accountKey;
    if (effectiveAccountKey) {
      const result = await signAndPost({
        url: `${this.cfg.telemetryBase}/nat_pierce`,
        rawBody,
        accountKey: effectiveAccountKey,
        userId: this.cfg.userId,
        fetchImpl,
        log: (l) => this.log(l),
      });
      if (result.error) {
        this.log(
          `[gateway] telemetry POST failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
        );
      }
    } else {
      // Non-HMAC paths: either legacy shared-secret (T2.AUTH.2 interim) or
      // unauth (server policy decides whether to 401). Both use the same
      // fetch shape; helper does NOT cover them because shared-secret has
      // no rawBody/signing relationship and unauth has no auth header.
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.cfg.telemetrySharedSecret) {
        headers["x-musu-telemetry-secret"] = this.cfg.telemetrySharedSecret;
      }
      try {
        await fetchImpl(`${this.cfg.telemetryBase}/nat_pierce`, {
          method: "POST",
          headers,
          body: rawBody,
        });
      } catch (err) {
        this.log(
          `[gateway] telemetry POST failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

// ── Telemetry schema (mirrors v40_telemetry.sql, telemetry_nat_pierce) ──

export type NatPierceFailCause =
  | "cgnat_detected"
  | "symmetric_nat"
  | "firewall"
  | "timeout";

export interface TelemetryNatPierce {
  musu_install_id: string;
  attempt_outcome: "success" | "fail";
  fail_cause: NatPierceFailCause | null;
  ice_candidate_count: number;
  elapsed_ms: number;
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
