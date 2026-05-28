import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function bridgeUrl(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }
  try {
    const res = await fetch(`${bridgeUrl()}/api/tasks/${id}`, {
      method: "DELETE",
      headers: buildBridgeHeaders(await getBridgeToken()),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}
