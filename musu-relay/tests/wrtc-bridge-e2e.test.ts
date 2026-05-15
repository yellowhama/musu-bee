/**
 * End-to-end: real WebRTC + bridge (V23.1 T1.10 integration).
 *
 * Composes T1.9 (real wrtc handshake) with T1.10 (DC↔HTTP bridge) to
 * prove the full path:
 *
 *   visitor's BridgeClient
 *     → visitor's RTCDataChannel
 *     → [WebRTC over loopback]
 *     → gateway's RTCDataChannel
 *     → gateway's BridgeServer
 *     → local HTTP target (substitutes for kubectl proxy)
 *     → response back through the same path
 *
 * This is the strongest available proxy for the V23.1 success criterion
 * 1 ("browser on phone → musu.pro → laptop → K3s pod stdout") that we
 * can run inside Jest without a real K3s cluster or a real browser.
 *
 * Skips if @roamhq/wrtc is unavailable on the host.
 */

import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { server, rooms } from "../src/signaling/server";
import { GatewayClient, SimplePeerConnection } from "../src/gateway/client";
import { BridgeServer, BridgeClient } from "../src/gateway/bridge";

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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
  }) as unknown as typeof fetch;
});

describe("T1.10 wrtc + bridge end-to-end", () => {
  it("HTTP request over real WebRTC DC reaches local target and returns 200", async () => {
    if (!wrtcAvailable) {
      // eslint-disable-next-line no-console
      console.error("[T1.10 E2E] @roamhq/wrtc not loadable, skipping");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      makeWrtcFactory,
      makeWrtcAnswererFactory,
    } = require("../src/gateway/wrtc-factory");

    // Local HTTP target — stand-in for `kubectl proxy`.
    const target = await new Promise<{
      host: string;
      port: number;
      close: () => Promise<void>;
    }>((resolve) => {
      const s = http.createServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ kind: "NamespaceList", path: req.url }));
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

    // ── Visitor side: raw WS + answerer PC + BridgeClient ─────────────
    const vWs = new WebSocket(`ws://localhost:${listenPort}/signaling`);
    await new Promise<void>((resolve, reject) => {
      vWs.once("open", () => resolve());
      vWs.once("error", reject);
    });

    const vPc = makeWrtcAnswererFactory().create("gateway-peer", []);
    let vPeerId: string | null = null;
    let gPeerId: string | null = null;
    let bridgeClient: BridgeClient | null = null;
    const pendingLocalIce: string[] = [];

    vPc.onLocalIceCandidate((c: string) => {
      if (gPeerId && vWs.readyState === WebSocket.OPEN) {
        vWs.send(
          JSON.stringify({ type: "ICE_CANDIDATE", to_peer: gPeerId, candidate: c }),
        );
      } else {
        pendingLocalIce.push(c);
      }
    });

    vPc.onDataChannelOpen(() => {
      // wrtc-factory's WrtcPeerConnection exposes getDataChannel(); bridge
      // wraps it for HTTP-over-DC.
      const dc = (vPc as any).getDataChannel();
      bridgeClient = new BridgeClient(dc);
    });

    vWs.on("message", async (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "WELCOME") {
        vPeerId = m.peer_id;
      } else if (m.type === "OFFER") {
        gPeerId = m.from_peer;
        const answer = await vPc.createAnswer(m.sdp);
        vWs.send(
          JSON.stringify({ type: "ANSWER", to_peer: gPeerId, sdp: answer }),
        );
        for (const c of pendingLocalIce.splice(0)) {
          vWs.send(
            JSON.stringify({ type: "ICE_CANDIDATE", to_peer: gPeerId, candidate: c }),
          );
        }
      } else if (m.type === "ICE_CANDIDATE") {
        await vPc.addRemoteIceCandidate(m.candidate);
      }
    });

    vWs.send(
      JSON.stringify({ type: "HELLO", token: "t", user_id: "u1", role: "visitor" }),
    );
    const welcomeDeadline = Date.now() + 5000;
    while (vPeerId === null && Date.now() < welcomeDeadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(vPeerId).not.toBeNull();

    // ── Gateway side: GatewayClient with onPeerConnected hook ─────────
    let bridgeServerAttached = false;
    const gateway = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId: "u1",
      stunServers: [],
      pcFactory: makeWrtcFactory(),
      onPeerConnected: (_remotePeerId: string, pc: SimplePeerConnection) => {
        const dc = (pc as any).getDataChannel();
        new BridgeServer({ dc, target: { host: target.host, port: target.port } });
        bridgeServerAttached = true;
      },
    });
    await gateway.connect();

    // ── Wait for both sides' DC to open and the bridge to attach ──────
    const clientDeadline = Date.now() + 10000;
    while ((!bridgeClient || !bridgeServerAttached) && Date.now() < clientDeadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(bridgeClient).not.toBeNull();
    expect(bridgeServerAttached).toBe(true);

    // ── Issue the HTTP-over-DC request ────────────────────────────────
    const resp = await bridgeClient!.request({
      method: "GET",
      path: "/api/v1/namespaces",
    });
    expect(resp.status).toBe(200);
    const body = JSON.parse(resp.body.toString());
    expect(body.kind).toBe("NamespaceList");
    expect(body.path).toBe("/api/v1/namespaces");

    // ── Cleanup ───────────────────────────────────────────────────────
    gateway.close();
    vPc.close();
    vWs.close();
    await target.close();
    await new Promise((r) => setTimeout(r, 200));
  });
});
