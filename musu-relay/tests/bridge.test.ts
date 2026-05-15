/**
 * DataChannel ↔ HTTP bridge tests (V23.1 T1.10).
 *
 * The real WebRTC path is exercised by tests/wrtc-handshake.test.ts
 * (T1.9). This file isolates the bridge's JSON-over-DC marshalling so
 * a flaky native binding can't mask a bridge regression: we pair
 * BridgeServer and BridgeClient over an in-memory DataChannel.
 *
 * The "local HTTP target" is a real http.Server bound to 127.0.0.1
 * on an ephemeral port — the bridge forwards via the host loopback,
 * just like it will when pointed at kubectl proxy in V23.2.
 */

import http from "http";
import { AddressInfo } from "net";
import {
  BridgeServer,
  BridgeClient,
  DataChannelLike,
} from "../src/gateway/bridge";

jest.setTimeout(10000);

// ── In-memory paired DataChannel ─────────────────────────────────────────
// Two endpoints that send strings to each other synchronously via
// setImmediate (mimics the async cadence of a real DC without needing
// the wrtc binding).

interface PairedDC extends DataChannelLike {
  peer: PairedDC | null;
}

function makePair(): { a: PairedDC; b: PairedDC } {
  const a: PairedDC = {
    readyState: "open",
    peer: null,
    onmessage: null,
    onclose: null,
    send(data: string) {
      setImmediate(() => a.peer?.onmessage?.({ data }));
    },
  };
  const b: PairedDC = {
    readyState: "open",
    peer: null,
    onmessage: null,
    onclose: null,
    send(data: string) {
      setImmediate(() => b.peer?.onmessage?.({ data }));
    },
  };
  a.peer = b;
  b.peer = a;
  return { a, b };
}

// ── Local HTTP target (substitute for kubectl proxy) ─────────────────────

interface LocalTarget {
  server: http.Server;
  host: string;
  port: number;
  close(): Promise<void>;
}

function startLocalTarget(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<LocalTarget> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        server,
        host: "127.0.0.1",
        port: addr.port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("T1.10 bridge: GET round-trip", () => {
  it("forwards GET to local target and returns response body", async () => {
    const target = await startLocalTarget((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ method: req.method, path: req.url }));
    });

    const { a, b } = makePair();
    new BridgeServer({ dc: a, target: { host: target.host, port: target.port } });
    const client = new BridgeClient(b);

    const resp = await client.request({ method: "GET", path: "/api/v1/namespaces" });
    expect(resp.status).toBe(200);
    expect(resp.headers["content-type"]).toMatch(/json/);
    const body = JSON.parse(resp.body.toString());
    expect(body).toEqual({ method: "GET", path: "/api/v1/namespaces" });

    await target.close();
  });
});

describe("T1.10 bridge: POST with body", () => {
  it("forwards request body and target sees correct bytes", async () => {
    const seenBodies: Buffer[] = [];
    const target = await startLocalTarget((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        seenBodies.push(Buffer.concat(chunks));
        res.writeHead(201, { "x-echo-len": String(seenBodies[0].byteLength) });
        res.end(seenBodies[0]);
      });
    });

    const { a, b } = makePair();
    new BridgeServer({ dc: a, target: { host: target.host, port: target.port } });
    const client = new BridgeClient(b);

    const payload = Buffer.from(JSON.stringify({ apiVersion: "v1", kind: "Pod" }));
    const resp = await client.request({
      method: "POST",
      path: "/api/v1/namespaces/default/pods",
      headers: { "content-type": "application/json" },
      body: payload,
    });

    expect(resp.status).toBe(201);
    expect(resp.headers["x-echo-len"]).toBe(String(payload.byteLength));
    expect(resp.body.toString()).toBe(payload.toString());
    expect(seenBodies[0].toString()).toBe(payload.toString());

    await target.close();
  });
});

describe("T1.10 bridge: binary body survives base64 round-trip", () => {
  it("preserves arbitrary bytes through the DC envelope", async () => {
    const binary = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) binary[i] = i; // every byte 0x00..0xFF

    const target = await startLocalTarget((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(Buffer.concat(chunks));
      });
    });

    const { a, b } = makePair();
    new BridgeServer({ dc: a, target: { host: target.host, port: target.port } });
    const client = new BridgeClient(b);

    const resp = await client.request({
      method: "POST",
      path: "/echo",
      body: binary,
    });
    expect(resp.status).toBe(200);
    expect(resp.body.equals(binary)).toBe(true);

    await target.close();
  });
});

describe("T1.10 bridge: error envelope when target unreachable", () => {
  it("returns err envelope and rejects client promise", async () => {
    const { a, b } = makePair();
    // Point at a port nothing is listening on.
    new BridgeServer({ dc: a, target: { host: "127.0.0.1", port: 1 } });
    const client = new BridgeClient(b);

    await expect(
      client.request({ method: "GET", path: "/anything", timeoutMs: 2000 }),
    ).rejects.toThrow();
  });
});

describe("T1.10 bridge: path allow-prefix", () => {
  it("rejects requests outside the allowed prefix", async () => {
    const target = await startLocalTarget((_req, res) => {
      res.writeHead(200).end("should not reach");
    });

    const { a, b } = makePair();
    new BridgeServer({
      dc: a,
      target: { host: target.host, port: target.port },
      pathAllowPrefix: "/api/",
    });
    const client = new BridgeClient(b);

    await expect(
      client.request({ method: "GET", path: "/admin/secret", timeoutMs: 2000 }),
    ).rejects.toThrow(/not allowed/);

    // Allowed path still works.
    const ok = await client.request({ method: "GET", path: "/api/v1" });
    expect(ok.status).toBe(200);

    await target.close();
  });
});

describe("T1.10 bridge: request timeout when no response arrives", () => {
  it("rejects after timeoutMs and cleans up pending entry", async () => {
    const { a: _a, b } = makePair();
    // Intentionally do NOT attach a BridgeServer to `_a` — no one
    // answers, so the client must time out.
    const client = new BridgeClient(b, 100);

    await expect(
      client.request({ method: "GET", path: "/never" }),
    ).rejects.toThrow(/timeout/);
  });
});
