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

import { createHmac } from "crypto";
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

    // V23.2 B1 commit 5: connect() also POSTs /issue_install_key for
    // bootstrap; filter to nat_pierce posts here.
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    expect(natPosts[0].url).toBe(
      "http://signaling.test/v1/telemetry/nat_pierce",
    );
    expect(natPosts[0].body).toEqual(rec);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T1.12 nat_pierce timeout emission", () => {
  it("emits fail/timeout record after handshakeTimeoutMs if DC never opens", async () => {
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
    // V23.2 B1 commit 5: also one /issue_install_key bootstrap POST.
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);

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
  it("sends x-musu-telemetry-secret when telemetrySharedSecret is configured (legacy path; bootstrap 204 leaves accountKey unset)", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string; headers: Record<string, string> }[] = [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      posts.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
      });
      // 204 (not 200) on bootstrap → falls through to legacy header path.
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
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    expect(natPosts[0].headers["x-musu-telemetry-secret"]).toBe(
      "shh-it-is-a-secret",
    );
    expect(natPosts[0].headers["content-type"]).toBe("application/json");
    // Legacy path: HMAC headers NOT sent.
    expect(natPosts[0].headers["x-musu-user-id"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-telemetry-signature"]).toBeUndefined();

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("omits x-musu-telemetry-secret when no secret is configured", async () => {
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
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    expect(natPosts[0].headers["x-musu-telemetry-secret"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-user-id"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-telemetry-signature"]).toBeUndefined();

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

// V23.2 B1 commit 5 (wiki/363 §6.1/§6.2/§6.3): HMAC emission + bootstrap.
//
// These tests guard the gateway-side half of the per-account HMAC scheme:
// header construction, body-identity, and the /issue_install_key bootstrap
// flow. The body-identity test in particular catches the "two JSON.stringify
// calls" regression — if it ever breaks, telemetry would silently 401 in
// production once the server-side raw-body verify is wired up (commit 1).
describe("T2.AUTH.2-final HMAC emission", () => {
  // 64-char lowercase hex (32 bytes). Production keys come from
  // /issue_install_key on the server; tests use a fixed value so the
  // expected HMAC is deterministic.
  const TEST_ACCOUNT_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("sends x-musu-user-id + x-musu-telemetry-signature headers when accountKey is configured", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string; headers: Record<string, string>; body: string }[] =
      [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      posts.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      });
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-hmac-1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      accountKey: TEST_ACCOUNT_KEY,
      musuInstallId: "install-hmac-1",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u-hmac-1");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);

    const headers = natPosts[0].headers;
    expect(headers["x-musu-user-id"]).toBe("u-hmac-1");
    expect(headers["x-musu-telemetry-signature"]).toMatch(
      /^t=\d+,v1=[0-9a-f]{64}$/,
    );
    // HMAC headers replace the shared-secret header — must NOT coexist.
    expect(headers["x-musu-telemetry-secret"]).toBeUndefined();

    // Re-derive the expected signature against the captured body bytes
    // and the captured t. If this fails, either (a) header construction
    // diverged from the documented contract, or (b) the body bytes the
    // gateway signed differ from the body bytes it shipped — the latter
    // is the regression we are most afraid of.
    const sigHeader = headers["x-musu-telemetry-signature"];
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sigHeader);
    expect(m).not.toBeNull();
    const t = m![1];
    const v1Captured = m![2];
    const expected = createHmac("sha256", TEST_ACCOUNT_KEY)
      .update(`${t}.${natPosts[0].body}`)
      .digest("hex");
    expect(v1Captured).toBe(expected);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("body-identity: the bytes the gateway signs are exactly the bytes it sends (the two-stringify regression test)", async () => {
    // This test is the canary. JSON.stringify is deterministic in V8 for
    // a given input, but if some future refactor introduces a second
    // stringify call between sign-time and send-time and the record
    // object is mutated in between, the HMAC would be over different
    // bytes than the body — and the server would 401. We assert byte
    // equality between (signed-input minus the "${t}." prefix) and
    // (body shipped to fetch).
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string; headers: Record<string, string>; body: string }[] =
      [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      posts.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      });
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-bid",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      accountKey: TEST_ACCOUNT_KEY,
      musuInstallId: "install-bid",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u-bid");
    await waitForCount(() => pcs, 1);
    pcs[0].fireLocalIce(2);
    pcs[0].fireDcOpen();

    await waitForCount(() => g.recordedTelemetry, 1);
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);

    // The HMAC was computed over `${t}.${rawBody}`. The body shipped is
    // the SAME rawBody (one variable in the source). We verify the HMAC
    // re-derives correctly against the shipped body bytes; if it does,
    // we know the variable was reused. If it doesn't, the bug is here.
    const sigHeader = natPosts[0].headers["x-musu-telemetry-signature"];
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sigHeader);
    expect(m).not.toBeNull();
    const t = m![1];
    const v1Captured = m![2];
    const expected = createHmac("sha256", TEST_ACCOUNT_KEY)
      .update(`${t}.${natPosts[0].body}`)
      .digest("hex");
    expect(v1Captured).toBe(expected);

    // Sanity: body parses back to the recorded telemetry payload.
    const parsed = JSON.parse(natPosts[0].body);
    expect(parsed).toEqual(g.recordedTelemetry[0]);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("accountKey takes precedence over telemetrySharedSecret when both are set", async () => {
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
      userId: "u-coex",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      accountKey: TEST_ACCOUNT_KEY,
      telemetrySharedSecret: "legacy-secret-not-used",
      musuInstallId: "install-coex",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u-coex");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();
    await waitForCount(() => g.recordedTelemetry, 1);

    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    expect(natPosts[0].headers["x-musu-telemetry-signature"]).toBeDefined();
    expect(natPosts[0].headers["x-musu-user-id"]).toBe("u-coex");
    // Legacy header must NOT be set when HMAC is active — otherwise we
    // double-auth and the server has to pick one.
    expect(natPosts[0].headers["x-musu-telemetry-secret"]).toBeUndefined();

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("with neither accountKey nor telemetrySharedSecret: omits all auth headers", async () => {
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
      userId: "u-none",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      // accountKey and telemetrySharedSecret intentionally unset
      musuInstallId: "install-none",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u-none");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();
    await waitForCount(() => g.recordedTelemetry, 1);

    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    expect(natPosts[0].headers["x-musu-telemetry-secret"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-user-id"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-telemetry-signature"]).toBeUndefined();

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("T2.AUTH.2-final bootstrap /issue_install_key", () => {
  it("on connect with accountKey unset + telemetryBase set: POSTs /issue_install_key with tunnel_token + musu_install_id", async () => {
    const { factory } = makeControlledFactory();
    const posts: { url: string; body: any }[] = [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      posts.push({
        url: String(url),
        body: JSON.parse(String(init.body)),
      });
      // 204 (not 200) → bootstrap does not set accountKey; no further POST.
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "tunnel-tok-abc",
      userId: "u-boot-1",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-boot-1",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const issuePosts = posts.filter((p) =>
      p.url.endsWith("/issue_install_key"),
    );
    expect(issuePosts).toHaveLength(1);
    expect(issuePosts[0].body.tunnel_token).toBe("tunnel-tok-abc");
    expect(issuePosts[0].body.musu_install_id).toBe("install-boot-1");

    g.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("on 200: stores account_key and uses it on subsequent telemetry POSTs", async () => {
    const { factory, pcs } = makeControlledFactory();
    const ISSUED_KEY =
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const posts: { url: string; headers: Record<string, string>; body: string }[] =
      [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      const u = String(url);
      posts.push({
        url: u,
        headers: (init.headers as Record<string, string>) ?? {},
        body: String(init.body ?? ""),
      });
      if (u.endsWith("/issue_install_key")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            account_key: ISSUED_KEY,
            user_id: "u-boot-2",
            issued_at: 1700000000,
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-boot-2",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-boot-2",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u-boot-2");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();
    await waitForCount(() => g.recordedTelemetry, 1);

    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    const sig = natPosts[0].headers["x-musu-telemetry-signature"];
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(natPosts[0].headers["x-musu-user-id"]).toBe("u-boot-2");

    // Verify the signature was computed with the ISSUED_KEY (i.e. the
    // bootstrap result actually got used, not a stale or empty key).
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig);
    const expected = createHmac("sha256", ISSUED_KEY)
      .update(`${m![1]}.${natPosts[0].body}`)
      .digest("hex");
    expect(m![2]).toBe(expected);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("on 409: bootstrap throws (hard-fail per Critic HIGH #1 — no persistent storage in B1)", async () => {
    const { factory } = makeControlledFactory();
    const fetchSpy = jest.fn(async (url: any) => {
      if (String(url).endsWith("/issue_install_key")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: "account_key already issued for this user_id",
            issued_at: 1699000000,
            hint: "persist account_key on first issuance; rotation lands in B1.x",
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-boot-409",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-boot-409",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await expect(g.connect()).rejects.toThrow(
      /Account already has a telemetry key/,
    );
    g.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("on 503: gateway proceeds without accountKey (Design A pre-B2-deploy; telemetry disabled silently)", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string; headers: Record<string, string> }[] = [];
    const fetchSpy = jest.fn(async (url: any, init: any) => {
      const u = String(url);
      posts.push({
        url: u,
        headers: (init.headers as Record<string, string>) ?? {},
      });
      if (u.endsWith("/issue_install_key")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: "canonical user_id not available; musu.pro /validate must deploy B2 first",
          }),
        } as unknown as Response;
      }
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-boot-503",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-boot-503",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    // Must NOT throw.
    await g.connect();

    const visitor = await joinVisitor("u-boot-503");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();
    await waitForCount(() => g.recordedTelemetry, 1);

    // nat_pierce was still POSTed (telemetry is "best-effort", legacy
    // path = no headers because telemetrySharedSecret also unset).
    const natPosts = posts.filter((p) => p.url.endsWith("/nat_pierce"));
    expect(natPosts).toHaveLength(1);
    expect(natPosts[0].headers["x-musu-telemetry-signature"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-user-id"]).toBeUndefined();
    expect(natPosts[0].headers["x-musu-telemetry-secret"]).toBeUndefined();

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("on network error during bootstrap: gateway proceeds without accountKey", async () => {
    const { factory, pcs } = makeControlledFactory();
    const fetchSpy = jest.fn(async (url: any) => {
      if (String(url).endsWith("/issue_install_key")) {
        throw new Error("ECONNREFUSED");
      }
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-boot-net",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      musuInstallId: "install-boot-net",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    // Must NOT throw — gateway must remain usable even with telemetry down.
    await g.connect();

    const visitor = await joinVisitor("u-boot-net");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();
    await waitForCount(() => g.recordedTelemetry, 1);
    expect(g.recordedTelemetry).toHaveLength(1);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("on connect with accountKey already set: does NOT call /issue_install_key", async () => {
    const { factory, pcs } = makeControlledFactory();
    const posts: { url: string }[] = [];
    const fetchSpy = jest.fn(async (url: any) => {
      posts.push({ url: String(url) });
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-boot-skip",
      stunServers: [],
      pcFactory: factory,
      telemetryBase: "http://signaling.test/v1/telemetry",
      accountKey:
        "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
      musuInstallId: "install-boot-skip",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    const visitor = await joinVisitor("u-boot-skip");
    await waitForCount(() => pcs, 1);
    pcs[0].fireDcOpen();
    await waitForCount(() => g.recordedTelemetry, 1);

    const issuePosts = posts.filter((p) =>
      p.url.endsWith("/issue_install_key"),
    );
    expect(issuePosts).toHaveLength(0);

    g.close();
    visitor.ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("with telemetryBase unset: does NOT call /issue_install_key even when accountKey is unset", async () => {
    const { factory } = makeControlledFactory();
    const fetchSpy = jest.fn(async () => {
      return { ok: true, status: 204 } as Response;
    }) as unknown as typeof fetch;

    const g = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u-no-tel",
      stunServers: [],
      pcFactory: factory,
      // telemetryBase intentionally unset
      musuInstallId: "install-no-tel",
      fetchImpl: fetchSpy,
      handshakeTimeoutMs: 5000,
    });
    await g.connect();

    expect(fetchSpy).not.toHaveBeenCalled();

    g.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});
