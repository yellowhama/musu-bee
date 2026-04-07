import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { tier } = (await req.json()) as { tier: string };

    if (tier !== "pro" && tier !== "team") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const priceId = STRIPE_PRICES[tier];
    if (!priceId) {
      return NextResponse.json(
        { error: `STRIPE_PRICE_${tier.toUpperCase()} env var not set` },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/pro?success=1&tier=${tier}`,
      cancel_url: `${baseUrl}/pro?cancelled=1`,
      metadata: { tier },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
