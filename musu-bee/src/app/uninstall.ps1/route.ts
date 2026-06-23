import { NextResponse } from "next/server";
import { DESKTOP_UNINSTALL_SCRIPT_URL } from "@/lib/publicRelease";

// GET /uninstall.ps1 — serve the one-line uninstaller so users can run:
//     irm https://musu.pro/uninstall.ps1 | iex
// We proxy the canonical Uninstall-MUSU.ps1 from the GitHub release (single
// source of truth, kept in sync with the published cert/msix) rather than
// duplicating the script body here. text/plain so `irm` returns a string `iex`
// can run. No request input flows into the upstream URL (pinned constant only).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(DESKTOP_UNINSTALL_SCRIPT_URL, { cache: "no-store" });
    if (!res.ok) {
      return new NextResponse(
        `# MUSU uninstaller temporarily unavailable (upstream ${res.status}).\n` +
          `# Uninstall manually from Windows Settings → Apps, or see https://musu.pro/download\n`,
        { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    const script = await res.text();
    return new NextResponse(script, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(
      `# MUSU uninstaller fetch failed. Uninstall manually from Windows Settings → Apps, or see https://musu.pro/download\n`,
      { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
