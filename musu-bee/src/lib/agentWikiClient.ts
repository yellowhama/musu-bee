// V23.5 W-4 — agentWikiClient.ts
//
// Server-component fetch helper for the agent wiki page route
// (`src/app/app/wiki/agent/[page_id]/page.tsx`). Calls the musu-bee proxy
// route `/api/wiki/page/{id}/html` (NOT the bridge directly) so bridge
// auth + URL stay a single concern of the proxy layer — same pattern as
// `src/app/api/workflows/[id]/route.ts`.
//
// Pure parsing + URL helpers live in `agentWikiClient.shared.ts`
// (testable without `next/headers` / `server-only`). This module wraps
// those with the Next.js App Router header lookup needed to resolve the
// absolute origin from inside a server component.
//
// Error contract (matches W-3 § "Graceful 503 fallback"):
//   - 404                       → not-found (legitimate; surface to notFound())
//   - 503 markdown_lib_unavailable / wiki_path_read_only → render fallback card
//   - 0  network_error          → bridge / proxy unreachable
//   - any other non-2xx         → forward status + detail verbatim
//
// We intentionally do NOT cache (cache: "no-store"): wiki pages mutate
// out-of-band (LLM `/learn` writes) and the page route is server-rendered
// per request — re-fetching is cheap.

import "server-only";
import {
  buildWikiUrl,
  parseFetchResponse,
  type WikiFetchResult,
  type WikiHtmlResponse,
  type WikiFetchError,
} from "./agentWikiClient.shared";

export type { WikiHtmlResponse, WikiFetchError, WikiFetchResult };

export async function fetchAgentWikiPage(
  pageId: string,
  companyId?: string,
): Promise<WikiFetchResult> {
  // Resolve absolute origin from the inbound request headers — required
  // because server components don't have a baseURL the way browsers do.
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const url = buildWikiUrl(`${proto}://${host}`, pageId, companyId);

  try {
    const res = await fetch(url, { cache: "no-store" });
    return parseFetchResponse(res);
  } catch {
    return { ok: false, error: { status: 0, detail: "network_error" } };
  }
}
