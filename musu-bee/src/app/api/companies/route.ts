import { getBridgeUrl } from '../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspace_id");
  const base = bridgeUrl();
  const url = workspaceId
    ? `${base}/api/companies?workspace_id=${encodeURIComponent(workspaceId)}`
    : `${base}/api/companies`;
  try {
    const res = await fetch(url, {
      headers: buildBridgeHeaders(await getBridgeToken()),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const res = await fetch(`${bridgeUrl()}/api/companies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildBridgeHeaders(await getBridgeToken()),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
