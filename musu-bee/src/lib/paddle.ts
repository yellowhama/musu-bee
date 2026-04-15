import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanTier } from "./subscription";

export const PADDLE_PRICE_IDS: Record<Exclude<PlanTier, "free">, string> = {
  pro: process.env.PADDLE_PRICE_ID_PRO ?? "",
  team: process.env.PADDLE_PRICE_ID_TEAM ?? "",
};

type PaddleEnvironment = "sandbox" | "production";

function resolvePaddleEnvironment(): PaddleEnvironment {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
    ? "production"
    : "sandbox";
}

function paddleApiBaseUrl(): string {
  if (process.env.PADDLE_API_BASE_URL) return process.env.PADDLE_API_BASE_URL;
  return resolvePaddleEnvironment() === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export interface CreatePaddleCheckoutSessionInput {
  tier: Exclude<PlanTier, "free">;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}

export async function createPaddleCheckoutSession(
  input: CreatePaddleCheckoutSessionInput
): Promise<{ transactionId: string; checkoutUrl: string }> {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("PADDLE_API_KEY is not set");

  const priceId = PADDLE_PRICE_IDS[input.tier];
  if (!priceId) {
    throw new Error(`PADDLE_PRICE_ID_${input.tier.toUpperCase()} is not set`);
  }

  const payload: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { tier: input.tier },
    checkout: {
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
  };

  if (input.customerEmail) {
    payload.customer = { email: input.customerEmail };
  }

  const response = await fetch(`${paddleApiBaseUrl()}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as
    | {
        error?: { detail?: string };
        data?: { id?: string; checkout?: { url?: string } };
      }
    | null;

  if (!response.ok) {
    const detail = body?.error?.detail ?? `HTTP ${response.status}`;
    throw new Error(`Paddle checkout session failed: ${detail}`);
  }

  const transactionId = body?.data?.id;
  const checkoutUrl = body?.data?.checkout?.url;

  if (!transactionId || !checkoutUrl) {
    throw new Error("Paddle checkout response missing transaction ID or URL");
  }

  return { transactionId, checkoutUrl };
}

function parsePaddleSignatureHeader(
  headerValue: string
): { timestamp: string | null; signatures: string[] } {
  const parts = headerValue
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || !value) continue;

    if (key === "ts") timestamp = value;
    if (key === "h1") signatures.push(value);
  }

  return { timestamp, signatures };
}

export function verifyPaddleWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  maxAgeSeconds = 300
): boolean {
  const { timestamp, signatures } = parsePaddleSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;
  const signedAt = Number(timestamp);
  if (!Number.isFinite(signedAt)) return false;
  const now = Math.floor(Date.now() / 1000);
  const age = now - signedAt;
  if (age < 0 || age > maxAgeSeconds) return false;

  const expectedDigest = createHmac("sha256", webhookSecret)
    .update(`${timestamp}:${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expectedDigest, "hex");

  return signatures.some((signature) => {
    let providedBuffer: Buffer;
    try {
      providedBuffer = Buffer.from(signature, "hex");
    } catch {
      return false;
    }
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(providedBuffer, expectedBuffer);
  });
}

export function extractPaddlePriceId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as {
    items?: Array<{
      price?: { id?: string };
      price_id?: string;
    }>;
  };
  const firstItem = candidate.items?.[0];
  return firstItem?.price?.id ?? firstItem?.price_id ?? null;
}
