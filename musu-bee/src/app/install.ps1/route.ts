import { NextResponse } from "next/server";
import { DESKTOP_INSTALL_SCRIPT_URL } from "@/lib/publicRelease";

// GET /install.ps1 — serve the one-line installer so users can run:
//     irm https://musu.pro/install.ps1 | iex
// We proxy the canonical Install-MUSU.ps1 from the GitHub release (single source
// of truth, kept in sync with the published cert/msix) rather than duplicating
// the script body here. text/plain so `irm` returns a string `iex` can run.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(DESKTOP_INSTALL_SCRIPT_URL, { cache: "no-store" });
    if (!res.ok) {
      return new NextResponse(
        `# MUSU installer temporarily unavailable (upstream ${res.status}).\n` +
          `# Download manually from https://musu.pro/download\n`,
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
      `# MUSU installer fetch failed. Download manually from https://musu.pro/download\n`,
      { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
