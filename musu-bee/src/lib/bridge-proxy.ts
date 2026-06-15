import { NextResponse } from "next/server";

import { getBridgeUrl } from "@/lib/bridge-config";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";
import { authorizeP2pControl } from "@/lib/p2pControlAuth";

/**
 * Is the resolved bridge target on the local machine? The proxy attaches the
 * server's privileged bridge token to every forwarded request. When the bridge
 * is localhost (the desktop product: bridge runs on the same machine, not
 * reachable from outside), forwarding without caller auth is fine. But if the
 * bridge is a REMOTE address (a public deployment with MUSU_BRIDGE_URL pointing
 * at a reachable bridge), an unauthenticated proxy would let anyone drive that
 * bridge with the server's token — so in that case we require p2p control auth.
 */
function bridgeIsLocal(bridgeBaseUrl: string): boolean {
  try {
    const host = new URL(bridgeBaseUrl).hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    // Unparseable → treat as non-local and require auth (fail closed).
    return false;
  }
}

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
  /**
   * When true, a 204 upstream returns an empty `NextResponse(null, 204)` rather
   * than a JSON-wrapped empty body. Off by default to keep existing callers
   * byte-identical; routes that proxy DELETE/PATCH (which legitimately 204)
   * opt in.
   */
  emptyOn204?: boolean;
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
    const base = bridgeBase();

    // When the bridge is remote (public deployment), require caller auth before
    // forwarding with the server's bridge token. Local-bridge (desktop) traffic
    // is not reachable from outside, so it stays open to keep the app working.
    if (!bridgeIsLocal(base)) {
      // authorizeP2pControl only reads req.headers.get("authorization").
      const failedAuth = authorizeP2pControl(req as Parameters<typeof authorizeP2pControl>[0]);
      if (failedAuth) {
        return failedAuth;
      }
    }

    const incoming = new URL(req.url);
    const target = new URL(`${base}${opts.targetPath}`);

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

    if (opts.emptyOn204 && res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

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
