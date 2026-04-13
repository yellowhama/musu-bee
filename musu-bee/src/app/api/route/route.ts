import { NextRequest, NextResponse } from "next/server";

const MUSU_PORT_URL = (process.env.MUSU_PORT_URL ?? "http://127.0.0.1:1355").replace(/\/+$/, "");

type HandoffRoutingDecision = {
  selected_host?: string;
  reason_code?: string;
  ingress_host?: string;
  resource_requirement?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      resource_requirement?: string;
      ingress_host?: string;
      metrics_max_age_ms?: number;
    };

    const payload = {
      ingress_host: body.ingress_host ?? "local",
      resource_requirement: body.resource_requirement ?? "general",
      metrics_max_age_ms: body.metrics_max_age_ms ?? 30_000,
    };

    const res = await fetch(`${MUSU_PORT_URL}/handoff/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { selected_host: "local", reason_code: "musu_port_unavailable" },
        { status: 200 }
      );
    }

    const decision = (await res.json()) as HandoffRoutingDecision;
    return NextResponse.json(decision);
  } catch {
    return NextResponse.json(
      { selected_host: "local", reason_code: "musu_port_unreachable" },
      { status: 200 }
    );
  }
}
