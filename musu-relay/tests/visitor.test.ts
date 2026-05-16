/**
 * VisitorClient tests (V23.1 T1.11).
 *
 * Drives the production wire end-to-end:
 *   browser-shaped VisitorClient ↔ signaling ↔ GatewayClient ↔ BridgeServer
 *     ↔ local http target
 *
 * This is what musu-bee will use — the only browser-vs-Node delta is
 * `wsImpl: WebSocket` (browser) vs `wsImpl: wrapNodeWs(require('ws'))`
 * (test).
 *
 * Skips if @roamhq/wrtc is unavailable.
 */

import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { server, rooms } from "../src/signaling/server";
import { GatewayClient, SimplePeerConnection } from "../src/gateway/client";
import { BridgeServer } from "../src/gateway/bridge";
import {
  VisitorClient,
  wrapNodeWs,
  VisitorPeerConnectionFactory,
} from "../src/visitor/client";

jest.setTimeout(30000);

let listenPort = 0;
let originalFetch: typeof fetch;
let wrtcAvailable = true;

beforeAll((done) => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@roamhq/wrtc");
  } catch {
    wrtcAvailable = false;
  }
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
  // Post-B2 (wiki/365): validateToken now requires { user_id } in the
  // 200 response body. Pass-through mock echoes claimed user_id as
  // canonical, matching musu.pro /validate post-B2-pro behavior.
  global.fetch = jest.fn().mockImplementation(async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({ user_id: body.user_id || "default-canonical-id" }),
    };
  }) as unknown as typeof fetch;
});

describe("T1.11 VisitorClient end-to-end", () => {
  it("connects, opens DC, and request() reaches the local HTTP target", async () => {
    if (!wrtcAvailable) {
      // eslint-disable-next-line no-console
      console.error("[T1.11] @roamhq/wrtc not loadable, skipping");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      makeWrtcFactory,
      makeWrtcAnswererFactory,
    } = require("../src/gateway/wrtc-factory");

    // Local HTTP target.
    const target = await new Promise<{
      host: string;
      port: number;
      close: () => Promise<void>;
    }>((resolve) => {
      const s = http.createServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: req.url }));
      });
      s.listen(0, "127.0.0.1", () => {
        const a = s.address() as AddressInfo;
        resolve({
          host: "127.0.0.1",
          port: a.port,
          close: () => new Promise<void>((r) => s.close(() => r())),
        });
      });
    });

    // Gateway: real wrtc + BridgeServer attached on DC open.
    const gateway = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: makeWrtcFactory(),
      onPeerConnected: (_remotePeerId: string, pc: SimplePeerConnection) => {
        const dc = pc.getDataChannel();
        if (!dc) throw new Error("onPeerConnected fired with null DC");
        new BridgeServer({ dc, target: { host: target.host, port: target.port } });
      },
      handshakeTimeoutMs: 10000,
    });
    await gateway.connect();

    // Visitor: VisitorClient with Node ws + wrtc answerer.
    const visitor = new VisitorClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      wsImpl: wrapNodeWs(WebSocket),
      pcFactory:
        makeWrtcAnswererFactory() as VisitorPeerConnectionFactory,
      connectTimeoutMs: 15000,
    });

    await visitor.connect();
    expect(visitor.peerId).not.toBeNull();
    expect(visitor.gatewayId).not.toBeNull();

    const resp = await visitor.request({
      method: "GET",
      path: "/api/v1/namespaces",
    });
    expect(resp.status).toBe(200);
    const body = JSON.parse(resp.body.toString());
    expect(body.ok).toBe(true);
    expect(body.path).toBe("/api/v1/namespaces");

    visitor.close();
    gateway.close();
    await target.close();
    await new Promise((r) => setTimeout(r, 200));
  });

  it("rejects connect() if signaling ERRORs the HELLO", async () => {
    // Force token validation to fail.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    // Stub factory — no real wrtc needed since we'll fail before DC.
    const stubFactory: VisitorPeerConnectionFactory = {
      create() {
        return {
          async createOffer() {
            return "";
          },
          async createAnswer() {
            return "";
          },
          async acceptAnswer() {},
          async addRemoteIceCandidate() {},
          onLocalIceCandidate() {},
          onDataChannelOpen() {},
          getDataChannel() {
            return null;
          },
          close() {},
        };
      },
    };

    const visitor = new VisitorClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "bad",
      userId: "u2",
      stunServers: [],
      wsImpl: wrapNodeWs(WebSocket),
      pcFactory: stubFactory,
      connectTimeoutMs: 3000,
    });

    await expect(visitor.connect()).rejects.toThrow();
    visitor.close();
  });
});
