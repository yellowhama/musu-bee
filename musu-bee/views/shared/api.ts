import type { MusuConfig } from "./useMusuConfig";

export function authHeaders(config: MusuConfig): HeadersInit {
  return config.token ? { Authorization: `Bearer ${config.token}` } : {};
}

export async function fetchTasks(
  config: MusuConfig,
  params: Record<string, string | number>,
): Promise<unknown[]> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  const res = await fetch(`${config.bridgeUrl}/api/tasks?${qs}`, {
    headers: authHeaders(config),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : (data as { tasks?: unknown[] }).tasks ?? [];
}

export async function cancelTask(config: MusuConfig, taskId: string): Promise<void> {
  await fetch(`${config.bridgeUrl}/api/tasks/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(config),
  });
}

export function openTaskEvents(
  config: MusuConfig,
  onMessage: (data: unknown) => void,
  onError: () => void,
): EventSource {
  const url = `${config.bridgeUrl}/api/tasks/events${
    config.token ? `?token=${encodeURIComponent(config.token)}` : ""
  }`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data as string));
    } catch {
      // ignore
    }
  };
  es.onerror = () => {
    es.close();
    onError();
  };
  return es;
}
