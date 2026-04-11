import type { CompanyActivationState } from "./companyActivation";

export type ControlPlaneSyncState = {
  provider: "paperclip";
  status: "ready" | "degraded" | "not_configured";
  message: string;
  endpoint: string | null;
  checkedAt: string;
};

export type ControlPlaneWritebackResult = ControlPlaneSyncState & {
  paperclipIssueId: string | null;
};

const DEFAULT_PAPERCLIP_API_BASE = "http://127.0.0.1:3100/api";

function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function normalizePaperclipApiBase(raw: string): string {
  const base = normalizeBase(raw);
  return base.endsWith("/api") ? base : `${base}/api`;
}

function getPaperclipApiBaseUrl(): string | null {
  const value =
    process.env.PAPERCLIP_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_PAPERCLIP_API_URL?.trim() ||
    "";
  if (!value) return null;
  return normalizePaperclipApiBase(value);
}

function getPaperclipCompanyId(): string | null {
  const value = process.env.PAPERCLIP_COMPANY_ID?.trim() || "";
  return value || null;
}

function buildHeaders(): HeadersInit {
  const apiKey = process.env.PAPERCLIP_API_KEY?.trim() || "";
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export async function probeControlPlaneSync(
  fetchImpl: typeof fetch = fetch
): Promise<ControlPlaneSyncState> {
  const checkedAt = new Date().toISOString();
  const baseUrl = getPaperclipApiBaseUrl();
  if (!baseUrl) {
    return {
      provider: "paperclip",
      status: "not_configured",
      message: "Paperclip API URL not configured.",
      endpoint: null,
      checkedAt,
    };
  }

  const endpoint = `${baseUrl}/health`;
  try {
    const res = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...buildHeaders(),
      },
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

export async function writeCompanyActivationToPaperclip(
  company: CompanyActivationState,
  fetchImpl: typeof fetch = fetch
): Promise<ControlPlaneWritebackResult> {
  const checkedAt = new Date().toISOString();
  const apiBase = getPaperclipApiBaseUrl() ?? normalizePaperclipApiBase(DEFAULT_PAPERCLIP_API_BASE);
  const paperclipCompanyId = getPaperclipCompanyId();

  if (!paperclipCompanyId) {
    return {
      provider: "paperclip",
      status: "not_configured",
      message: "PAPERCLIP_COMPANY_ID not configured.",
      endpoint: `${apiBase}/companies/{companyId}/issues`,
      checkedAt,
      paperclipIssueId: null,
    };
  }

  const issueEndpoint = `${apiBase}/companies/${encodeURIComponent(paperclipCompanyId)}/issues`;
  const commentEndpointBase = `${apiBase}/issues`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...buildHeaders(),
  };

  try {
    let issueId = company.paperclipIssueId;

    if (!issueId) {
      const createRes = await fetchImpl(issueEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `PRODUCT-SYNC: ${company.companyName}`,
          description: [
            `Product-origin company activation for ${company.companyName}.`,
            `Template: ${company.templateKey}`,
            `Projects: ${company.selectedProjects.join(", ")}`,
            `Scope: ${company.workspaceId}/${company.userKey}`,
          ].join("\n"),
          status: "todo",
          priority: "medium",
        }),
      });

      if (!createRes.ok) {
        return {
          provider: "paperclip",
          status: "degraded",
          message: `Paperclip issue create failed with HTTP ${createRes.status}.`,
          endpoint: issueEndpoint,
          checkedAt,
          paperclipIssueId: null,
        };
      }

      const created = (await createRes.json()) as { id?: string };
      issueId = typeof created.id === "string" ? created.id : null;
      if (!issueId) {
        return {
          provider: "paperclip",
          status: "degraded",
          message: "Paperclip issue create returned no issue id.",
          endpoint: issueEndpoint,
          checkedAt,
          paperclipIssueId: null,
        };
      }
    }

    const commentEndpoint = `${commentEndpointBase}/${encodeURIComponent(issueId)}/comments`;
    const commentRes = await fetchImpl(commentEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        body: [
          "Role: Product Sync",
          "Command: company activation writeback",
          `Artifact: companyId=${company.companyId}`,
          `Workspace: ${company.workspaceId}`,
          `User: ${company.userKey}`,
          `Projects: ${company.selectedProjects.join(", ")}`,
        ].join("\n"),
      }),
    });

    if (!commentRes.ok) {
      return {
        provider: "paperclip",
        status: "degraded",
        message: `Paperclip comment write failed with HTTP ${commentRes.status}.`,
        endpoint: commentEndpoint,
        checkedAt,
        paperclipIssueId: issueId,
      };
    }

    return {
      provider: "paperclip",
      status: "ready",
      message: `Paperclip writeback succeeded on issue ${issueId}.`,
      endpoint: commentEndpoint,
      checkedAt,
      paperclipIssueId: issueId,
    };
  } catch (error) {
    return {
      provider: "paperclip",
      status: "degraded",
      message:
        error instanceof Error ? error.message : "Paperclip writeback failed unexpectedly.",
      endpoint: issueEndpoint,
      checkedAt,
      paperclipIssueId: company.paperclipIssueId,
    };
  }
}
