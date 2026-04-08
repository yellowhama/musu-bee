import { NextRequest, NextResponse } from "next/server";
import { defaultPaddleWebhookDeps, handlePaddleWebhook } from "./handler";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const result = await handlePaddleWebhook(
    rawBody,
    req.headers.get("paddle-signature"),
    defaultPaddleWebhookDeps()
  );
  return NextResponse.json(result.body, { status: result.status });
}
