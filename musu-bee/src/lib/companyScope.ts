export interface CompanyScopeInput {
  workspaceId?: string | null;
  userKey?: string | null;
}

export interface CompanyScope {
  workspaceId: string;
  userKey: string;
  scopeKey: string;
}

export const DEFAULT_WORKSPACE_ID = "default-workspace";
export const DEFAULT_USER_KEY = "anonymous";

function sanitizeScopePart(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

export function resolveCompanyScope(input: CompanyScopeInput = {}): CompanyScope {
  const workspaceId = sanitizeScopePart(input.workspaceId, DEFAULT_WORKSPACE_ID);
  const userKey = sanitizeScopePart(input.userKey, DEFAULT_USER_KEY);
  return {
    workspaceId,
    userKey,
    scopeKey: `${workspaceId}__${userKey}`,
  };
}
