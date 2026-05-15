/**
 * Gateway nat_pierce telemetry emission tests (V23.1 T1.12).
 *
 * Covers:
 *   - on successful DataChannel open: gateway records and POSTs a
 *     {outcome=success, fail_cause=null, ice_candidate_count, elapsed_ms}
 *     event to {telemetryBase}/nat_pierce
 *   - on handshake timeout: gateway records and POSTs
 *     {outcome=fail, fail_cause="timeout"}
 *   - record is emitted exactly once per session even if both success
 *     and timeout could conceivably fire
 *   - if telemetryBase is unset, the in-memory record still accumulates
 *     (useful for callers that want to ship telemetry their own way)
 *   - telemetry POST failure does NOT propagate (best-effort)
 *
 * Uses the stub PeerConnection factory from gateway.test.ts's pattern so
 * we control exactly when DC opens vs. times out.
 */

import { AddressInfo } from "net";
import WebSocket from "ws";
import { server, rooms } from "../src/signaling/server";
import {
  GatewayClient,
  PeerConnectionFactory,
  SimplePeerConnection,
  TelemetryNatPierce,
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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 204,
  }) as unknown as typeof fetch;
});

// ── Stub PC with manual control over DC open ─────────────────────────────

interface ControlledStubPC extends SimplePeerConnection {
  fireDcOpen(): void;
  fireLocalIce(count: number): void;
}

function makeControlledFactory(): {
  factory: PeerConnectionFactory;
  pcs: ControlledStubPC[];
} {
  const pcs: ControlledStubPC[] = [];
  const factory: PeerConnectionFactory = {
    create(remotePeerId: string, _stunServers: string[]): SimplePeerConnection {
      let localIceCb: ((c: string) => void) | null = null;
      let dcOpenCb: (() => void) | null = null;
      const pc: ControlledStubPC = {
        async createOffer(): Promise<string> {
          return `offer-${remotePeerId}`;
        },
        async createAnswer(): Promise<string> {
          return `answer-${remotePeerId}`;
        },
        async acceptAnswer(): Promise<void> {
          /* no-op */
        },
        async addRemoteIceCandidate(): Promise<void> {
          /* no-op */
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
        fireDcOpen(): void {
          dcOpenCb?.();
        },
        fireLocalIce(count: number): void {
          for (let i = 0; i < count; i++) localIceCb?.(`ice-${i}`);
        },
      };
      pcs.push(pc);
      return pc;
    },
  };
  return { factory, pcs };
}

// ── Visitor stub ─────────────────────────────────────────────────────────

interface VisitorWs {
  ws: WebSocket;
  peerId: string | null;
  msgs: any[];
}

async function joinVisitor(userId: string): Promise<VisitorWs> {
  const ws = new WebSocket(`ws://localhost:${listenPort}/signaling`);
  const v: VisitorWs = { ws, peerId: null, msgs: [] };
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    v.msgs.push(m);
    if (m.type === "WELCOME") v.peerId = m.peer_id;
  });
  ws.send(
    JSON.stringify({ type: "HELLO", token: "t", user_id: userId, role: "visitor" }),
  );
  const deadline = Date.now() + 3000;
  while (v.peerId === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  return v;
}

async function waitForCount<T>(
  arr: readonly T[] | (() => readonly T[]),
  n: number,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  const getter = typeof arr === "function" ? arr : () => arr;
  while (Date.now() - start < timeoutMs) {
    if (getter().length >= n) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`waitForCount timeout: have ${getter().length}, want ${n}`);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("T1.12 nat_pierce success emission", () => {
  it("emits success record + POSTs to /nat_pierce when DC opens", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string; body: any }[] = [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      posts.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-abc",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    // GatewayClient initiates OFFER on PEER_JOINED → spawns a PC.
    await waitForCount(() => pcs, 1);

    // Simulate ICE flowing, then DC open.
    pcs[0].fireLocalIce(3);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);

    const rec = g.recordedTelemetry[0] as TelemetryNatPierce;
    expect(rec.attempt_outcome).toBe("success");
    expect(rec.fail_cause).toBeNull();
    expect(rec.ice_candidate_count).toBe(3);
    expect(rec.musu_install_id).toBe("install-abc");
    expect(rec.elapsed_ms).toBeGreaterThanOrEqual(0);

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("http://signaling.test/v1/telemetry/nat_pierce");
    expect(posts[0].body).toEqual(rec);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.12 nat_pierce timeout emission", () => {
  it("emits fail/timeout record after handshakeTimeoutMs if DC never opens", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: any[] = [];
    const fetchSpy = jest.fn(async (_url: any, init: any) => {
      posts.push(JSON.parse(init.body));
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-xyz",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 150, // short for test speed
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    await waitForCount(() => pcs, 1);
    pcs[0].fireLocalIce(1);
    // Do NOT fire dcOpen → timer fires.

    await waitForCount(() => g.recordedTelemetry, 1, 1000);

    expect(g.recordedTelemetry[0].attempt_outcome).toBe("fail");
    expect(g.recordedTelemetry[0].fail_cause).toBe("timeout");
    expect(g.recordedTelemetry[0].ice_candidate_count).toBe(1);
    expect(posts).toHaveLength(1);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.12 nat_pierce idempotency", () => {
  it("records each session exactly once even if DC opens AFTER timeout fired", async () => {
    const { factory, pcs } = makeControlledFactory();
    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      handshakeTimeoutMs: 100,
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    await waitForCount(() => pcs, 1);

    // Let the timeout fire first.
    await waitForCount(() => g.recordedTelemetry, 1, 1000);
    expect(g.recordedTelemetry[0].attempt_outcome).toBe("fail");

    // Now fire dcOpen — must not produce a second record.
    pcs[0].fireDcOpen();
    await new Promise((r) => setTimeout(r, 100));
    expect(g.recordedTelemetry).toHaveLength(1);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.12 nat_pierce no-telemetry-base", () => {
  it("still accumulates in-memory records when telemetryBase is omitted", async () => {
    const { factory, pcs } = makeControlledFactory();
    const fetchSpy = jest.fn();

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      // telemetryBase omitted on purpose
      fetchImpl: fetchSpy as unknown as typeof fetch,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);
    expect(g.recordedTelemetry[0].attempt_outcome).toBe("success");
    expect(fetchSpy).not.toHaveBeenCalled();

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T2.AUTH.2 interim — telemetry POST carries shared-secret header", () => {
  // V23.2 audit HIGH #4: a one-line refactor on the gateway side could
  // silently drop the auth header and every signaling-server POST would
  // start failing 401 (in prod) or succeeding-anonymously (in dev). Lock
  // both directions: configured → header present; unset → header absent.
  it("sends x-musu-telemetry-secret when telemetrySharedSecret is configured", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string; headers: Record<string, string> }[] = [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      posts.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
      });
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      telemetrySharedSecret: "shh-it-is-a-secret",
      musuInstallId: "install-headers-1",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["x-musu-telemetry-secret"]).toBe("shh-it-is-a-secret");
    expect(posts[0].headers["content-type"]).toBe("application/json");

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("omits x-musu-telemetry-secret when no secret is configured", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { headers: Record<string, string> }[] = [];
    const fetchSpy = jest.fn(async (_url: any, init: any) => {
      posts.push({ headers: init.headers as Record<string, string> });
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      // telemetrySharedSecret intentionally unset
      musuInstallId: "install-headers-2",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["x-musu-telemetry-secret"]).toBeUndefined();

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.12 nat_pierce best-effort POST", () => {
  it("does not throw if the telemetry endpoint rejects", async () => {
    const { factory, pcs } = makeControlledFactory();
    const fetchSpy = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://broken/v1/telemetry",
      musuInstallId: "install-q",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u1");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);
    // No throw. Record still in memory.
    expect(g.recordedTelemetry).toHaveLength(1);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});
