// V23.5 W-4 — musu-bee proxy for musu-bridge `GET /api/wiki/page/{id}/html`.
//
// Mirrors the pattern in `src/app/api/workflows/[id]/route.ts`:
//   - Bridge URL from MUSU_BRIDGE_URL / NEXT_PUBLIC_BRIDGE_URL env (fallback :8070).
//   - Bridge auth via buildBridgeHeaders(MUSU_BRIDGE_TOKEN).
//   - Pass-through status + body; convert connection errors → 503 with a stable
//     JSON `{ detail: "bridge_unreachable" }` shape that the client parses.
//
// Why a proxy? agentWikiClient.ts (server component caller) hits this same
// origin, so we don't need to leak bridge URL/auth into the browser bundle
// (none of this code is reachable from client components — the page route is
// a server component — but keeping the proxy contract gives us a stable
// surface for future client-side fetches, e.g. wiki search auto-suggest).

import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

import { getBridgeUrl } from "@/lib/bridge-config";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    // Same guard as workflows proxy — reject path traversal early.
    if (!id || id.includes("..")) {
      return NextResponse.json({ detail: "invalid_id" }, { status: 400 });
    }
    const companyId = req.nextUrl.searchParams.get("company_id");

    // Note: bridge accepts `page_id:path` so slashes are allowed (folder
    // depth 1). encodeURIComponent would over-escape `/`; use encodeURI
    // segment-by-segment to preserve folder shape but still escape `?`/`#`.
    const safeId = id
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    const target = new URL(`${getBridgeUrl().replace(/\/+$/, "")}/api/wiki/page/${safeId}/html`);
    if (companyId) target.searchParams.set("company_id", companyId);

    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers: buildBridgeHeaders(await getBridgeToken()),
      cache: "no-store",
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "bridge_unreachable" },
      { status: 503 },
    );
  }
}
