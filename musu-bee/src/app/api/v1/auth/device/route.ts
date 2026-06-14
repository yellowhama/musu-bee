import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { configuredP2pControlToken } from "@/lib/p2pControlAuth";
import {
  consumeDeviceCode,
  createDeviceCodeRecord,
  deviceCodeTtlSeconds,
  saveDeviceCode,
} from "@/lib/deviceCodeStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const StartSchema = z
  .object({
    node_name: z.string().min(1).max(256).optional(),
  })
  .strict();

// H-2: the poll secret (device_code) is taken from the POST body, NEVER a query
// string. Query strings leak into CDN/proxy/access logs and this endpoint
// returns the real control token. The Rust client posts it in the body too.
const PollSchema = z
  .object({
    device_code: z.string().min(1).max(512),
  })
  .strict();

function verificationUri(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return `${configured.replace(/\/+$/, "")}/link`;
  }
  // Fall back to the request origin so local dev resolves correctly.
  const origin = req.nextUrl.origin;
  return `${origin}/link`;
}

/**
 * POST /api/v1/auth/device
 *  - With NO body / `{node_name}`-only body: START the device flow. Returns
 *    {user_code, device_code, verification_uri, expires_in, interval}.
 *  - With `{device_code}` body: POLL. 202 {status:"pending"} while pending,
 *    200 {token} once approved+consumed, 410 when expired/consumed/unknown.
 *
 * Disambiguation: a body containing `device_code` is a poll; anything else is a
 * start. This keeps a single endpoint matching the Rust contract while moving
 * the poll secret out of the URL (H-2).
 */
export async function POST(req: NextRequest) {
  let json: unknown = undefined;
  try {
    const text = await req.text();
    json = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (json && typeof json === "object" && "device_code" in (json as Record<string, unknown>)) {
    return handlePoll(json);
  }
  return handleStart(req, json);
}

async function handleStart(req: NextRequest, json: unknown): Promise<NextResponse> {
  const parsed = StartSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_device_start_request" },
      { status: 400 }
    );
  }

  const record = createDeviceCodeRecord({ node_name: parsed.data.node_name });
  try {
    await saveDeviceCode(record);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "device_code_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }

  // device_code is returned to the originating client ONLY (never logged). It is
  // the poll secret; the human sees only user_code on the /link page.
  return NextResponse.json(
    {
      user_code: record.user_code,
      device_code: record.device_code,
      verification_uri: verificationUri(req),
      expires_in: deviceCodeTtlSeconds(),
      interval: 5,
    },
    { status: 200 }
  );
}

async function handlePoll(json: unknown): Promise<NextResponse> {
  const parsed = PollSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_device_poll_request" }, { status: 400 });
  }

  const deviceCode = parsed.data.device_code;
  let result;
  try {
    result = await consumeDeviceCode(deviceCode);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "device_code_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }

  if (result.status === "pending") {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  if (
    result.status === "expired" ||
    result.status === "not_found" ||
    result.status === "not_deliverable"
  ) {
    // 410 Gone: expired, already consumed, or unknown. Never reveal which.
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  // status === "consumed": issue the SHARED control token. If only the SHA256
  // allowlist is configured (raw token unavailable), we cannot fabricate a token
  // — return 503 so the operator sets MUSU_P2P_CONTROL_TOKEN (raw).
  const token = configuredP2pControlToken();
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "p2p_control_token_not_issuable",
        detail:
          "device approved but no raw control token is configured; set MUSU_P2P_CONTROL_TOKEN",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ token }, { status: 200 });
}
