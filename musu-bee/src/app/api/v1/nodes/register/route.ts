import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  publicRegistryNode,
  registryPublicUrlIssue,
  registerNode,
} from "@/lib/nodeRegistryStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Matches RegisterNodeRequest in musu-rs/src/cloud/mod.rs:102-116. node_name and
// public_url are required; the rest are optional metadata. user_id/owner are
// NEVER accepted from the body — owner scope is derived server-side from the
// bearer token via p2pControlPrincipal.
const RegisterNodeSchema = z
  .object({
    node_name: z.string().trim().min(1).max(128),
    public_url: z.string().trim().min(1).max(512).superRefine((value, ctx) => {
      const issue = registryPublicUrlIssue(value);
      if (issue) {
        ctx.addIssue({ code: "custom", message: issue });
      }
    }),
    cert_fingerprint: z.string().trim().max(256).nullable().optional(),
    machine_group: z.string().trim().max(256).nullable().optional(),
    mac_address: z.string().trim().max(256).nullable().optional(),
    broadcast_ip: z.string().trim().max(256).nullable().optional(),
    meta: z.unknown().optional(),
  })
  .strict();

function publicZodIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.flatMap((issue) => {
    const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
    if (issue.code === "unrecognized_keys" && keys.length > 0) {
      return keys.map((key) => ({
        path: [...issue.path, String(key)].map(String).join("."),
        message: issue.message,
      }));
    }
    return {
      path: issue.path.map(String).join("."),
      message: issue.message,
    };
  });
}

export async function POST(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const ownerKey = p2pControlPrincipal(req).owner_key;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = RegisterNodeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_register_node_request",
        issues: publicZodIssues(parsed.error),
      },
      { status: 400 }
    );
  }

  try {
    const node = await registerNode({
      owner_key: ownerKey,
      node_name: parsed.data.node_name,
      public_url: parsed.data.public_url,
      cert_fingerprint: parsed.data.cert_fingerprint ?? undefined,
      machine_group: parsed.data.machine_group ?? undefined,
      mac_address: parsed.data.mac_address ?? undefined,
      broadcast_ip: parsed.data.broadcast_ip ?? undefined,
      meta: parsed.data.meta,
    });
    // Bare RegistryNode object: register_node() in cloud/mod.rs deserializes the
    // raw body directly into RegistryNode (no wrapper).
    return NextResponse.json(publicRegistryNode(node), { status: 200 });
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
