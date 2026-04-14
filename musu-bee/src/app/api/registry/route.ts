import { NextResponse } from "next/server";

const REGISTRY_BASE = (
  process.env.MUSU_REGISTRY_URL ?? "https://musu.pro"
).replace(/\/+$/, "");

const MUSU_TOKEN = process.env.MUSU_TOKEN ?? "";

export async function GET() {
  if (!MUSU_TOKEN) {
    return NextResponse.json({ nodes: [], token_configured: false });
  }
  try {
    const res = await fetch(`${REGISTRY_BASE}/api/v1/nodes`, {
      headers: { Authorization: `Bearer ${MUSU_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { nodes: [], token_configured: true, error: `registry_${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({ nodes: data, token_configured: true });
  } catch {
    return NextResponse.json(
      { nodes: [], token_configured: true, error: "registry_unavailable" },
      { status: 503 }
    );
  }
}
