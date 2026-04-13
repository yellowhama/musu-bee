export function handleListChannels(): unknown {
  const channels = (process.env.MUSU_CHANNELS ?? "general,ceo,dev,ops")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return { channels };
}
