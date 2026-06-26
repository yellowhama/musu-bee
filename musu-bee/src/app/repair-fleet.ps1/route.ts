import { NextResponse } from "next/server";
import { DESKTOP_REPAIR_FLEET_SCRIPT_URL } from "@/lib/publicRelease";

// GET /repair-fleet.ps1 — serve the one-line post-install fleet repair/check:
//     irm https://musu.pro/repair-fleet.ps1 | iex
// The script restarts the packaged bridge if needed, validates the advertised
// LAN-usable URL, and emits JSON evidence when called with -Json.
export const dynamic = "force-dynamic";

function textResponse(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET() {
  try {
    const res = await fetch(DESKTOP_REPAIR_FLEET_SCRIPT_URL, { cache: "no-store" });
    if (!res.ok) {
      return textResponse(
        `# MUSU fleet repair script temporarily unavailable (upstream ${res.status}).\n` +
          `# Install first with: irm https://musu.pro/install.ps1 | iex\n` +
          `# Then run: musu doctor --json; musu nodes --json\n`,
        502,
      );
    }

    const script = await res.text();
    if (!script.includes("musu.fleet_node_public_url_repair.v1")) {
      return textResponse(
        "# MUSU fleet repair script is temporarily unavailable.\n" +
          "# Hosted script does not expose the expected evidence schema.\n",
        409,
      );
    }
    if (!script.includes("ExpectedNodeName")) {
      return textResponse(
        "# MUSU fleet repair script is temporarily unavailable.\n" +
          "# Hosted script does not expose the expected node-name guard.\n",
        409,
      );
    }

    return new NextResponse(script, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return textResponse(
      "# MUSU fleet repair script fetch failed.\n" +
        "# Install first with: irm https://musu.pro/install.ps1 | iex\n" +
        "# Then run: musu doctor --json; musu nodes --json\n",
      502,
    );
  }
}

