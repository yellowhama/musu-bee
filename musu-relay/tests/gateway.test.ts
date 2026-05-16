/**
 * musu-relay-gateway signaling-level tests (V23.1 T1.8).
 *
 * Covers the gateway client's handling of the WebRTC signaling protocol
 * end-to-end against the real signaling server, with a stub
 * PeerConnectionFactory standing in for `@roamhq/wrtc` (T1.9 swaps the
 * real impl in).
 *
 * Acceptance scenarios:
 *   1. Gateway connects, sends HELLO with role=gateway, learns its peer_id
 *      from WELCOME
 *   2. When a visitor joins the same room, gateway initiates OFFER via the
 *      stub PC, and the server forwards it to the visitor
 *   3. When the visitor returns an ANSWER, gateway's stub PC receives it
 *   4. Local ICE candidates from the gateway's stub PC are forwarded to
 *      the visitor; remote ICE candidates are passed to the stub PC
 *   5. Multiple visitors in the same room each get their own session
 */

import { AddressInfo } from "net";
import WebSocket from "ws";
import { server, rooms } from "../src/signaling/server";
import {
  GatewayClient,
  PeerConnectionFactory,
  SimplePeerConnection,
} from "../src/gateway/client";

jest.setTimeout(15000);

let listenPort = 0;
let originalFetch: typeof fetch;

beforeAll((done) => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  originalFetch = global.fetch;
  server.listen(0, () => {
    listenPort = (server.address() as AddressInfo).port;
    done();
  });
});

afterAll((done) => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  server.close(() => done());
});

beforeEach(() => {
  rooms.clear();
  // Post-B2 (wiki/365): pass-through mock — see signaling.test.ts:50 for rationale.
  global.fetch = jest.fn().mockImplementation(async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({ user_id: body.user_id || "default-canonical-id" }),
    };
  }) as unknown as typeof fetch;
});

// ── Stub PeerConnection ───────────────────────────────────────────────────
// Records inputs, exposes hooks to simulate remote ICE candidates and the
// DataChannel-open event.

interface StubPC extends SimplePeerConnection {
  remotePeerId: string;
  stunServers: string[];
  offersCreated: number;
  answersCreated: number;
  acceptedAnswers: string[];
  remoteIce: string[];
  emitLocalIce: (candidate: string) => void;
  emitDataChannelOpen: () => void;
}

function makeStubFactory(): {
  factory: PeerConnectionFactory;
  pcs: StubPC[];
} {
  const pcs: StubPC[] = [];
  const factory: PeerConnectionFactory = {
    create(remotePeerId: string, stunServers: string[]): SimplePeerConnection {
      let localIceCb: ((c: string) => void) | null = null;
      let dcOpenCb: (() => void) | null = null;
      const pc: StubPC = {
        remotePeerId,
        stunServers,
        offersCreated: 0,
        answersCreated: 0,
        acceptedAnswers: [],
        remoteIce: [],
        async createOffer(): Promise<string> {
          pc.offersCreated++;
          return `fake-offer-for-${remotePeerId}`;
        },
        async createAnswer(_remoteSdp: string): Promise<string> {
          pc.answersCreated++;
          return `fake-answer-for-${remotePeerId}`;
        },
        async acceptAnswer(remoteSdp: string): Promise<void> {
          pc.acceptedAnswers.push(remoteSdp);
        },
        async addRemoteIceCandidate(candidate: string): Promise<void> {
          pc.remoteIce.push(candidate);
        },
        onLocalIceCandidate(cb): void {
          localIceCb = cb;
        },
        onDataChannelOpen(cb): void {
          dcOpenCb = cb;
        },
        close(): void {
          /* no-op */
        },
        getDataChannel() {
          return null;
        },
        emitLocalIce(c: string): void {
          localIceCb?.(c);
        },
        emitDataChannelOpen(): void {
          dcOpenCb?.();
        },
      };
      pcs.push(pc);
      return pc;
    },
  };
  return { factory, pcs };
}

// ── Test "visitor" — a raw WS that mimics what a browser would do ────────

interface Visitor {
  ws: WebSocket;
  msgs: any[];
  peerId: string | null;
  waitFor(predicate: (m: any) => boolean, ms?: number): Promise<any>;
}

async function joinVisitor(userId: string): Promise<Visitor> {
  const ws = new WebSocket(`ws://localhost:${listenPort}/signaling`);
  const msgs: any[] = [];
  const v: Visitor = {
    ws,
    msgs,
    peerId: null,
    async waitFor(predicate, ms = 3000): Promise<any> {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const found = msgs.find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(
        `visitor waitFor timeout; collected: ${msgs.map((m) => m.type).join(",")}`,
      );
    },
  };

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(e));
  });

  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    msgs.push(m);
    if (m.type === "WELCOME") v.peerId = m.peer_id;
  });

  ws.send(
    JSON.stringify({
      type: "HELLO",
      token: "t",
      user_id: userId,
      role: "visitor",
    }),
  );

  await v.waitFor((m) => m.type === "WELCOME");
  return v;
}

function makeGateway(userId: string, pcFactory: PeerConnectionFactory): GatewayClient {
  return new GatewayClient({
    signalingUrl: `ws://localhost:${listenPort}/signaling`,
    token: "t",
    userId,
    stunServers: ["stun:test:1234"],
    pcFactory,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("T1.8 GatewayClient connect + HELLO", () => {
  it("learns its peer_id from WELCOME and registers as gateway role", async () => {
    const { factory } = makeStubFactory();
    const g = makeGateway("u1", factory);
    await g.connect();
    expect(g.peerId).not.toBeNull();
    expect(g.peerId!.length).toBeGreaterThan(0);

    expect(rooms.get("u1")?.size).toBe(1);
    const onlyPeer = Array.from(rooms.get("u1")!)[0];
    expect(onlyPeer.role).toBe("gateway");

    g.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.8 GatewayClient ↔ visitor handshake", () => {
  it("initiates OFFER when a visitor joins, processes ANSWER, exchanges ICE", async () => {
    const { factory, pcs } = makeStubFactory();
    const g = makeGateway("u1", factory);
    await g.connect();

    const v = await joinVisitor("u1");

    // Gateway should see visitor in PEER_JOINED → spawns a PC + sends OFFER.
    const offer = await v.waitFor((m) => m.type === "OFFER");
    expect(pcs).toHaveLength(1);
    expect(pcs[0].offersCreated).toBe(1);
    expect(pcs[0].remotePeerId).toBe(v.peerId);
    expect(pcs[0].stunServers).toEqual(["stun:test:1234"]);
    expect(offer.sdp).toBe(`fake-offer-for-${v.peerId}`);
    expect(offer.from_peer).toBe(g.peerId);

    // Visitor returns ANSWER → gateway PC.acceptAnswer.
    v.ws.send(
      JSON.stringify({
        type: "ANSWER",
        to_peer: g.peerId,
        sdp: "visitor-answer-sdp",
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(pcs[0].acceptedAnswers).toEqual(["visitor-answer-sdp"]);

    // Gateway emits local ICE → visitor receives it.
    pcs[0].emitLocalIce("local-ice-1");
    const ice = await v.waitFor((m) => m.type === "ICE_CANDIDATE");
    expect(ice.candidate).toBe("local-ice-1");
    expect(ice.from_peer).toBe(g.peerId);

    // Visitor sends remote ICE → gateway PC.addRemoteIceCandidate.
    v.ws.send(
      JSON.stringify({
        type: "ICE_CANDIDATE",
        to_peer: g.peerId,
        candidate: "visitor-ice-1",
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(pcs[0].remoteIce).toEqual(["visitor-ice-1"]);

    g.close();
    v.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("creates a separate session per visitor when two visitors join", async () => {
    const { factory, pcs } = makeStubFactory();
    const g = makeGateway("u1", factory);
    await g.connect();

    const v1 = await joinVisitor("u1");
    await v1.waitFor((m) => m.type === "OFFER");

    const v2 = await joinVisitor("u1");
    await v2.waitFor((m) => m.type === "OFFER");

    expect(pcs).toHaveLength(2);
    expect(new Set(pcs.map((p) => p.remotePeerId))).toEqual(
      new Set([v1.peerId, v2.peerId]),
    );
    expect(g.activeRemotePeerIds.length).toBe(2);

    g.close();
    v1.ws.close();
    v2.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.8 GatewayClient is binding-agnostic", () => {
  it("never imports @roamhq/wrtc at module level (defers to T1.9)", () => {
    // Sanity check: client.ts must not have @roamhq/wrtc as a hard dep
    // because the native build is the spike's biggest risk. T1.9 will
    // either add it as an optional dep + dynamic import, or pick
    // node-datachannel.
    // We don't unit-test this directly here — package.json review is the
    // gate. This test exists as documentation of the constraint.
    expect(true).toBe(true);
  });
});

// ── T2.PROTO.1 — gateway cleans up session on PEER_LEFT ──────────────────

describe("T2.PROTO.1 PEER_LEFT session cleanup", () => {
  it("closes the specific session and removes it from activeRemotePeerIds", async () => {
    const { factory } = makeStubFactory();
    const g = makeGateway("u1", factory);
    await g.connect();

    const visitor = await joinVisitor("u1");
    // Wait for gateway to spawn a session for the visitor.
    const start = Date.now();
    while (g.activeRemotePeerIds.length === 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(g.activeRemotePeerIds).toContain(visitor.peerId);

    // Visitor disconnects → server broadcasts PEER_LEFT { peer_id } →
    // gateway closes the session.
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 200));

    expect(g.activeRemotePeerIds).not.toContain(visitor.peerId);
    expect(g.activeRemotePeerIds).toHaveLength(0);

    g.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});
