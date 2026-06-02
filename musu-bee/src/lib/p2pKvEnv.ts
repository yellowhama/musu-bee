export type P2pKvEnvName =
  | "KV_REST_API_URL"
  | "KV_REST_API_TOKEN"
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN";

export type P2pKvEnvSource = "vercel_kv" | "upstash_redis" | "missing";

function getEnv(name: P2pKvEnvName): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function p2pKvRestApiUrl(): string | undefined {
  return getEnv("KV_REST_API_URL") ?? getEnv("UPSTASH_REDIS_REST_URL");
}

export function p2pKvRestApiToken(): string | undefined {
  return getEnv("KV_REST_API_TOKEN") ?? getEnv("UPSTASH_REDIS_REST_TOKEN");
}

export function hasP2pKvCredentials(): boolean {
  return Boolean(p2pKvRestApiUrl() && p2pKvRestApiToken());
}

export function ensureP2pKvRestEnvAliases(): void {
  if (!getEnv("KV_REST_API_URL")) {
    const upstashUrl = getEnv("UPSTASH_REDIS_REST_URL");
    if (upstashUrl) {
      process.env.KV_REST_API_URL = upstashUrl;
    }
  }
  if (!getEnv("KV_REST_API_TOKEN")) {
    const upstashToken = getEnv("UPSTASH_REDIS_REST_TOKEN");
    if (upstashToken) {
      process.env.KV_REST_API_TOKEN = upstashToken;
    }
  }
}

export function p2pKvEnvStatus(): {
  has_url: boolean;
  has_token: boolean;
  url_source: P2pKvEnvSource;
  token_source: P2pKvEnvSource;
} {
  const hasKvUrl = Boolean(getEnv("KV_REST_API_URL"));
  const hasKvToken = Boolean(getEnv("KV_REST_API_TOKEN"));
  const hasUpstashUrl = Boolean(getEnv("UPSTASH_REDIS_REST_URL"));
  const hasUpstashToken = Boolean(getEnv("UPSTASH_REDIS_REST_TOKEN"));
  return {
    has_url: hasKvUrl || hasUpstashUrl,
    has_token: hasKvToken || hasUpstashToken,
    url_source: hasKvUrl ? "vercel_kv" : hasUpstashUrl ? "upstash_redis" : "missing",
    token_source: hasKvToken
      ? "vercel_kv"
      : hasUpstashToken
        ? "upstash_redis"
        : "missing",
  };
}
