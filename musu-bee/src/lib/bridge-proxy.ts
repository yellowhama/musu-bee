import { NextResponse } from "next/server";

import { getBridgeUrl } from "@/lib/bridge-config";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

/**
 * Shared bridge-proxy helper, extracted from the catch-all
 * `app/api/bridge/[...path]/route.ts`. Individual proxy routes that today
 * hand-roll `fetch(bridgeUrl) → parse → NextResponse → 503-catch` can call
 * this instead.
 *
 * `parse` mode is an explicit option because the two existing conventions
 * differ in their error contract (security review finding):
 *  - `"text"` (catch-all default): `res.text()`, JSON-or-raw fallback. A
 *    malformed/HTML bridge response passes through as a raw string with the
 *    upstream status — never 503.
 *  - `"json"` (most dedicated routes): `res.json()`. A malformed upstream
 *    body throws → 503. Pick the mode that matches the route being migrated;
 *    do NOT silently flip a route's contract.
 */
export interface ProxyOptions {
  /** Bridge-side path, e.g. "/api/companies". Caller builds it (no 1:1 assumption). */
  targetPath: string;
  /** If set, only these query params are forwarded; otherwise all pass through. */
  allowedParams?: readonly string[];
  /** Response parse mode. Default "text" to match the catch-all's behavior. */
  parse?: "text" | "json";
  /** Cache mode for the upstream fetch. Default "no-store" (catch-all behavior). */
  cache?: "no-store" | "default";
  /** Error body message on the 503 fallback. Default "musu-bridge unavailable". */
  errorMessage?: string;
}

function bridgeBase(): string {
  return getBridgeUrl().replace(/\/+$/, "");
}

export async function proxyToBridge(
  req: Request,
  opts: ProxyOptions,
): Promise<NextResponse> {
  const parse = opts.parse ?? "text";
  const errorMessage = opts.errorMessage ?? "musu-bridge unavailable";
  try {
    const incoming = new URL(req.url);
    const target = new URL(`${bridgeBase()}${opts.targetPath}`);

    // Guard: keep the final URL within the expected API scope (catch-all parity).
    if (!target.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }

    incoming.searchParams.forEach((value, key) => {
      if (!opts.allowedParams || opts.allowedParams.includes(key)) {
        target.searchParams.set(key, value);
      }
    });

    const headers = buildBridgeHeaders(await getBridgeToken());
    const body =
      req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

    const res = await fetch(target.toString(), {
      method: req.method,
      headers,
      body,
      cache: opts.cache ?? "no-store",
    });

    if (parse === "json") {
      // Throws on malformed body → caught below → 503 (dedicated-route contract).
      const parsed = await res.json();
      return NextResponse.json(parsed, { status: res.status });
    }

    // text mode: JSON-or-raw fallback (catch-all contract).
    const data = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = data;
    }
    return NextResponse.json(parsed, { status: res.status });
  } catch {
    return NextResponse.json({ error: errorMessage }, { status: 503 });
  }
}
