import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { defaultCompanyTemplate, type DefaultCompanyTemplate } from "./templates/defaultCompanyTemplate";
import {
  resolveCompanyScope,
  type CompanyScope,
  type CompanyScopeInput,
} from "./companyScope";
import {
  buildDefaultCompanySetupState,
  normalizeCompanySetupState,
  type CompanySetupState,
} from "./companySetup.shared";

export type { CompanySetupState } from "./companySetup.shared";

function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

function getKvKey(scope: CompanyScope) {
  return `musu:company-setup:${scope.scopeKey}`;
}

function getStateFilePath(scope: CompanyScope) {
  return path.join(
    process.cwd(),
    "data",
    "company-setups",
    `${scope.scopeKey}.json`
  ) as string;
}

function fileGet(scope: CompanyScope): CompanySetupState {
  try {
    const raw = fs.readFileSync(getStateFilePath(scope), "utf8");
    return normalizeCompanySetupState(JSON.parse(raw), scope);
  } catch {
    return buildDefaultCompanySetupState(scope);
  }
}

function fileSet(scope: CompanyScope, state: CompanySetupState): void {
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
  return stored
    ? normalizeCompanySetupState(stored, scope)
    : buildDefaultCompanySetupState(scope);
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
  const next = normalizeCompanySetupState(
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
  return buildDefaultCompanySetupState(resolveCompanyScope(scopeInput), template);
}
