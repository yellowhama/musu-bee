import { getBridgeUrl } from '../../../../lib/bridge-config';
// V23.5 C-3 — musu-bee proxy for cos-synthesis invocation.
//
// POST /api/cos-synthesis/[company_id]
//   → forwards to bridge POST /api/companies/{company_id}/cos-briefing-synthesize
//
// The bridge enforces the 4 hard constraints (see docs/V23_5_IMPL_PLAN
// _2026_05_19.md §4). This proxy only:
//   • normalises company_id (URL-encoded path)
//   • passes through the 503 api_key_not_configured envelope so the UI
//     can show "configure your API key" without breaking constraint (a)
//   • degrades to 503 + degraded=true on bridge-unavailable so the
//     frontend always receives a structured envelope
//
// Cost preview (constraint c) is owned by the frontend onClick handler +
// sessionStorage `cos_synthesis_cost_acked` flag — NOT by this proxy.
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";
import { getBridgeToken } from "@/lib/bridge-token";

// Synthesis can take several seconds; match the bridge's internal 8s
// per-request budget with a small buffer for network/overhead.
const SYNTH_TIMEOUT_MS = 15_000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ company_id: string }> },
) {
  const { company_id } = await params;
  if (!company_id || company_id.length === 0) {
    return NextResponse.json(
      { error: "company_id_required" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNTH_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${getBridgeUrl().replace(/\/+$/, "")}/api/companies/${encodeURIComponent(company_id)}/cos-briefing-synthesize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildBridgeHeaders(await getBridgeToken()),
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    // Pass the bridge body through verbatim. Bridge always returns a
    // structured envelope: {synthesis, source_pages, degraded,
    // degrade_reason?, duration_ms?} or {detail, ...} for 503.
    const data = await upstream.json().catch(() => ({
      synthesis: null,
      source_pages: [],
      degraded: true,
      degrade_reason: "bridge_invalid_json",
    }));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    clearTimeout(timer);
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "bridge_timeout"
        : "bridge_unavailable";
    // Constraint (a): always return a structured degrade envelope so the
    // UI can fall back to the C-1 card list without special-casing this
    // error.
    return NextResponse.json(
      {
        synthesis: null,
        source_pages: [],
        degraded: true,
        degrade_reason: reason,
      },
      { status: 503 },
    );
  }
}
