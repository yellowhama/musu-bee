import {
  resolveCompanyScope,
  type CompanyScope,
  type CompanyScopeInput,
} from "./companyScope";
import {
  defaultCompanyTemplate,
  type DefaultCompanyTemplate,
} from "./templates/defaultCompanyTemplate";

export interface CompanySetupState {
  companyName: string;
  templateKey: string;
  selectedProjects: string[];
  workspaceId: string;
  userKey: string;
  updatedAt: string;
}

const DEFAULT_COMPANY_NAME = "MUSU Workspace";

export function buildDefaultCompanySetupState(
  scope: CompanyScope = resolveCompanyScope(),
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): CompanySetupState {
  return {
    companyName: DEFAULT_COMPANY_NAME,
    templateKey: template.templateKey,
    selectedProjects: [...template.starterProjects],
    workspaceId: scope.workspaceId,
    userKey: scope.userKey,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeCompanySetupState(
  value: unknown,
  scope: CompanyScope = resolveCompanyScope(),
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): CompanySetupState {
  const fallback = buildDefaultCompanySetupState(scope, template);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;

  const companyName =
    typeof record.companyName === "string" && record.companyName.trim().length > 0
      ? record.companyName.trim()
      : fallback.companyName;

  const templateKey =
    typeof record.templateKey === "string" && record.templateKey.trim().length > 0
      ? record.templateKey.trim()
      : fallback.templateKey;

  const selectedProjects = Array.isArray(record.selectedProjects)
    ? record.selectedProjects.filter(
        (entry): entry is string =>
          typeof entry === "string" && template.starterProjects.includes(entry)
      )
    : fallback.selectedProjects;

  return {
    companyName,
    templateKey,
    selectedProjects: selectedProjects.length > 0 ? selectedProjects : fallback.selectedProjects,
    workspaceId:
      typeof record.workspaceId === "string" && record.workspaceId.trim().length > 0
        ? record.workspaceId
        : fallback.workspaceId,
    userKey:
      typeof record.userKey === "string" && record.userKey.trim().length > 0
        ? record.userKey
        : fallback.userKey,
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.trim().length > 0
        ? record.updatedAt
        : fallback.updatedAt,
  };
}

export function getDefaultCompanySetupState(
  template: DefaultCompanyTemplate = defaultCompanyTemplate,
  scopeInput: CompanyScopeInput = {}
): CompanySetupState {
  return buildDefaultCompanySetupState(resolveCompanyScope(scopeInput), template);
}
