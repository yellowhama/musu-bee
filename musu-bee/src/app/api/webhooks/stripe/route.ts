import { NextRequest, NextResponse } from "next/server";
import { defaultStripeWebhookDeps, handleStripeWebhook } from "./handler";

export async function POST(req: NextRequest) {
  const rawBody = await req.arrayBuffer();
  const result = await handleStripeWebhook(
    rawBody,
    req.headers.get("stripe-signature"),
    defaultStripeWebhookDeps()
  );
  return NextResponse.json(result.body, { status: result.status });
}
