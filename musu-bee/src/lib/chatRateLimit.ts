import type { NextRequest } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_CLEANUP_EVERY = 200;
const UNTRUSTED_BUCKET_KEY = "boundary:untrusted";

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

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeClientIdentity(raw: string | null): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const firstToken = trimmed.split(",")[0]?.trim();
  if (!firstToken) return null;

  // Keep identity parsing deterministic and reject malformed separators/control chars.
  if (!/^[A-Za-z0-9:.\[\]%-]+(?::\d{1,5})?$/.test(firstToken)) {
    return null;
  }

  if (firstToken.startsWith("[") && firstToken.endsWith("]")) {
    return firstToken.slice(1, -1).toLowerCase();
  }

  const ipv4WithPort = firstToken.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/);
  if (ipv4WithPort?.[1]) {
    return ipv4WithPort[1];
  }

  return firstToken.toLowerCase();
}

function getTrustedClientKey(req: NextRequest): string {
  const trustedHeaderName = (
    process.env.MUSU_TRUSTED_CLIENT_IP_HEADER ?? "x-real-ip"
  ).toLowerCase();

  // Trusted mode assumption:
  // upstream proxy strips client-supplied forwarding headers and rewrites this header.
  const trustedHeaderValue = normalizeClientIdentity(req.headers.get(trustedHeaderName));
  if (trustedHeaderValue) {
    return `trusted:${trustedHeaderValue}`;
  }

  if (trustedHeaderName !== "x-real-ip") {
    const realIp = normalizeClientIdentity(req.headers.get("x-real-ip"));
    if (realIp) {
      return `trusted:${realIp}`;
    }
  }

  return "trusted:unknown";
}

function getDirectRuntimeClientKey(req: NextRequest): string | null {
  // Next.js may provide a connection-derived client IP on some runtimes.
  const runtimeIp = (req as NextRequest & { ip?: string }).ip;
  const normalized = normalizeClientIdentity(
    typeof runtimeIp === "string" ? runtimeIp : null
  );
  return normalized ? `direct:${normalized}` : null;
}

function getClientKey(req: NextRequest): string {
  if (parseBoolean(process.env.MUSU_TRUST_PROXY_HEADERS)) {
    return getTrustedClientKey(req);
  }

  // Untrusted mode: never key on request-provided forwarding headers.
  // Use runtime-derived client IP when available; otherwise isolate into one shared bucket.
  const directRuntimeKey = getDirectRuntimeClientKey(req);
  if (directRuntimeKey) {
    return directRuntimeKey;
  }

  return UNTRUSTED_BUCKET_KEY;
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
