import { getBridgeUrl } from '../../../../lib/bridge-config';
// V23.5 C-3 — musu-bee proxy for cos-synthesis status.
//
// GET /api/cos-synthesis/status
//   → forwards to bridge GET /api/cos-synthesis/status
//
// Used by ProjectBriefing.tsx to decide whether to enable the "📝 Get AI
// synthesis" button (constraint (b) — explicit API key gate). Bridge
// returns `{enabled: bool, estimated_cost_usd: number}`.
//
// On bridge unavailability we return `{enabled: false, ...}` with status
// 200 so the UI stays in the safe "disabled" state — same end-user
// experience as the C-2 stub, no error toast.
import { NextResponse } from "next/server";

const BRIDGE_URL = (
  getBridgeUrl()
).replace(/\/+$/, "");

const STATUS_TIMEOUT_MS = 3_000; // status is read-only, should be snappy

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`${BRIDGE_URL}/api/cos-synthesis/status`, {
      signal: controller.signal,
      // Status changes only when the operator changes their env var, so a
      // short cache is safe and keeps button state snappy.
      cache: "no-store",
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({
      enabled: false,
      estimated_cost_usd: 0.2,
    }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    clearTimeout(timer);
    // Bridge offline → UI stays in disabled/safe state.
    return NextResponse.json(
      { enabled: false, estimated_cost_usd: 0.2 },
      { status: 200 },
    );
  }
}
