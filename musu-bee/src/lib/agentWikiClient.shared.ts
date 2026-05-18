// V23.5 W-4 — agentWikiClient.shared.ts
//
// Pure, framework-free primitives for the agent wiki client. Separated from
// `agentWikiClient.ts` because that file imports `server-only` + `next/headers`
// (Next.js App Router server-component constraint), which prevents `node:test`
// from running it directly. Same pattern as `companySetup.shared.ts`.
//
// Contract:
//   WikiHtmlResponse  — TS mirror of musu-bridge's Pydantic model (W-3,
//                       `musu-bridge/wiki_routes.py`).
//   WikiFetchError    — { status, detail } for non-2xx responses.
//   parseFetchResponse — Response → WikiFetchResult (used by both the
//                       production client and tests).
//   buildWikiUrl       — Pure URL composition (origin + page_id + company_id).

export interface WikiHtmlResponse {
  page_id: string;
  title: string;
  html: string;
  source_markdown: string;
  scope: string; // "global" | "company:<id_truncated_8>"
  updated_at: string; // ISO 8601
}

export interface WikiFetchError {
  status: number;
  detail: string;
}

export type WikiFetchResult =
  | { ok: true; data: WikiHtmlResponse }
  | { ok: false; error: WikiFetchError };

export async function parseFetchResponse(
  res: Response,
): Promise<WikiFetchResult> {
  if (!res.ok) {
    let detail = "fetch_failed";
    try {
      const errBody = (await res.json()) as { detail?: unknown };
      if (typeof errBody?.detail === "string") detail = errBody.detail;
    } catch {
      /* non-JSON body — keep default detail */
    }
    return { ok: false, error: { status: res.status, detail } };
  }
  const data = (await res.json()) as WikiHtmlResponse;
  return { ok: true, data };
}

export function buildWikiUrl(
  origin: string,
  pageId: string,
  companyId?: string,
): string {
  const url = new URL(
    `${origin.replace(/\/+$/, "")}/api/wiki/page/${encodeURIComponent(pageId)}/html`,
  );
  if (companyId) url.searchParams.set("company_id", companyId);
  return url.toString();
}
