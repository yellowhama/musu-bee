import type { NextRequest } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_CLEANUP_EVERY = 200;

type RateLimitEntry = { count: number; windowStartMs: number };

declare global {
  var __musuChatRateLimit: Map<string, RateLimitEntry> | undefined;
  var __musuChatRateLimitOps: number | undefined;
}

function getRateLimitStore(): Map<string, RateLimitEntry> {
  if (!globalThis.__musuChatRateLimit) {
    globalThis.__musuChatRateLimit = new Map<string, RateLimitEntry>();
  }
  return globalThis.__musuChatRateLimit;
}

function getRateLimitMaxRequests(): number {
  const configured = Number(process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE ?? "20");
  if (!Number.isFinite(configured)) return 20;
  return Math.max(1, configured);
}

function getClientKey(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function checkChatRateLimit(
  req: NextRequest
): { limited: false } | { limited: true; retryAfterSeconds: number } {
  const rateLimitMaxRequests = getRateLimitMaxRequests();
  const store = getRateLimitStore();
  const now = Date.now();
  const key = getClientKey(req);
  const entry = store.get(key);

  globalThis.__musuChatRateLimitOps = (globalThis.__musuChatRateLimitOps ?? 0) + 1;
  if (globalThis.__musuChatRateLimitOps % RATE_LIMIT_CLEANUP_EVERY === 0) {
    for (const [storeKey, value] of store.entries()) {
      if (now - value.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
        store.delete(storeKey);
      }
    }
  }

  if (!entry || now - entry.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    store.set(key, { count: 1, windowStartMs: now });
    return { limited: false };
  }

  entry.count += 1;
  store.set(key, entry);
  if (entry.count <= rateLimitMaxRequests) {
    return { limited: false };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((entry.windowStartMs + RATE_LIMIT_WINDOW_MS - now) / 1000)
  );
  return { limited: true, retryAfterSeconds };
}

export function resetChatRateLimitForTests() {
  globalThis.__musuChatRateLimit?.clear();
  globalThis.__musuChatRateLimitOps = 0;
}
