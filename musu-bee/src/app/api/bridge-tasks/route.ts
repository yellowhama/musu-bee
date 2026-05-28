import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

const ALLOWED_PARAMS = new Set(["status", "limit", "before_id", "channel", "company_id"]);

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(`${bridgeUrl()}/api/tasks`);
    req.nextUrl.searchParams.forEach((value, key) => {
      if (ALLOWED_PARAMS.has(key)) url.searchParams.set(key, value);
    });
    const res = await fetch(url.toString(), {
      headers: buildBridgeHeaders(await getBridgeToken()),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}
