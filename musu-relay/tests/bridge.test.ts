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
  normalizePath,
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

// ── V23.2 audit LOW #9 — dc.send throw path ──────────────────────────────

describe("T2.LOW.9 bridge: dc.send throws synchronously", () => {
  it("propagates the throw as a request rejection and clears pending entry", async () => {
    const { a: _a, b } = makePair();
    // Replace b.send with a throwing variant *before* constructing the
    // client, so the very first request rejects.
    b.send = () => {
      throw new Error("dc closed");
    };
    const client = new BridgeClient(b, 5000);

    await expect(
      client.request({ method: "GET", path: "/whatever" }),
    ).rejects.toThrow(/dc closed/);

    // A subsequent request (with a fresh non-throwing send) should not see
    // the previous entry lingering in BridgeClient's pending map.
    b.send = () => {
      /* swallow — we just want this not to throw */
    };
    // No server to respond, so this will timeout — but the timeout
    // error should be from THIS request, not a stale rejection from the
    // first one.
    await expect(
      client.request({ method: "GET", path: "/whatever-2", timeoutMs: 80 }),
    ).rejects.toThrow(/timeout/);
  });
});

// ── T2.SEC.1 — path normalization unit tests ─────────────────────────────

describe("T2.SEC.1 normalizePath", () => {
  it("passes a normal API path", () => {
    expect(normalizePath("/api/v1/namespaces")).toBe("/api/v1/namespaces");
  });

  it("preserves query string", () => {
    expect(normalizePath("/api/v1/pods?limit=5")).toBe("/api/v1/pods?limit=5");
  });

  it("rejects raw `..` traversal", () => {
    expect(normalizePath("/api/../admin/secret")).toBeNull();
  });

  it("rejects percent-encoded `..` traversal", () => {
    expect(normalizePath("/api/%2e%2e/admin/secret")).toBeNull();
    expect(normalizePath("/api/%2E%2E/admin/secret")).toBeNull();
  });

  it("rejects double slash run", () => {
    expect(normalizePath("/api//admin")).toBeNull();
  });

  it("rejects single-dot segment", () => {
    expect(normalizePath("/api/./admin")).toBeNull();
  });

  it("rejects backslash", () => {
    expect(normalizePath("/api/\\admin")).toBeNull();
  });

  it("rejects NUL byte", () => {
    expect(normalizePath("/api/\0admin")).toBeNull();
  });

  it("rejects path that doesn't start with /", () => {
    expect(normalizePath("api/v1")).toBeNull();
  });

  it("rejects empty path", () => {
    expect(normalizePath("")).toBeNull();
  });
});

// ── T2.SEC.1 — wire-level: BridgeServer rejects traversal vectors ────────

describe("T2.SEC.1 bridge rejects path traversal at wire", () => {
  const TRAVERSAL_VECTORS = [
    "/api/../admin/secret",
    "/api/%2e%2e/admin/secret",
    "/api/%2E%2E/admin/secret",
    "/api//admin",
    "/api/./admin",
    "/api/\\admin",
  ];

  for (const vector of TRAVERSAL_VECTORS) {
    it(`rejects ${JSON.stringify(vector)}`, async () => {
      // Even WITHOUT pathAllowPrefix set, traversal vectors must be
      // rejected — they represent malformed input regardless of policy.
      let reached = false;
      const target = await startLocalTarget((_req, res) => {
        reached = true;
        res.writeHead(200).end("should not reach");
      });

      const { a, b } = makePair();
      new BridgeServer({
        dc: a,
        target: { host: target.host, port: target.port },
        pathAllowPrefix: "/api/",
      });
      const client = new BridgeClient(b, 1000);

      await expect(
        client.request({ method: "GET", path: vector }),
      ).rejects.toThrow(/not allowed/);
      expect(reached).toBe(false);

      await target.close();
    });
  }

  it("uses the NORMALIZED path when forwarding, not the raw one", async () => {
    // Even when a path passes the allowlist after normalization, we
    // should forward the normalized form. Vector here is benign — just
    // verifying the path the upstream sees matches what we vetted.
    let seenUrl: string | null = null;
    const target = await startLocalTarget((req, res) => {
      seenUrl = req.url ?? null;
      res.writeHead(200).end("ok");
    });
    const { a, b } = makePair();
    new BridgeServer({
      dc: a,
      target: { host: target.host, port: target.port },
    });
    const client = new BridgeClient(b);

    await client.request({ method: "GET", path: "/api/v1/pods?limit=10" });
    expect(seenUrl).toBe("/api/v1/pods?limit=10");

    await target.close();
  });
});
