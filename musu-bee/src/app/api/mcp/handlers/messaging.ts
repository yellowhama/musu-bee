import { MUSU_BRIDGE_URL } from "../config";

export async function handleSendMessage(params: Record<string, unknown>): Promise<unknown> {
  if (typeof params.channel !== "string" || typeof params.text !== "string") {
    return { error: "channel_and_text_required" };
  }
  const sender = typeof params.sender === "string" ? params.sender : "mcp";
  try {
    const res = await fetch(`${MUSU_BRIDGE_URL}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: params.channel,
        sender_id: sender,
        text: params.text,
      }),
    });
    if (!res.ok) return { error: `musu_bridge_http_${res.status}`, sent: false };
    const data = (await res.json()) as Record<string, unknown>;
    return { sent: true, channel: params.channel, response: data };
  } catch {
    return { error: "bridge_unavailable", sent: false };
  }
}
