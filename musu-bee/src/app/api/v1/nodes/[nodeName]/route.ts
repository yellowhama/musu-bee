import { NextRequest, NextResponse } from "next/server";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { deleteNodeByName } from "@/lib/nodeRegistryStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ nodeName: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }

  const { nodeName } = await params;
  const normalizedNodeName = decodeURIComponent(nodeName ?? "").trim();
  if (!normalizedNodeName) {
    return NextResponse.json(
      { ok: false, error: "node_name_required" },
      { status: 400 }
    );
  }

  const ownerKey = p2pControlPrincipal(req).owner_key;

  try {
    const deleted = await deleteNodeByName(ownerKey, normalizedNodeName);
    return NextResponse.json(
      { ok: true, node_name: normalizedNodeName, deleted },
      { status: deleted ? 200 : 404 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "node_registry_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
