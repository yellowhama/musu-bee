import { defaultCompanyTemplate, type DefaultCompanyTemplate } from "./templates/defaultCompanyTemplate";

export interface CompanySetupState {
  companyName: string;
  templateKey: string;
  selectedProjects: string[];
  updatedAt: string;
}

const KV_KEY = "musu:company-setup";
const DEFAULT_COMPANY_NAME = "MUSU Workspace";

function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

function getStateFilePath() {
  return require("path").join(process.cwd(), "data", "company-setup.json") as string;
}

function buildDefaultState(
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): CompanySetupState {
  return {
    companyName: DEFAULT_COMPANY_NAME,
    templateKey: template.templateKey,
    selectedProjects: [...template.starterProjects],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(
  value: unknown,
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): CompanySetupState {
  const fallback = buildDefaultState(template);
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
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.trim().length > 0
        ? record.updatedAt
        : fallback.updatedAt,
  };
}

function fileGet(): CompanySetupState {
  const fs = require("fs") as typeof import("fs");
  try {
    const raw = fs.readFileSync(getStateFilePath(), "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return buildDefaultState();
  }
}

function fileSet(state: CompanySetupState): void {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const stateFile = getStateFilePath();
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `company-setup-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, stateFile);
}

async function kvGet(): Promise<CompanySetupState> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<CompanySetupState>(KV_KEY);
  return stored ? normalizeState(stored) : buildDefaultState();
}

async function kvSet(state: CompanySetupState): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(KV_KEY, state);
}

export async function getCompanySetup(): Promise<CompanySetupState> {
  if (useKv()) return kvGet();
  return fileGet();
}

export async function saveCompanySetup(
  input: Partial<CompanySetupState>,
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): Promise<CompanySetupState> {
  const current = await getCompanySetup();
  const next = normalizeState(
    {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    },
    template
  );

  if (useKv()) {
    await kvSet(next);
  } else {
    fileSet(next);
  }
  return next;
}

export function getDefaultCompanySetupState(
  template: DefaultCompanyTemplate = defaultCompanyTemplate
): CompanySetupState {
  return buildDefaultState(template);
}
