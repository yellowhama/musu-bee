import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
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

function firstForwardedIp(req: NextRequest): string | null {
  const rawValues = [
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("true-client-ip"),
    req.headers.get("fly-client-ip"),
  ];

  for (const raw of rawValues) {
    for (const item of raw?.split(",") ?? []) {
      const candidate = item.trim().replace(/^\[/, "").replace(/\]$/, "");
      if (isIP(candidate) !== 0) {
        return candidate;
      }
    }
  }
  return null;
}

function endpointAddrForHost(host: string, port: string): string {
  const suffix = port ? `:${port}` : "";
  return isIP(host) === 6 ? `[${host}]${suffix}` : `${host}${suffix}`;
}

function observedSourceCandidate(
  req: NextRequest,
  publicUrl: string
): Record<string, unknown> | null {
  const sourceIp = firstForwardedIp(req);
  if (!sourceIp) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, "");
  const addr = endpointAddrForHost(sourceIp, url.port);
  const candidateUrl = `${scheme}://${addr}`;
  if (registryPublicUrlIssue(candidateUrl)) {
    return null;
  }

  const observedAt = new Date().toISOString();
  return {
    kind: "observed_source_ip",
    addr,
    public_addr: addr,
    observed_at: observedAt,
    scheme,
    nat_observed_by: "musu.pro/api/v1/nodes/register",
  };
}

function asMetaObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function mergeServerObservedCandidate(
  meta: unknown,
  candidate: Record<string, unknown> | null
): unknown {
  if (!candidate) {
    return meta;
  }

  const metaObj = asMetaObject(meta);
  const candidateAddr = typeof candidate.addr === "string" ? candidate.addr : "";
  const existingCandidates = Array.isArray(metaObj.candidate_endpoints)
    ? metaObj.candidate_endpoints.filter((item) => item && typeof item === "object")
    : [];
  const alreadyPresent = existingCandidates.some((item) => {
    const endpoint = item as Record<string, unknown>;
    return endpoint.addr === candidateAddr || endpoint.public_addr === candidateAddr;
  });

  return {
    ...metaObj,
    candidate_model:
      typeof metaObj.candidate_model === "string"
        ? metaObj.candidate_model
        : "v34_additive_candidate_set_v1",
    observed_source_ip: firstForwardedIpFromCandidate(candidate),
    observed_source_ip_at: candidate.observed_at,
    candidate_endpoints: alreadyPresent
      ? existingCandidates
      : [candidate, ...existingCandidates].slice(0, 32),
  };
}

function firstForwardedIpFromCandidate(candidate: Record<string, unknown>): string | undefined {
  const addr = typeof candidate.addr === "string" ? candidate.addr : "";
  const bracketed = addr.match(/^\[([^\]]+)\]/);
  if (bracketed?.[1]) {
    return bracketed[1];
  }
  const withoutPort = addr.split(":")[0];
  return withoutPort && isIP(withoutPort) !== 0 ? withoutPort : undefined;
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
      meta: mergeServerObservedCandidate(
        parsed.data.meta,
        observedSourceCandidate(req, parsed.data.public_url)
      ),
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
