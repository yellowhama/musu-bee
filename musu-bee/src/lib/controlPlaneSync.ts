export type ControlPlaneSyncState = {
  provider: "paperclip";
  status: "ready" | "degraded" | "not_configured";
  message: string;
  endpoint: string | null;
  checkedAt: string;
};

function getPaperclipBaseUrl(): string | null {
  const value =
    process.env.PAPERCLIP_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_PAPERCLIP_API_URL?.trim() ||
    "";
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export async function probeControlPlaneSync(
  fetchImpl: typeof fetch = fetch
): Promise<ControlPlaneSyncState> {
  const checkedAt = new Date().toISOString();
  const baseUrl = getPaperclipBaseUrl();
  if (!baseUrl) {
    return {
      provider: "paperclip",
      status: "not_configured",
      message: "Paperclip API URL not configured.",
      endpoint: null,
      checkedAt,
    };
  }

  const endpoint = `${baseUrl}/api/health`;
  try {
    const res = await fetchImpl(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        provider: "paperclip",
        status: "degraded",
        message: `Paperclip health returned HTTP ${res.status}.`,
        endpoint,
        checkedAt,
      };
    }

    return {
      provider: "paperclip",
      status: "ready",
      message: "Paperclip health check succeeded.",
      endpoint,
      checkedAt,
    };
  } catch (error) {
    return {
      provider: "paperclip",
      status: "degraded",
      message:
        error instanceof Error ? error.message : "Paperclip health probe failed unexpectedly.",
      endpoint,
      checkedAt,
    };
  }
}
