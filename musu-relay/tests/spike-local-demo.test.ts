/**
 * V23.1 T1.14 — local automated proxy for the manual demo.
 *
 * Master plan §10.2 T1.14 asks for: "browser tab → fly.io signaling →
 * gateway on dev laptop → local K3s 'hello' pod → response. Manual +
 * recorded video. This is the V23.1 → V23.2 transition demo."
 *
 * This test cannot:
 *   - hit a deployed Fly.io signaling server (T1.7 not provisioned yet —
 *     Const VII push to main is the gate)
 *   - hit a real K3s cluster (V23.1 spike scope explicitly defers this)
 *   - exercise a real browser tab (Jest is Node)
 *   - test CGNAT / cross-network NAT traversal (T1.15, T1.16)
 *
 * What it CAN do — and what's valuable for V23.1 success criterion 2
 * ("the signaling server has logged ≥20 successful + ≥5 failed
 * handshakes with categorized fail_cause") — is run 20 attempts of the
 * full local wire end-to-end and report:
 *   - success rate
 *   - per-attempt elapsed_ms from VisitorClient.connect() through to
 *     first HTTP-over-DC response
 *   - failure modes observed
 *
 * On localhost we expect 100% success. The reason this is still worth
 * automating: it pins regression on the wire itself. The day someone
 * breaks ICE candidate forwarding, or the DC-open callback, or the
 * BridgeServer attachment, this test fails immediately with a numeric
 * delta rather than a manual-demo dud.
 */

import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { server, rooms } from "../src/signaling/server";
import { GatewayClient, SimplePeerConnection } from "../src/gateway/client";
import { BridgeServer } from "../src/gateway/bridge";
import { VisitorClient, wrapNodeWs } from "../src/visitor/client";

jest.setTimeout(60000);

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

interface AttemptResult {
  attempt: number;
  outcome: "success" | "fail";
  elapsed_ms: number;
  status?: number;
  body_kind?: string;
  error?: string;
}

async function runOneAttempt(
  attempt: number,
  userId: string,
  target: { host: string; port: number },
): Promise<AttemptResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    makeWrtcFactory,
    makeWrtcAnswererFactory,
  } = require("../src/gateway/wrtc-factory");

  const start = Date.now();
  let gateway: GatewayClient | null = null;
  let visitor: VisitorClient | null = null;

  try {
    gateway = new GatewayClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId,
      stunServers: [],
      pcFactory: makeWrtcFactory(),
      onPeerConnected: (_remotePeerId: string, pc: SimplePeerConnection) => {
        const dc = pc.getDataChannel();
        if (!dc) throw new Error("onPeerConnected fired with null DC");
        new BridgeServer({ dc, target });
      },
      handshakeTimeoutMs: 10000,
    });
    await gateway.connect();

    visitor = new VisitorClient({
      signalingUrl: `ws://localhost:${listenPort}/signaling`,
      token: "t",
      userId,
      stunServers: [],
      wsImpl: wrapNodeWs(WebSocket),
      pcFactory: makeWrtcAnswererFactory(),
      connectTimeoutMs: 10000,
    });
    await visitor.connect();

    const resp = await visitor.request({
      method: "GET",
      path: `/api/v1/namespaces?attempt=${attempt}`,
    });
    const elapsed_ms = Date.now() - start;
    const body = JSON.parse(resp.body.toString());

    return {
      attempt,
      outcome: "success",
      elapsed_ms,
      status: resp.status,
      body_kind: body.kind,
    };
  } catch (err) {
    return {
      attempt,
      outcome: "fail",
      elapsed_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    visitor?.close();
    gateway?.close();
    // Give wrtc native handles a tick to settle before the next attempt.
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("T1.14 (local proxy) — full wire, 20 attempts", () => {
  it("achieves ≥95% success on localhost and reports per-attempt timings", async () => {
    if (!wrtcAvailable) {
      // eslint-disable-next-line no-console
      console.error("[T1.14 local] @roamhq/wrtc not loadable, skipping");
      return;
    }

    const httpTarget = await new Promise<{
      host: string;
      port: number;
      close: () => Promise<void>;
    }>((resolve) => {
      const s = http.createServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            kind: "NamespaceList",
            path: req.url,
            served_at: new Date().toISOString(),
          }),
        );
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

    const N = 20;
    const results: AttemptResult[] = [];
    for (let i = 0; i < N; i++) {
      // Distinct userId per attempt → fresh room, avoids cross-attempt state.
      const r = await runOneAttempt(i, `u-spike-${i}`, httpTarget);
      results.push(r);
    }

    const successes = results.filter((r) => r.outcome === "success");
    const failures = results.filter((r) => r.outcome === "fail");
    const successRate = successes.length / N;
    const times = successes.map((r) => r.elapsed_ms).sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)] ?? -1;
    const p95 = times[Math.floor(times.length * 0.95)] ?? -1;

    // eslint-disable-next-line no-console
    console.error(
      `[T1.14 local] N=${N} success=${successes.length} fail=${failures.length} ` +
        `rate=${(successRate * 100).toFixed(1)}% p50=${p50}ms p95=${p95}ms`,
    );
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[T1.14 local] failure causes: ${failures.map((f) => f.error).join(" | ")}`,
      );
    }

    // V23 master plan §10.5 sets ≥50% in the wild as the V23.2 gate.
    // On localhost we expect at minimum 95% — anything lower is a wire
    // regression, not a NAT issue.
    expect(successRate).toBeGreaterThanOrEqual(0.95);
    // V23.1 T1.9 acceptance: handshake <1s on localhost. Full visitor
    // connect → response cycle should still fit in 2s.
    expect(p95).toBeLessThan(2000);

    await httpTarget.close();
  });
});
