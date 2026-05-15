/**
 * validateToken fail-closed-with-cached-grace tests (V23.2 T2.AUTH.1).
 *
 * Closes V23.1 audit HIGH #1: previously, on fetch error below the
 * circuit-breaker threshold, validateToken returned true (fail-open),
 * granting up to 5 unauthenticated handshakes per outage window.
 *
 * New behavior:
 *   - Unknown token + fetch fails → reject (fail-closed).
 *   - Previously-valid token + fetch fails → accept if cache age <
 *     DEGRADED_GRACE_MS (5 min), else reject.
 *   - Previously-invalid token + fetch fails → reject regardless of age.
 *   - Circuit-open path also uses degraded-grace fallback (does NOT
 *     grant unauthenticated access).
 */

import { validateToken, _resetAuthState } from "../src/signaling/server";

let originalFetch: typeof fetch;

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

beforeEach(() => {
  _resetAuthState();
});

function mockFetchOk(ok: boolean): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 401,
  }) as unknown as typeof fetch;
}

function mockFetchThrow(): void {
  global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
}

describe("V23.2 T2.AUTH.1 — fail-closed for unseen tokens", () => {
  it("rejects an unknown token when fetch fails (was fail-open in V23.1)", async () => {
    mockFetchThrow();
    const ok = await validateToken("never-seen-token", "user-a");
    expect(ok).toBe(false);
  });

  it("rejects an unknown token even on the very first attempt of an outage", async () => {
    mockFetchThrow();
    // Audit #1: V23.1 would have allowed the first 5 of these. Verify we
    // now reject from the very first call.
    for (let i = 0; i < 6; i++) {
      const ok = await validateToken(`fresh-token-${i}`, `user-${i}`);
      expect(ok).toBe(false);
    }
  });

  it("rejects unknown tokens with the SAME outcome before and after circuit opens", async () => {
    mockFetchThrow();
    // Five throws → circuit opens. Each call should still return false.
    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      results.push(await validateToken(`t-${i}`, `u-${i}`));
    }
    expect(results.every((r) => r === false)).toBe(true);
  });
});

describe("V23.2 T2.AUTH.1 — degraded grace for previously-valid tokens", () => {
  it("accepts a previously-valid token when fetch fails (within grace window)", async () => {
    // 1. Successful validation populates the cache.
    mockFetchOk(true);
    expect(await validateToken("good-token", "user-a")).toBe(true);

    // 2. Cache TTL expires; force a re-validation that hits the network.
    // We can't easily move wall-clock, so we use forceRefresh.
    mockFetchThrow();
    const ok = await validateToken("good-token", "user-a", true);
    expect(ok).toBe(true); // grace granted — cache entry is recent
  });

  it("rejects a previously-INVALID token even when fetch fails", async () => {
    // 1. Validation returns 401; cache stores {valid:false}.
    mockFetchOk(false);
    expect(await validateToken("bad-token", "user-a")).toBe(false);

    // 2. Outage now. We must NOT silently flip to true.
    mockFetchThrow();
    expect(await validateToken("bad-token", "user-a", true)).toBe(false);
  });

  it("rejects a token whose successful cache entry has aged past grace window", async () => {
    // 1. Successful validation.
    mockFetchOk(true);
    expect(await validateToken("aging-token", "user-a")).toBe(true);

    // 2. Manually back-date the cache entry past DEGRADED_GRACE_MS (5 min).
    // We have to import the cache to mutate it for this test, since we
    // can't move wall-clock without bigger machinery.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { _validationCache } = require("../src/signaling/server");
    const key = "aging-token:user-a";
    const entry = _validationCache.get(key);
    expect(entry).toBeDefined();
    entry.timestamp = Date.now() - 6 * 60_000; // 6 min ago > 5 min grace

    // 3. Outage now.
    mockFetchThrow();
    expect(await validateToken("aging-token", "user-a", true)).toBe(false);
  });
});

describe("V23.2 T2.AUTH.1 — circuit open does not grant unauthenticated access", () => {
  it("with circuit open and no cache: rejects", async () => {
    // Trip the breaker.
    mockFetchThrow();
    for (let i = 0; i < 5; i++) {
      await validateToken(`t${i}`, `u${i}`);
    }
    // Circuit is now open. Even a brand-new token should be rejected.
    // Switch fetch to ok=true to make sure the circuit-open path is what
    // we're testing — if the function called fetch and got true, the test
    // would pass for the wrong reason.
    mockFetchOk(true);
    const ok = await validateToken("brand-new-token", "brand-new-user");
    expect(ok).toBe(false);
  });

  it("with circuit open and a fresh successful cache: grants grace", async () => {
    // First, populate cache with a successful entry.
    mockFetchOk(true);
    expect(await validateToken("preauth-token", "preauth-user")).toBe(true);

    // Now trip the breaker with a different token.
    mockFetchThrow();
    for (let i = 0; i < 5; i++) {
      await validateToken(`t${i}`, `u${i}`);
    }
    // Circuit is open. Pre-authenticated user gets degraded grace.
    const ok = await validateToken("preauth-token", "preauth-user", true);
    expect(ok).toBe(true);
  });
});

describe("V23.2 T2.AUTH.1 — happy path still works", () => {
  it("returns true when fetch is ok=true (no change)", async () => {
    mockFetchOk(true);
    expect(await validateToken("ok-token", "ok-user")).toBe(true);
  });

  it("returns false when fetch is ok=false (no change)", async () => {
    mockFetchOk(false);
    expect(await validateToken("bad-token", "bad-user")).toBe(false);
  });

  it("uses the recent-cache fast path on the second call", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await validateToken("cached", "u")).toBe(true);
    expect(await validateToken("cached", "u")).toBe(true);
    // Should have hit the network only once.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
