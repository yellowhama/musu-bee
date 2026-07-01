import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  authorizeP2pControl,
  p2pControlPrincipal,
  p2pSourceNodeAuthBindingFields,
  p2pSourceNodeAuthMismatch,
} from "@/lib/p2pControlAuth";
import {
  createRendezvousSession,
  loadNodeCandidateSet,
  saveRendezvousSession,
} from "@/lib/p2pRendezvousStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateRendezvousSchema = z.object({
  source_node_id: z.string().min(1),
  target_node_id: z.string().min(1),
  requested_capability: z.string().min(1).nullable().optional(),
}).strict();

const FORBIDDEN_RENDEZVOUS_BYTE_FIELDS = [
  "payload",
  "payload_base64",
  "payload_b64",
  "payload_bytes",
  "body_base64",
] as const;

function pathKey(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function forbiddenRendezvousByteFields(
  value: unknown,
  path: PropertyKey[] = []
): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      forbiddenRendezvousByteFields(entry, [...path, index])
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const childPath = [...path, key];
    if (
      FORBIDDEN_RENDEZVOUS_BYTE_FIELDS.includes(
        key as (typeof FORBIDDEN_RENDEZVOUS_BYTE_FIELDS)[number]
      )
    ) {
      return [pathKey(childPath)];
    }
    return forbiddenRendezvousByteFields(entry, childPath);
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

export async function POST(req: NextRequest) {
  const failedAuth = authorizeP2pControl(req);
  if (failedAuth) {
    return failedAuth;
  }
  const principal = p2pControlPrincipal(req);
  const ownerKey = principal.owner_key;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const forbiddenFields = forbiddenRendezvousByteFields(json);
  if (forbiddenFields.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "rendezvous_payload_bytes_not_accepted",
        forbidden_fields: forbiddenFields,
        next_steps: [
          "send only rendezvous source, target, and capability metadata",
          "do not send payload bytes to /api/v1/p2p/rendezvous",
          "use relay payload transport only after a lease and release-grade tunnel exist",
        ],
      },
      { status: 400 }
    );
  }

  const parsed = CreateRendezvousSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_rendezvous_request",
        issues: publicZodIssues(parsed.error),
      },
      { status: 400 }
    );
  }

  const sourceNodeAuthMismatch = p2pSourceNodeAuthMismatch(
    principal,
    parsed.data.source_node_id
  );
  if (sourceNodeAuthMismatch) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        ...p2pSourceNodeAuthBindingFields(principal),
        error: sourceNodeAuthMismatch.error,
        bound_source_node_id: sourceNodeAuthMismatch.bound_source_node_id,
        declared_source_node_id: parsed.data.source_node_id,
      },
      { status: 403 }
    );
  }

  try {
    const [sourceSeed, targetSeed] = await Promise.all([
      loadNodeCandidateSet(ownerKey, parsed.data.source_node_id),
      loadNodeCandidateSet(ownerKey, parsed.data.target_node_id),
    ]);
    const session = createRendezvousSession(
      {
        ...parsed.data,
        owner_key: ownerKey,
      },
      {
        source: sourceSeed,
        target: targetSeed,
      }
    );
    await saveRendezvousSession(session);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "rendezvous_store_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
