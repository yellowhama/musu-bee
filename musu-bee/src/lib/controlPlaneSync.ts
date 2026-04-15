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
  paperclipCommentId: string | null;
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
      paperclipCommentId: null,
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
          title: `MUSU PRODUCT SYNC: ${company.companyName} [${company.workspaceId}]`,
          description: [
            `MUSU company-registry writeback for ${company.companyName}.`,
            "",
            `surface=/app`,
            `sync_contract=company_registry_activation`,
            `workspace=${company.workspaceId}`,
            `user=${company.userKey}`,
            `template=${company.templateKey}`,
            `projects=${company.selectedProjects.join(", ")}`,
            `company_id=${company.companyId}`,
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
          paperclipCommentId: null,
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
          paperclipCommentId: null,
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
          "Command: musu company registry sync",
          `Artifact: companyId=${company.companyId} workspace=${company.workspaceId} activeProjects=${company.selectedProjects.length}`,
          "Product Surface: /app",
          "Sync Contract: company_registry_activation",
          `Company: ${company.companyName}`,
          `Workspace: ${company.workspaceId}`,
          `User: ${company.userKey}`,
          `Template: ${company.templateKey}`,
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
        paperclipCommentId: null,
      };
    }

    const comment = (await commentRes.json()) as { id?: string };

    return {
      provider: "paperclip",
      status: "ready",
      message: `Paperclip writeback succeeded on issue ${issueId}.`,
      endpoint: commentEndpoint,
      checkedAt,
      paperclipIssueId: issueId,
      paperclipCommentId: typeof comment.id === "string" ? comment.id : null,
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
      paperclipCommentId: null,
    };
  }
}
