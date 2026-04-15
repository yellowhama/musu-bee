import { NextRequest, NextResponse } from "next/server";
import {
  createPaddleCheckoutSession,
} from "@/lib/paddle";

export async function POST(req: NextRequest) {
  try {
    const { tier } = (await req.json()) as { tier: string };

    if (tier !== "pro" && tier !== "team") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    if (!process.env.PADDLE_API_KEY) {
      return NextResponse.json(
        { error: "PADDLE_API_KEY env var not set" },
        { status: 503 }
      );
    }

    const priceEnvKey = `PADDLE_PRICE_ID_${tier.toUpperCase()}`;
    if (!process.env[priceEnvKey]?.trim()) {
      return NextResponse.json(
        { error: `${priceEnvKey} env var not set` },
        { status: 503 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

    const session = await createPaddleCheckoutSession({
      tier,
      successUrl: `${baseUrl}/pricing?success=1&tier=${tier}`,
      cancelUrl: `${baseUrl}/pricing?cancelled=1`,
    });

    return NextResponse.json({
      provider: "paddle",
      transactionId: session.transactionId,
      url: session.checkoutUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
