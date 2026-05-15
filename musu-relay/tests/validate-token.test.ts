/**
 * validateToken tests — V23.2 T2.AUTH.1 + T2.AUTH.3 combined.
 *
 * T2.AUTH.1 closes V23.1 audit HIGH #1: fail-closed-with-degraded-grace
 * replaces fail-open below circuit-breaker threshold.
 *
 * T2.AUTH.3 closes V23.1 audit HIGH #3: cache key is now `token` alone
 * (not `token:userId`), and validateToken returns the canonical userId
 * from the validation API response. HELLO-supplied user_id is no longer
 * trusted as the room key.
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

function mockFetchOk(opts: { canonicalUserId?: string } = {}): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () =>
      opts.canonicalUserId
        ? { user_id: opts.canonicalUserId }
        : ({} as Record<string, never>),
  }) as unknown as typeof fetch;
}

function mockFetch401(): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({}),
  }) as unknown as typeof fetch;
}

function mockFetchThrow(): void {
  global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
}

// ── T2.AUTH.1 — fail-closed for unseen tokens ─────────────────────────────

describe("T2.AUTH.1 — fail-closed for unseen tokens", () => {
  it("rejects an unknown token when fetch fails (was fail-open in V23.1)", async () => {
    mockFetchThrow();
    const r = await validateToken("never-seen-token", "user-a");
    expect(r.valid).toBe(false);
    expect(r.userId).toBeNull();
  });

  it("rejects on the very first attempt of an outage (no 5-attack budget)", async () => {
    mockFetchThrow();
    for (let i = 0; i < 6; i++) {
      const r = await validateToken(`fresh-token-${i}`, `user-${i}`);
      expect(r.valid).toBe(false);
    }
  });

  it("rejects identically before and after circuit opens", async () => {
    mockFetchThrow();
    const results = [];
    for (let i = 0; i < 7; i++) {
      results.push(await validateToken(`t-${i}`, `u-${i}`));
    }
    expect(results.every((r) => r.valid === false)).toBe(true);
  });
});

// ── T2.AUTH.1 — degraded grace for previously-valid tokens ────────────────

describe("T2.AUTH.1 — degraded grace for previously-valid tokens", () => {
  it("accepts a previously-valid token when fetch fails (within grace)", async () => {
    mockFetchOk({ canonicalUserId: "canon-a" });
    expect((await validateToken("good-token", "user-a")).valid).toBe(true);

    mockFetchThrow();
    const r = await validateToken("good-token", "user-a", true);
    expect(r.valid).toBe(true);
    expect(r.userId).toBe("canon-a");
  });

  it("rejects a previously-INVALID token even when fetch fails", async () => {
    mockFetch401();
    expect((await validateToken("bad-token", "user-a")).valid).toBe(false);

    mockFetchThrow();
    expect((await validateToken("bad-token", "user-a", true)).valid).toBe(false);
  });

  it("rejects an aged-past-grace successful entry on outage", async () => {
    mockFetchOk({ canonicalUserId: "canon-a" });
    expect((await validateToken("aging-token", "user-a")).valid).toBe(true);

    // Backdate cache to 6 min ago (> DEGRADED_GRACE_MS=5min).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { _validationCache } = require("../src/signaling/server");
    const entry = _validationCache.get("aging-token");
    expect(entry).toBeDefined();
    entry.timestamp = Date.now() - 6 * 60_000;

    mockFetchThrow();
    expect((await validateToken("aging-token", "user-a", true)).valid).toBe(false);
  });
});

// ── T2.AUTH.1 — circuit open does not grant unauth ────────────────────────

describe("T2.AUTH.1 — circuit open does not grant unauth access", () => {
  it("with circuit open and no cache: rejects even brand-new tokens", async () => {
    mockFetchThrow();
    for (let i = 0; i < 5; i++) await validateToken(`t${i}`, `u${i}`);

    mockFetchOk({ canonicalUserId: "would-have-been-ok" });
    const r = await validateToken("brand-new", "u-new");
    expect(r.valid).toBe(false);
  });

  it("with circuit open and a pre-authed token: grants grace", async () => {
    mockFetchOk({ canonicalUserId: "canon-pre" });
    expect((await validateToken("preauth-token", "preauth-user")).valid).toBe(true);

    mockFetchThrow();
    for (let i = 0; i < 5; i++) await validateToken(`t${i}`, `u${i}`);

    const r = await validateToken("preauth-token", "preauth-user", true);
    expect(r.valid).toBe(true);
    expect(r.userId).toBe("canon-pre");
  });
});

// ── T2.AUTH.3 — canonical userId is sourced from validation API ───────────

describe("T2.AUTH.3 — canonical userId from validation API", () => {
  it("returns the canonical userId from the response, not the claimed one", async () => {
    mockFetchOk({ canonicalUserId: "real-user-id" });
    const r = await validateToken("tok", "claimed-but-fake");
    expect(r.valid).toBe(true);
    expect(r.userId).toBe("real-user-id");
    expect(r.userId).not.toBe("claimed-but-fake");
  });

  it("cache is keyed by token alone — two users claiming the same token resolve identically", async () => {
    mockFetchOk({ canonicalUserId: "real-owner" });
    // First call: attacker claims "victim" as the user_id.
    const a = await validateToken("victim-token", "victim");
    expect(a.userId).toBe("real-owner");

    // Second call: legitimate owner. Cached.
    // We deliberately do NOT reset fetch — the cache should serve this
    // without a new network call.
    const b = await validateToken("victim-token", "real-owner");
    expect(b.userId).toBe("real-owner");
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("falls back to claimed userId with warning if validation API omits user_id (v21 compat)", async () => {
    // V21-era /validate just returns 200 with no body — current production.
    // V23.2 server tolerates this with a one-time warning until musu.pro
    // upgrades. See V23_2_PLAN §2 T2.AUTH.3.
    mockFetchOk(); // no canonicalUserId returned
    const r = await validateToken("legacy-tok", "claimed-id");
    expect(r.valid).toBe(true);
    expect(r.userId).toBe("claimed-id");
  });

  it("invalid token → userId is null", async () => {
    mockFetch401();
    const r = await validateToken("bad", "any");
    expect(r.valid).toBe(false);
    expect(r.userId).toBeNull();
  });
});

// ── Happy path (no behavioral change) ─────────────────────────────────────

describe("validateToken happy path", () => {
  it("uses cache fast path on second call", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user_id: "canon" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect((await validateToken("cached", "u")).valid).toBe(true);
    expect((await validateToken("cached", "u")).valid).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
