import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeP2pControl, p2pControlPrincipal } from "@/lib/p2pControlAuth";
import {
  saveNodeCandidateSet,
  updateRendezvousSession,
  upsertCandidateSet,
} from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const CandidateEndpointSchema = z.object({
  kind: z.enum(["lan", "tailscale", "direct_quic", "relay", "failed"]),
  addr: z.string().min(1),
  observed_at: z.string().min(1),
  scheme: z.enum(["http", "https"]).nullable().optional(),
  public_addr: z.string().min(1).nullable().optional(),
  nat_type: z.enum([
    "unknown",
    "open_internet",
    "full_cone",
    "restricted_cone",
    "port_restricted_cone",
    "symmetric",
  ]).nullable().optional(),
  nat_observed_by: z.string().min(1).nullable().optional(),
  relay_url: z.string().min(1).nullable().optional(),
  relay_protocol: z.enum([
    "quic_tls_1_3",
    "websocket_tunnel",
    "store_forward_queue",
  ]).nullable().optional(),
}).strict();

const CandidatesSchema = z.object({
  node_id: z.string().min(1),
  candidate_endpoints: z.array(CandidateEndpointSchema).max(32),
  relay_capable: z.boolean(),
  node_name: z.string().min(1).optional(),
  app_version: z.string().min(1).optional(),
  public_key: z.string().optional(),
  capabilities: z.array(z.string().min(1)).max(64).optional(),
}).strict();

const FORBIDDEN_CANDIDATE_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function pathKey(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function forbiddenCandidateByteFields(
  value: unknown,
  path: PropertyKey[] = []
): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      forbiddenCandidateByteFields(entry, [...path, index])
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const childPath = [...path, key];
    if (
      FORBIDDEN_CANDIDATE_BYTE_FIELDS.includes(
        key as (typeof FORBIDDEN_CANDIDATE_BYTE_FIELDS)[number]
      )
    ) {
      return [pathKey(childPath)];
    }
    return forbiddenCandidateByteFields(entry, childPath);
  });
}

function publicZodIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.flatMap((issue) => {
    const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
    if (issue.code === "unrecognized_keys" && keys.length > 0) {
      return keys.map((key) => ({
        path: pathKey([...issue.path, String(key)]),
        message: issue.message,
      }));
    }
    return {
      path: issue.path.join("."),
      message: issue.message,
    };
  });
}

function candidateContractIssues(data: z.infer<typeof CandidatesSchema>) {
  const issues: Array<{ path: string; message: string }> = [];
  let hasRelayEndpoint = false;

  data.candidate_endpoints.forEach((endpoint, index) => {
    if (endpoint.kind === "direct_quic") {
      if (!endpoint.public_addr) {
        issues.push({
          path: `candidate_endpoints.${index}.public_addr`,
          message: "direct_quic candidates must include public_addr for path selection",
        });
      }
      if (!endpoint.nat_type) {
        issues.push({
          path: `candidate_endpoints.${index}.nat_type`,
          message: "direct_quic candidates must include nat_type for path selection",
        });
      }
    }

    if (endpoint.kind === "relay") {
      hasRelayEndpoint = true;
      if (!endpoint.relay_url) {
        issues.push({
          path: `candidate_endpoints.${index}.relay_url`,
          message: "relay candidates must include relay_url",
        });
      }
      if (!endpoint.relay_protocol) {
        issues.push({
          path: `candidate_endpoints.${index}.relay_protocol`,
          message: "relay candidates must include relay_protocol",
        });
      }
    }
  });

  if (data.relay_capable && !hasRelayEndpoint) {
    issues.push({
      path: "relay_capable",
      message: "relay_capable=true requires at least one relay candidate endpoint",
    });
  }

  return issues;
}

function validSessionId(id: string): boolean {
  return Boolean(id) && !id.includes("/") && !id.includes("..");
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const ownerKey = p2pControlPrincipal(req).owner_key;

  const { id } = await ctx.params;
  if (!validSessionId(id)) {
    return NextResponse.json({ ok: false, error: "invalid_session_id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const forbiddenFields = forbiddenCandidateByteFields(json);
  if (forbiddenFields.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "rendezvous_candidates_payload_bytes_not_accepted",
        forbidden_fields: forbiddenFields,
        next_steps: [
          "send only node identity, route candidate, NAT, relay descriptor, and capability metadata",
          "do not send payload bytes to rendezvous candidate exchange",
          "use relay payload transport only after a lease and release-grade tunnel exist",
        ],
      },
      { status: 400 }
    );
  }

  const parsed = CandidatesSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_rendezvous_candidates",
        issues: publicZodIssues(parsed.error),
      },
      { status: 400 }
    );
  }
  const contractIssues = candidateContractIssues(parsed.data);
  if (contractIssues.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_rendezvous_candidate_contract",
        issues: contractIssues,
      },
      { status: 400 }
    );
  }

  try {
    const session = await updateRendezvousSession(id, ownerKey, (current) =>
      upsertCandidateSet(current, parsed.data)
    );
    if (!session) {
      return NextResponse.json({ ok: false, error: "rendezvous_not_found" }, { status: 404 });
    }
    const candidateSet =
      session.source.node_id === parsed.data.node_id ? session.source : session.target;
    await saveNodeCandidateSet(ownerKey, candidateSet);
    return NextResponse.json(session);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      {
        ok: false,
        error: code === "node_not_in_rendezvous" ? code : "rendezvous_candidates_failed",
      },
      { status: code === "node_not_in_rendezvous" ? 400 : 503 }
    );
  }
}
