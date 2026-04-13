import { NextRequest, NextResponse } from "next/server";

/** Parse delegation chain from agent response text.
 *  Detects patterns like "→ CTO", "CTO에게 위임", "delegating to engineer", etc.
 *  Returns e.g. ["CEO", "CTO"] or null if no delegation detected.
 */
function parseDelegationChain(
  sourceChannel: string,
  responseText: string,
): string[] | null {
  const upper = responseText.toLowerCase();
  const knownAgents = ["cto", "engineer", "qa", "cos", "worker", "vp"];

  const delegationKeywords = [
    /→\s*(\w+)/g,
    /delegat(?:e|ing|ed)\s+to\s+(\w+)/gi,
    /assign(?:ing|ed)?\s+to\s+(\w+)/gi,
    /(\w+)에게\s+(?:위임|할당)/g,
    /(\w+)(?:가|이)\s+담당/g,
  ];

  const found: string[] = [];
  for (const pattern of delegationKeywords) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(upper)) !== null) {
      const name = match[1]?.toLowerCase();
      if (name && knownAgents.includes(name) && !found.includes(name)) {
        found.push(name);
      }
    }
  }

  if (found.length === 0) return null;
  return [sourceChannel.toUpperCase(), ...found.map((n) => n.toUpperCase())];
}

const MUSU_BRIDGE_URL = (
  process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070"
).replace(/\/+$/, "");

const AGENT_ROUTE_TIMEOUT_MS = 300_000; // 5 min — matches claude_local default

export async function POST(req: NextRequest) {
  let body: { channel?: string; sender_id?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { channel, sender_id = "local-user", text } = body;

  if (!channel || !text?.trim()) {
    return NextResponse.json(
      { error: "channel and text are required" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_ROUTE_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${MUSU_BRIDGE_URL}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, sender_id, text: text.trim() }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "bridge_error", detail: errText },
        { status: upstream.status },
      );
    }

    const data = (await upstream.json()) as {
      response?: string;
      agent_id?: string;
      agent_name?: string;
      error?: string;
    };

    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 502 });
    }

    const responseText = data.response ?? "";
    const chain = parseDelegationChain(channel, responseText);

    return NextResponse.json({
      response: responseText,
      agent_id: data.agent_id ?? null,
      agent_name: data.agent_name ?? channel,
      chain,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "agent_timeout" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "bridge_unavailable", detail: String(err) },
      { status: 503 },
    );
  }
}
