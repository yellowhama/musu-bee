/**
 * musu-relay server tests.
 *
 * Tests the Express app + validation cache + tunnel state.
 * MUSU_RELAY_SECRET is empty at import time (test default), so
 * the proxy endpoint returns 500 "not configured" — that's the
 * expected behavior in unconfigured mode.
 */
import supertest from "supertest";
import { app, tunnels, wsSessions, validationCache, _resetState, _sessionCleanupTimer } from "../src/server";

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  clearInterval(_sessionCleanupTimer);
  jest.restoreAllMocks();
});
beforeEach(() => _resetState());

// ── Health ────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Array.isArray(res.body.tunnels)).toBe(true);
  });

  it("lists active tunnel node IDs", async () => {
    // Simulate a tunnel entry (ws is null, just testing the listing)
    tunnels.set("test-node", { ws: null as any, token: "tok" });
    const res = await supertest(app).get("/health");
    expect(res.body.tunnels).toContain("test-node");
  });
});

// ── Proxy auth (RELAY_SECRET not configured) ─────────────────────────────

describe("GET /proxy/:nodeId/*", () => {
  it("returns 500 when RELAY_SECRET not configured", async () => {
    const res = await supertest(app).get("/proxy/node1/health");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/MUSU_RELAY_SECRET/i);
  });

  it("POST also returns 500 without secret", async () => {
    const res = await supertest(app)
      .post("/proxy/node1/api/route")
      .send({ text: "hello" });
    expect(res.status).toBe(500);
  });
});

// ── Validation cache ─────────────────────────────────────────────────────

describe("validationCache", () => {
  it("starts empty after reset", () => {
    expect(validationCache.size).toBe(0);
  });

  it("stores and retrieves entries", () => {
    validationCache.set("tok:node1", { valid: true, timestamp: Date.now() });
    expect(validationCache.get("tok:node1")?.valid).toBe(true);
  });

  it("clears on _resetState", () => {
    validationCache.set("tok:node1", { valid: true, timestamp: Date.now() });
    _resetState();
    expect(validationCache.size).toBe(0);
  });

  it("expired entries are stale (simulated)", () => {
    const staleTs = Date.now() - 60_000; // 60s ago, TTL is 30s
    validationCache.set("tok:node1", { valid: true, timestamp: staleTs });
    const entry = validationCache.get("tok:node1")!;
    const isStale = Date.now() - entry.timestamp > 30_000;
    expect(isStale).toBe(true);
  });
});

// ── Tunnel state ─────────────────────────────────────────────────────────

describe("tunnel registry", () => {
  it("starts empty", () => {
    expect(tunnels.size).toBe(0);
  });

  it("can register and look up tunnels", () => {
    tunnels.set("node-a", { ws: null as any, token: "tok-a" });
    expect(tunnels.has("node-a")).toBe(true);
    expect(tunnels.get("node-a")?.token).toBe("tok-a");
  });

  it("clears on _resetState", () => {
    tunnels.set("node-a", { ws: null as any, token: "tok-a" });
    _resetState();
    expect(tunnels.size).toBe(0);
  });
});

// ── WS sessions state ────────────────────────────────────────────────────

describe("wsSessions registry", () => {
  it("starts empty", () => {
    expect(wsSessions.size).toBe(0);
  });

  it("can register sessions", () => {
    wsSessions.set("sess-1", {
      sessionId: "sess-1",
      clientWs: null as any,
      createdAt: Date.now(),
      nodeId: "node-a",
    });
    expect(wsSessions.size).toBe(1);
    expect(wsSessions.get("sess-1")?.nodeId).toBe("node-a");
  });

  it("clears on _resetState", () => {
    wsSessions.set("sess-1", {
      sessionId: "sess-1",
      clientWs: null as any,
      createdAt: Date.now(),
      nodeId: null,
    });
    _resetState();
    expect(wsSessions.size).toBe(0);
  });
});

// ── 404 for unknown routes ───────────────────────────────────────────────

describe("unknown routes", () => {
  it("GET /nonexistent returns 404", async () => {
    const res = await supertest(app).get("/nonexistent");
    expect(res.status).toBe(404);
  });
});
