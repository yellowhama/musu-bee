import { NextResponse } from "next/server";

import { PUBLIC_RELEASE_VERSION } from "@/lib/publicRelease";

export function GET() {
  return NextResponse.json(
    {
      schema: "musu.site_health.v1",
      ok: true,
      service: "musu.pro",
      version: PUBLIC_RELEASE_VERSION,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
