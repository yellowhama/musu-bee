export interface CompanyScopeInput {
  workspaceId?: string | null;
  userKey?: string | null;
}

export interface CompanyScopeClientContext {
  workspaceHint?: string | null;
  pathname?: string | null;
  userEmail?: string | null;
  userId?: string | null;
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

function extractWorkspaceFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = pathname.match(/\/workspaces\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function extractWorkspaceFromEmail(userEmail: string | null | undefined): string | null {
  if (!userEmail || !userEmail.includes("@")) return null;
  const [localPart, domain] = userEmail.split("@");
  if (!localPart || !domain) return null;
  return `${localPart}-${domain.replace(/\./g, "-")}`;
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

export function deriveWorkspaceIdFromClientContext(
  context: CompanyScopeClientContext = {}
): string {
  return sanitizeScopePart(
    context.workspaceHint ??
      extractWorkspaceFromPathname(context.pathname) ??
      extractWorkspaceFromEmail(context.userEmail),
    DEFAULT_WORKSPACE_ID
  );
}

export function deriveUserKeyFromClientContext(
  context: CompanyScopeClientContext = {}
): string {
  return sanitizeScopePart(context.userId ?? context.userEmail, DEFAULT_USER_KEY);
}

export function resolveCompanyScopeFromClientContext(
  context: CompanyScopeClientContext = {}
): CompanyScope {
  return resolveCompanyScope({
    workspaceId: deriveWorkspaceIdFromClientContext(context),
    userKey: deriveUserKeyFromClientContext(context),
  });
}
