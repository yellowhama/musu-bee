import { randomUUID } from "node:crypto";

import type { CompanyScope, CompanyScopeInput } from "./companyScope";
import { resolveCompanyScope } from "./companyScope";
import type { CompanySetupState } from "./companySetup";
import type { DefaultCompanyTemplate } from "./templates/defaultCompanyTemplate";
import { defaultCompanyTemplate } from "./templates/defaultCompanyTemplate";
import { probeControlPlaneSync, type ControlPlaneSyncState } from "./controlPlaneSync";

export interface CompanyActivationState {
  companyId: string;
  companyName: string;
  templateKey: string;
  selectedProjects: string[];
  workspaceId: string;
  userKey: string;
  createdAt: string;
  updatedAt: string;
  controlPlaneSync: ControlPlaneSyncState;
}

function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

function getKvKey(scope: CompanyScope) {
  return `musu:company-activation:${scope.scopeKey}`;
}

function getStateFilePath(scope: CompanyScope) {
  return require("path").join(
    process.cwd(),
    "data",
    "company-activations",
    `${scope.scopeKey}.json`
  ) as string;
}

function normalizeActivation(
  value: unknown,
  scope: CompanyScope
): CompanyActivationState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.companyId !== "string" ||
    typeof record.companyName !== "string" ||
    !Array.isArray(record.selectedProjects) ||
    typeof record.templateKey !== "string"
  ) {
    return null;
  }

  const sync = record.controlPlaneSync as Record<string, unknown> | undefined;

  return {
    companyId: record.companyId,
    companyName: record.companyName,
    templateKey: record.templateKey,
    selectedProjects: record.selectedProjects.filter(
      (entry): entry is string => typeof entry === "string"
    ),
    workspaceId:
      typeof record.workspaceId === "string" && record.workspaceId.length > 0
        ? record.workspaceId
        : scope.workspaceId,
    userKey:
      typeof record.userKey === "string" && record.userKey.length > 0
        ? record.userKey
        : scope.userKey,
    createdAt:
      typeof record.createdAt === "string" && record.createdAt.length > 0
        ? record.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.length > 0
        ? record.updatedAt
        : new Date().toISOString(),
    controlPlaneSync: {
      provider: "paperclip",
      status:
        sync?.status === "ready" || sync?.status === "degraded" || sync?.status === "not_configured"
          ? sync.status
          : "not_configured",
      message: typeof sync?.message === "string" ? sync.message : "Paperclip sync not checked yet.",
      endpoint: typeof sync?.endpoint === "string" ? sync.endpoint : null,
      checkedAt: typeof sync?.checkedAt === "string" ? sync.checkedAt : new Date().toISOString(),
    },
  };
}

function fileGet(scope: CompanyScope): CompanyActivationState | null {
  const fs = require("fs") as typeof import("fs");
  try {
    const raw = fs.readFileSync(getStateFilePath(scope), "utf8");
    return normalizeActivation(JSON.parse(raw), scope);
  } catch {
    return null;
  }
}

function fileSet(scope: CompanyScope, state: CompanyActivationState): void {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const stateFile = getStateFilePath(scope);
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `company-activation-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, stateFile);
}

async function kvGet(scope: CompanyScope): Promise<CompanyActivationState | null> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<CompanyActivationState>(getKvKey(scope));
  return normalizeActivation(stored, scope);
}

async function kvSet(scope: CompanyScope, state: CompanyActivationState): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(getKvKey(scope), state);
}

export async function getCompanyActivation(
  scopeInput: CompanyScopeInput = {}
): Promise<CompanyActivationState | null> {
  const scope = resolveCompanyScope(scopeInput);
  if (useKv()) return kvGet(scope);
  return fileGet(scope);
}

export async function applyCompanyActivation(
  setup: CompanySetupState,
  template: DefaultCompanyTemplate = defaultCompanyTemplate,
  scopeInput: CompanyScopeInput = {}
): Promise<CompanyActivationState> {
  const scope = resolveCompanyScope(scopeInput);
  const existing = await getCompanyActivation(scope);
  const now = new Date().toISOString();
  const controlPlaneSync = await probeControlPlaneSync();
  const next: CompanyActivationState = {
    companyId: existing?.companyId ?? randomUUID(),
    companyName: setup.companyName,
    templateKey: template.templateKey,
    selectedProjects: [...setup.selectedProjects],
    workspaceId: scope.workspaceId,
    userKey: scope.userKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    controlPlaneSync,
  };

  if (useKv()) {
    await kvSet(scope, next);
  } else {
    fileSet(scope, next);
  }

  return next;
}
