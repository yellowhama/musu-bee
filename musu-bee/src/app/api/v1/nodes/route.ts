import { NextRequest, NextResponse } from "next/server";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { listNodes, publicRegistryNode } from "@/lib/nodeRegistryStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const ownerKey = p2pControlPrincipal(req).owner_key;

  try {
    const nodes = await listNodes(ownerKey);
    // Bare RegistryNode[] array: list_nodes() in cloud/mod.rs deserializes the
    // raw body directly into Vec<RegistryNode> (no wrapper). Only this owner's
    // nodes are returned — listNodes is scoped to ownerKey.
    return NextResponse.json(nodes.map(publicRegistryNode), { status: 200 });
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
