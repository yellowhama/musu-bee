/**
 * Per-account rate limit for mesh-join-key minting.
 *
 * Each successful mint creates a Headscale preauth key (and possibly a user), so
 * an authenticated caller that hammers the endpoint could flood the control
 * plane with keys. We cap mints per account per window. Keyed on the Supabase
 * user id (server-derived, never client-supplied), so it is independent of IP /
 * proxy trust — simpler and stricter than the IP-keyed chat limiter.
 *
 * In-memory + global-scoped, matching chatRateLimit.ts. On serverless this is
 * per-instance, which is acceptable: it bounds burst per warm instance, and the
 * short preauth-key TTL plus reusable:false is the real blast-radius control.
 */

const WINDOW_MS = 60_000;
const CLEANUP_EVERY = 200;

type Entry = { count: number; windowStartMs: number };

declare global {
  // eslint-disable-next-line no-var
  var __musuMeshJoinRateLimit: Map<string, Entry> | undefined;
  // eslint-disable-next-line no-var
  var __musuMeshJoinRateLimitOps: number | undefined;
}

function store(): Map<string, Entry> {
  if (!globalThis.__musuMeshJoinRateLimit) {
    globalThis.__musuMeshJoinRateLimit = new Map<string, Entry>();
  }
  return globalThis.__musuMeshJoinRateLimit;
}

function maxPerWindow(): number {
  const configured = Number(process.env.MUSU_MESH_JOIN_RATE_LIMIT_PER_MINUTE ?? "10");
  if (!Number.isFinite(configured)) return 10;
  return Math.max(1, Math.floor(configured));
}

/**
 * Records one attempt for `accountId` and reports whether it is rate-limited.
 * `nowMs` is injected so tests stay deterministic.
 */
export function checkMeshJoinRateLimit(
  accountId: string,
  nowMs: number = Date.now()
): { limited: false } | { limited: true; retryAfterSeconds: number } {
  const s = store();
  const key = `acct:${accountId}`;
  const entry = s.get(key);

  globalThis.__musuMeshJoinRateLimitOps =
    (globalThis.__musuMeshJoinRateLimitOps ?? 0) + 1;
  if (globalThis.__musuMeshJoinRateLimitOps % CLEANUP_EVERY === 0) {
    for (const [k, v] of s.entries()) {
      if (nowMs - v.windowStartMs >= WINDOW_MS) s.delete(k);
    }
  }

  if (!entry || nowMs - entry.windowStartMs >= WINDOW_MS) {
    s.set(key, { count: 1, windowStartMs: nowMs });
    return { limited: false };
  }

  entry.count += 1;
  s.set(key, entry);
  if (entry.count <= maxPerWindow()) {
    return { limited: false };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((entry.windowStartMs + WINDOW_MS - nowMs) / 1000)
  );
  return { limited: true, retryAfterSeconds };
}

export function resetMeshJoinRateLimitForTests() {
  globalThis.__musuMeshJoinRateLimit?.clear();
  globalThis.__musuMeshJoinRateLimitOps = 0;
}
