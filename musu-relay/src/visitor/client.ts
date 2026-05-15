// musu-relay-visitor client (V23.1 T1.11).
//
// Role:
//   Visitor-side WebRTC client for musu-bee web. Connects out to
//   musu.pro signaling as role="visitor", waits for the user's gateway
//   to join the same per-user room, completes the handshake (gateway
//   initiates OFFER, visitor returns ANSWER), and once the DataChannel
//   is open exposes a fetch-shaped `request(...)` for HTTP-over-DC to
//   the user's local K3s.
//
// Why a separate file from src/gateway/client.ts:
//   Gateway lives on the user's PC (Node), visitor lives in browsers
//   (musu-bee web). Both speak the same signaling protocol but the
//   directions of OFFER/ANSWER are inverted and the DC ownership is
//   inverted (gateway creates DC up front; visitor receives it via
//   ondatachannel). Keeping them apart so each side can be small and
//   readable in its native environment.
//
// Browser usage:
//   const c = new VisitorClient({
//     signalingUrl: "wss://signaling.musu.pro/signaling",
//     token, userId,
//     wsImpl: WebSocket,            // browser global
//     pcFactory: makeBrowserAnswererFactory(),
//   });
//   await c.connect();             // resolves when DC is open
//   const r = await c.request({ method: "GET", path: "/api/v1/namespaces" });
//
// Tests inject the Node `ws` package and the @roamhq/wrtc answerer
// factory so the same class is exercised end-to-end in Jest.

import { BridgeClient, BridgeClientResponse, DataChannelLike } from "../gateway/bridge";
import { PeerConnectionFactory, SimplePeerConnection } from "../gateway/client";

// ── Cross-environment WebSocket abstraction ──────────────────────────────
//
// Browser `WebSocket` exposes `onopen`/`onmessage`/etc as properties,
// while the Node `ws` package's WebSocket uses EventEmitter (`on(...)`).
// We accept either via this narrow interface plus a `ctor` that matches
// the standard `new WebSocket(url)` shape.

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "close", listener: (ev: { code: number }) => void): void;
  addEventListener(type: "error", listener: (ev: unknown) => void): void;
  addEventListener(type: "message", listener: (ev: { data: string }) => void): void;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

// Adapter for the Node `ws` package's WebSocket which uses `on(...)` rather
// than `addEventListener(...)`. Browser WebSocket already supports
// addEventListener so we use it directly.
export function wrapNodeWs(WsCtor: any): WebSocketCtor {
  return class implements WebSocketLike {
    private readonly inner: any;
    constructor(url: string) {
      this.inner = new WsCtor(url);
    }
    get readyState(): number {
      return this.inner.readyState;
    }
    send(data: string): void {
      this.inner.send(data);
    }
    close(code?: number, reason?: string): void {
      this.inner.close(code, reason);
    }
    addEventListener(type: string, listener: any): void {
      if (type === "open") this.inner.on("open", () => listener());
      else if (type === "close")
        this.inner.on("close", (code: number) => listener({ code }));
      else if (type === "error")
        this.inner.on("error", (e: unknown) => listener(e));
      else if (type === "message")
        this.inner.on("message", (raw: any) => listener({ data: raw.toString() }));
    }
  };
}

// ── Visitor-specific PeerConnection contract ─────────────────────────────
//
// SimplePeerConnection from gateway/client.ts is direction-agnostic. The
// visitor-side wrtc-factory (makeWrtcAnswererFactory in T1.9) returns
// the answerer role, which also exposes getDataChannel() to retrieve
// the DC once ondatachannel fires. We use the same interface plus a
// helper accessor.

export interface VisitorPeerConnection extends SimplePeerConnection {
  /** Returns the DC once ondatachannel has fired; null before that. */
  getDataChannel?(): DataChannelLike | null;
}

export interface VisitorPeerConnectionFactory extends PeerConnectionFactory {
  create(remotePeerId: string, stunServers: string[]): VisitorPeerConnection;
}

// ── Config + state ───────────────────────────────────────────────────────

export interface VisitorConfig {
  signalingUrl: string;
  token: string;
  userId: string;
  /** STUN servers; pass [] for LAN-only / localhost tests. */
  stunServers: string[];
  /** WebSocket constructor. Browser: `WebSocket`. Node tests: wrapNodeWs(require('ws')). */
  wsImpl: WebSocketCtor;
  /** Answerer-side PC factory. Browser: implement with native RTCPeerConnection. */
  pcFactory: VisitorPeerConnectionFactory;
  onLog?: (line: string) => void;
  /** Hard deadline for the full open-WS-through-DC-open path. Default 15s. */
  connectTimeoutMs?: number;
}

// ── VisitorClient ────────────────────────────────────────────────────────

export class VisitorClient {
  private ws: WebSocketLike | null = null;
  private pc: VisitorPeerConnection | null = null;
  private bridge: BridgeClient | null = null;
  private myPeerId: string | null = null;
  private gatewayPeerId: string | null = null;
  private readonly log: (line: string) => void;
  private pendingLocalIce: string[] = [];

  constructor(private readonly cfg: VisitorConfig) {
    this.log = cfg.onLog ?? ((l) => console.log(l));
  }

  /** Returns once the DataChannel is open and ready for requests. */
  async connect(): Promise<void> {
    const ws = new this.cfg.wsImpl(this.cfg.signalingUrl);
    this.ws = ws;

    let dcOpenResolve: (() => void) | undefined;
    let dcOpenReject: ((e: Error) => void) | undefined;
    const dcOpen = new Promise<void>((resolve, reject) => {
      dcOpenResolve = resolve;
      dcOpenReject = reject;
    });

    const timeoutMs = this.cfg.connectTimeoutMs ?? 15000;
    const timeoutTimer = setTimeout(() => {
      dcOpenReject?.(new Error(`VisitorClient.connect timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.addEventListener("error", (e) => {
      this.log(`[visitor] ws error: ${(e as Error)?.message ?? e}`);
      dcOpenReject?.(new Error("ws error during connect"));
    });
    ws.addEventListener("close", () => {
      if (!this.bridge) dcOpenReject?.(new Error("ws closed before DC open"));
    });

    // Create the PC up-front so we can attach handlers before any
    // signaling round-trip can occur.
    const pc = this.cfg.pcFactory.create("pending-gateway", this.cfg.stunServers);
    this.pc = pc;

    pc.onLocalIceCandidate((candidate) => {
      if (this.gatewayPeerId && ws.readyState === 1 /* OPEN */) {
        ws.send(
          JSON.stringify({
            type: "ICE_CANDIDATE",
            to_peer: this.gatewayPeerId,
            candidate,
          }),
        );
      } else {
        this.pendingLocalIce.push(candidate);
      }
    });

    pc.onDataChannelOpen(() => {
      const dc = pc.getDataChannel?.() ?? null;
      if (!dc) {
        dcOpenReject?.(new Error("DC opened but factory did not expose it"));
        return;
      }
      this.bridge = new BridgeClient(dc);
      clearTimeout(timeoutTimer);
      dcOpenResolve?.();
    });

    ws.addEventListener("message", async (ev) => {
      let m: any;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === "WELCOME") {
        this.myPeerId = m.peer_id;
      } else if (m.type === "OFFER") {
        this.gatewayPeerId = m.from_peer;
        try {
          const answer = await pc.createAnswer(m.sdp);
          ws.send(
            JSON.stringify({
              type: "ANSWER",
              to_peer: this.gatewayPeerId,
              sdp: answer,
            }),
          );
          for (const c of this.pendingLocalIce.splice(0)) {
            ws.send(
              JSON.stringify({
                type: "ICE_CANDIDATE",
                to_peer: this.gatewayPeerId,
                candidate: c,
              }),
            );
          }
        } catch (err) {
          dcOpenReject?.(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      } else if (m.type === "ICE_CANDIDATE") {
        try {
          await pc.addRemoteIceCandidate(m.candidate);
        } catch (err) {
          this.log(
            `[visitor] addRemoteIceCandidate failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else if (m.type === "ERROR") {
        dcOpenReject?.(new Error(`signaling ERROR: ${m.reason}`));
      }
    });

    // After listeners are wired, wait for the WS to open, then HELLO.
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("ws open failed")));
    });

    ws.send(
      JSON.stringify({
        type: "HELLO",
        token: this.cfg.token,
        user_id: this.cfg.userId,
        role: "visitor",
      }),
    );

    await dcOpen;
  }

  /** Send an HTTP request over the open DataChannel. */
  async request(opts: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    timeoutMs?: number;
  }): Promise<BridgeClientResponse> {
    if (!this.bridge) {
      throw new Error("VisitorClient.request called before connect() completed");
    }
    return this.bridge.request(opts);
  }

  close(): void {
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close(1000);
    } catch {
      /* ignore */
    }
  }

  get peerId(): string | null {
    return this.myPeerId;
  }

  get gatewayId(): string | null {
    return this.gatewayPeerId;
  }
}
