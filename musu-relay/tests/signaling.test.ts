/**
 * musu-relay signaling server tests (V23.1 T1.2 + T1.3 + T1.4).
 *
 * Covers:
 *   T1.2 — token validation: HELLO must arrive first; invalid token
 *          rejected; valid token transitions to peer state
 *   T1.3 — OFFER / ANSWER / ICE_CANDIDATE / BYE message routing
 *          server forwards verbatim between peers; never inspects SDP
 *   T1.4 — per-user room model: two peers with same user_id find
 *          each other; peers with different user_id are isolated
 *
 * The validateToken function calls musu.pro by default. Tests stub
 * fetch globally to control validation outcome without network.
 *
 * Harness note: an earlier queue/waiter pattern (nextMessage + promise
 * waiters) hit a race where the awaited promise never resolved even
 * though the inbox received the frame. We replaced it with a passive
 * collector (every frame is pushed to an array as it arrives) plus a
 * polling `waitFor(predicate)` helper — no waiter state to lose.
 */

import { AddressInfo } from "net";
import WebSocket from "ws";
import { app, server, rooms } from "../src/signaling/server";

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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
  }) as unknown as typeof fetch;
});

// ── Test harness: passive collector + poll ────────────────────────────────
//
// The collector pattern. Every ws frame, open, close, and error is recorded
// onto the collector as it happens. Waiters then poll the recorded state.
// This avoids any race where the event fires before a waiter has attached
// (the original bug: `ws.once("close", ...)` attached after the close had
// already happened, so the promise never resolved).

type Collector = {
  messages: any[];
  opened: boolean;
  closed: boolean;
  closeCode: number | null;
};

function connect(): WebSocket {
  const ws = new WebSocket(`ws://localhost:${listenPort}/signaling`);
  const collector: Collector = {
    messages: [],
    opened: false,
    closed: false,
    closeCode: null,
  };
  (ws as any)._collector = collector;
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    collector.messages.push(m);
  });
  ws.on("open", () => {
    collector.opened = true;
  });
  ws.on("close", (code) => {
    collector.closed = true;
    collector.closeCode = code;
  });
  ws.on("error", () => {
    // swallow — close handler runs after error and is sufficient
  });
  return ws;
}

function collectorOf(ws: WebSocket): Collector {
  return (ws as any)._collector as Collector;
}

async function waitFor(
  ws: WebSocket,
  predicate: (m: any) => boolean,
  timeoutMs = 3000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = collectorOf(ws).messages.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  const msgs = collectorOf(ws).messages;
  throw new Error(
    `waitFor timeout after ${timeoutMs}ms; collected ${msgs.length} msgs: ${msgs.map((m) => m.type).join(",")}`,
  );
}

async function waitOpen(ws: WebSocket, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (collectorOf(ws).opened) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitOpen timeout after ${timeoutMs}ms`);
}

async function waitClose(ws: WebSocket, timeoutMs = 3000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (collectorOf(ws).closed) return collectorOf(ws).closeCode ?? 0;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitClose timeout after ${timeoutMs}ms`);
}

// ── T1.2 token validation ─────────────────────────────────────────────────

describe("T1.2 token validation", () => {
  it("sends ERROR + closes when first message is not HELLO", async () => {
    const ws = connect();
    await waitOpen(ws);
    ws.send(JSON.stringify({ type: "OFFER", to_peer: "x", sdp: "fake" }));

    const msg = await waitFor(ws, (m) => m.type === "ERROR");
    expect(msg.reason).toMatch(/HELLO/);

    const code = await waitClose(ws);
    expect(code).toBe(4001);
  });

  it("rejects HELLO with invalid token (validation API returns !ok)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    const ws = connect();
    await waitOpen(ws);
    ws.send(
      JSON.stringify({
        type: "HELLO",
        token: "bad",
        user_id: "user1",
        role: "gateway",
      }),
    );

    const msg = await waitFor(ws, (m) => m.type === "ERROR");
    expect(msg.reason).toMatch(/invalid token/);

    const code = await waitClose(ws);
    expect(code).toBe(4003);
  });

  it("accepts HELLO with valid token and returns WELCOME with peer_id", async () => {
    const ws = connect();
    await waitOpen(ws);
    ws.send(
      JSON.stringify({
        type: "HELLO",
        token: "good",
        user_id: "user1",
        role: "gateway",
      }),
    );

    const welcome = await waitFor(ws, (m) => m.type === "WELCOME");
    expect(typeof welcome.peer_id).toBe("string");
    expect(welcome.peer_id.length).toBeGreaterThan(0);

    ws.close();
    await waitClose(ws);
  });
});

// ── Helpers for multi-peer tests ─────────────────────────────────────────

async function joinAs(
  userId: string,
  role: "gateway" | "visitor",
): Promise<{ ws: WebSocket; peerId: string }> {
  const ws = connect();
  await waitOpen(ws);
  ws.send(
    JSON.stringify({
      type: "HELLO",
      token: "t",
      user_id: userId,
      role,
    }),
  );
  const welcome = await waitFor(ws, (m) => m.type === "WELCOME");
  return { ws, peerId: welcome.peer_id };
}

// ── T1.4 per-user room model ──────────────────────────────────────────────

describe("T1.4 per-user room model", () => {
  it("two peers with same user_id see each other in PEER_JOINED", async () => {
    const { ws: a } = await joinAs("user1", "gateway");
    await waitFor(
      a,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 1,
    );

    const { ws: b } = await joinAs("user1", "visitor");

    const aRoom2 = await waitFor(
      a,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 2,
    );
    expect(aRoom2.room_peers).toHaveLength(2);

    const bRoom = await waitFor(
      b,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 2,
    );
    expect(bRoom.room_peers).toHaveLength(2);

    a.close();
    b.close();
    await waitClose(a);
    await waitClose(b);
  });

  it("peers in different user rooms do NOT see each other", async () => {
    const { ws: a } = await joinAs("alice", "gateway");
    const aRoom = await waitFor(a, (m) => m.type === "PEER_JOINED");
    expect(aRoom.room_peers).toHaveLength(1);

    const { ws: b } = await joinAs("bob", "visitor");
    const bRoom = await waitFor(b, (m) => m.type === "PEER_JOINED");
    expect(bRoom.room_peers).toHaveLength(1);

    expect(rooms.get("alice")?.size).toBe(1);
    expect(rooms.get("bob")?.size).toBe(1);

    a.close();
    b.close();
    await waitClose(a);
    await waitClose(b);
  });
});

// ── T1.3 OFFER / ANSWER / ICE_CANDIDATE routing ──────────────────────────

describe("T1.3 signaling message routing", () => {
  async function joinTwoPeers(): Promise<{
    a: WebSocket;
    aPeerId: string;
    b: WebSocket;
    bPeerId: string;
  }> {
    const { ws: a, peerId: aPeerId } = await joinAs("user1", "gateway");
    const { ws: b, peerId: bPeerId } = await joinAs("user1", "visitor");
    // Wait for both sides to observe the 2-peer room.
    await waitFor(
      a,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 2,
    );
    await waitFor(
      b,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 2,
    );
    return { a, aPeerId, b, bPeerId };
  }

  it("forwards OFFER from A to B verbatim", async () => {
    const { a, aPeerId, b, bPeerId } = await joinTwoPeers();
    const sdpPayload =
      "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nfake-sdp";

    a.send(
      JSON.stringify({
        type: "OFFER",
        to_peer: bPeerId,
        sdp: sdpPayload,
      }),
    );

    const received = await waitFor(b, (m) => m.type === "OFFER");
    expect(received.from_peer).toBe(aPeerId);
    expect(received.sdp).toBe(sdpPayload);

    a.close();
    b.close();
    await waitClose(a);
    await waitClose(b);
  });

  it("forwards ANSWER from B back to A verbatim", async () => {
    const { a, aPeerId, b, bPeerId } = await joinTwoPeers();
    const answerSdp = "v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nanswer";

    b.send(
      JSON.stringify({
        type: "ANSWER",
        to_peer: aPeerId,
        sdp: answerSdp,
      }),
    );

    const received = await waitFor(a, (m) => m.type === "ANSWER");
    expect(received.from_peer).toBe(bPeerId);
    expect(received.sdp).toBe(answerSdp);

    a.close();
    b.close();
    await waitClose(a);
    await waitClose(b);
  });

  it("forwards ICE_CANDIDATE verbatim", async () => {
    const { a, aPeerId, b, bPeerId } = await joinTwoPeers();
    const candidate =
      "candidate:1 1 UDP 2122252543 192.168.1.10 54321 typ host";

    a.send(
      JSON.stringify({
        type: "ICE_CANDIDATE",
        to_peer: bPeerId,
        candidate,
      }),
    );

    const received = await waitFor(b, (m) => m.type === "ICE_CANDIDATE");
    expect(received.from_peer).toBe(aPeerId);
    expect(received.candidate).toBe(candidate);

    a.close();
    b.close();
    await waitClose(a);
    await waitClose(b);
  });

  it("ERROR when OFFER targets a peer_id not in the room", async () => {
    const { a, b } = await joinTwoPeers();

    a.send(
      JSON.stringify({
        type: "OFFER",
        to_peer: "nonexistent-peer-id",
        sdp: "fake",
      }),
    );

    const err = await waitFor(
      a,
      (m) => m.type === "ERROR" && /not in room/.test(m.reason ?? ""),
    );
    expect(err.reason).toMatch(/not in room/);

    a.close();
    b.close();
    await waitClose(a);
    await waitClose(b);
  });

  it("BYE closes the connection cleanly and B sees PEER_LEFT", async () => {
    const { a, b } = await joinTwoPeers();

    a.send(JSON.stringify({ type: "BYE" }));
    const code = await waitClose(a);
    expect(code).toBe(1000);

    const peerLeft = await waitFor(b, (m) => m.type === "PEER_LEFT");
    expect(peerLeft.type).toBe("PEER_LEFT");

    b.close();
    await waitClose(b);
  });

  it("ERROR for unknown message type", async () => {
    const { ws: a } = await joinAs("user1", "gateway");
    await waitFor(a, (m) => m.type === "WELCOME");

    a.send(JSON.stringify({ type: "WAT", payload: 1 }));
    const err = await waitFor(a, (m) => m.type === "ERROR");
    expect(err.type).toBe("ERROR");

    a.close();
    await waitClose(a);
  });

  it("ERROR for invalid JSON", async () => {
    const a = connect();
    await waitOpen(a);
    a.send("not json at all");
    const err = await waitFor(a, (m) => m.type === "ERROR");
    expect(err.reason).toMatch(/invalid JSON/);

    a.close();
    await waitClose(a);
  });
});

// ── Disconnect cleanup ────────────────────────────────────────────────────

describe("disconnect cleanup", () => {
  it("removes peer from room on close, broadcasts PEER_LEFT", async () => {
    const { ws: a } = await joinAs("user1", "gateway");
    const { ws: b } = await joinAs("user1", "visitor");
    await waitFor(
      a,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 2,
    );
    await waitFor(
      b,
      (m) => m.type === "PEER_JOINED" && (m.room_peers?.length ?? 0) === 2,
    );

    expect(rooms.get("user1")?.size).toBe(2);

    a.close();
    await waitClose(a);

    const peerLeft = await waitFor(b, (m) => m.type === "PEER_LEFT");
    expect(peerLeft.type).toBe("PEER_LEFT");
    expect(rooms.get("user1")?.size).toBe(1);

    b.close();
    await waitClose(b);
    // Give the server a tick to reap the empty room on B's close.
    await new Promise((r) => setTimeout(r, 50));
    expect(rooms.has("user1")).toBe(false);
  });
});
