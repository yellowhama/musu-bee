import { defaultCompanyTemplate, type DefaultCompanyTemplate } from "./templates/defaultCompanyTemplate";
import {
  resolveCompanyScope,
  type CompanyScope,
  type CompanyScopeInput,
} from "./companyScope";

export interface CompanySetupState {
  companyName: string;
  templateKey: string;
  selectedProjects: string[];
  workspaceId: string;
  userKey: string;
  updatedAt: string;
}

const DEFAULT_COMPANY_NAME = "MUSU Workspace";

function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

function getKvKey(scope: CompanyScope) {
  return `musu:company-setup:${scope.scopeKey}`;
}

function getStateFilePath(scope: CompanyScope) {
  return require("path").join(
    process.cwd(),
    "data",
    "company-setups",
    `${scope.scopeKey}.json`
  ) as string;
}

function buildDefaultState(
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

function normalizeState(
  value: unknown,
  scope: CompanyScope = resolveCompanyScope(),
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): CompanySetupState {
  const fallback = buildDefaultState(scope, template);
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

function fileGet(scope: CompanyScope): CompanySetupState {
  const fs = require("fs") as typeof import("fs");
  try {
    const raw = fs.readFileSync(getStateFilePath(scope), "utf8");
    return normalizeState(JSON.parse(raw), scope);
  } catch {
    return buildDefaultState(scope);
  }
}

function fileSet(scope: CompanyScope, state: CompanySetupState): void {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const stateFile = getStateFilePath(scope);
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `company-setup-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, stateFile);
}

async function kvGet(scope: CompanyScope): Promise<CompanySetupState> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<CompanySetupState>(getKvKey(scope));
  return stored ? normalizeState(stored, scope) : buildDefaultState(scope);
}

async function kvSet(scope: CompanyScope, state: CompanySetupState): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(getKvKey(scope), state);
}

export async function getCompanySetup(scopeInput: CompanyScopeInput = {}): Promise<CompanySetupState> {
  const scope = resolveCompanyScope(scopeInput);
  if (useKv()) return kvGet(scope);
  return fileGet(scope);
}

export async function saveCompanySetup(
  input: Partial<CompanySetupState>,
  template: DefaultCompanyTemplate = defaultCompanyTemplate,
  scopeInput: CompanyScopeInput = {}
): Promise<CompanySetupState> {
  const scope = resolveCompanyScope(scopeInput);
  const current = await getCompanySetup(scope);
  const next = normalizeState(
    {
      ...current,
      ...input,
      workspaceId: scope.workspaceId,
      userKey: scope.userKey,
      updatedAt: new Date().toISOString(),
    },
    scope,
    template
  );

  if (useKv()) {
    await kvSet(scope, next);
  } else {
    fileSet(scope, next);
  }
  return next;
}

export function getDefaultCompanySetupState(
  template: DefaultCompanyTemplate = defaultCompanyTemplate,
  scopeInput: CompanyScopeInput = {}
): CompanySetupState {
  return buildDefaultState(resolveCompanyScope(scopeInput), template);
}
