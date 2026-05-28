import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${bridgeUrl()}/api/companies/${encodeURIComponent(id)}`, {
      headers: buildBridgeHeaders(await getBridgeToken()),
    });
    if (res.status === 404) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const res = await fetch(`${bridgeUrl()}/api/companies/${encodeURIComponent(id)}`, {
      method: "PUT",
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${bridgeUrl()}/api/companies/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: buildBridgeHeaders(await getBridgeToken()),
    });
    if (res.status === 404) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "bridge_unavailable" }, { status: 503 });
  }
}
