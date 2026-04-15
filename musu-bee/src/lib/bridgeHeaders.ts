export function buildBridgeHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const trimmed = (token ?? "").trim();
  if (trimmed) headers.Authorization = `Bearer ${trimmed}`;
  return headers;
}
