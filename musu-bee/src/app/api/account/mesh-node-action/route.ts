import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import { checkMeshJoinRateLimit } from "@/lib/meshJoinRateLimit";
import {
  HeadscaleProvisioningError,
  ensureHeadscaleUser,
  headscaleUserNameForOwnerKey,
  listNodesForUser,
  renameNodeForUser,
} from "@/lib/headscaleProvisioning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/mesh-node-action  (WS-2c — machine rename)
 *
 * CLI endpoint (musu.exe), authenticated by the single-owner control bearer
 * token, exactly like mesh-join-key. The owner_key derives the acct Headscale
 * user; ALL node operations are scoped to that user's id at the control plane.
 *
 * Two actions (resolve→confirm-by-id flow, Critic HIGH-1/HIGH-2):
 *  - {action:"list"}                       → the owner's nodes (id+name+ip+online)
 *  - {action:"rename", node_id, new_name}  → rename, re-asserting ownership by id
 *
 * REMOVE is deliberately NOT here — node deletion is one-way and gated behind a
 * dual-audit + explicit approval (master plan WS-2c Phase 2). This endpoint can
 * only list and rename.
 *
 * The Headscale admin key is global (all users); the server-derived `?user=`
 * scope + per-action ownership re-assert in headscaleProvisioning are the sole
 * cross-tenant barrier (Critic HIGH-2). The admin key never leaves server env.
 */

const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("rename"),
      node_id: z.string().min(1).max(64).regex(/^\d+$/, "node_id must be numeric"),
      new_name: z.string().min(1).max(63),
    })
    .strict(),
]);

export async function POST(req: NextRequest) {
  const denied = authorizeP2pControl(req);
  if (denied) return denied;

  const ownerKey = p2pControlPrincipal(req).owner_key;

  const apiUrl = process.env.HEADSCALE_API_URL?.trim();
  const apiKey = process.env.HEADSCALE_API_KEY?.trim();
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "mesh_not_configured" },
      { status: 503 }
    );
  }

  // Rate-limit per owner (rename/list both touch the control plane).
  const rate = checkMeshJoinRateLimit(ownerKey);
  if (rate.limited) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  // Derive the acct user id from the owner_key — never from client input.
  let userName: string;
  try {
    userName = headscaleUserNameForOwnerKey(ownerKey);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_owner_key" }, { status: 400 });
  }

  const cfg = { apiUrl, apiKey };
  try {
    const user = await ensureHeadscaleUser(cfg, userName);

    if (parsed.data.action === "list") {
      const nodes = await listNodesForUser(cfg, user.id);
      return NextResponse.json({
        ok: true,
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          ips: n.ipAddresses,
          online: n.online,
          last_seen: n.lastSeen,
        })),
      });
    }

    // rename
    const updated = await renameNodeForUser(
      cfg,
      user.id,
      parsed.data.node_id,
      parsed.data.new_name
    );
    // Audit: who renamed what (no secrets, no owner token).
    console.log(`[mesh-node-action] rename node=${updated.id} → ${updated.name}`);
    return NextResponse.json({ ok: true, node: { id: updated.id, name: updated.name } });
  } catch (err) {
    if (err instanceof HeadscaleProvisioningError) {
      const status = err.status === 400 || err.status === 409 ? err.status : 502;
      return NextResponse.json(
        { ok: false, error: "mesh_node_action_failed", detail: err.message },
        { status }
      );
    }
    return NextResponse.json(
      { ok: false, error: "mesh_node_action_failed" },
      { status: 502 }
    );
  }
}
