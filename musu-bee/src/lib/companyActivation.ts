import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CompanyScope, CompanyScopeInput } from "./companyScope";
import { resolveCompanyScope } from "./companyScope";
import type { CompanySetupState } from "./companySetup.shared";
import type { DefaultCompanyTemplate } from "./templates/defaultCompanyTemplate";
import { defaultCompanyTemplate } from "./templates/defaultCompanyTemplate";
import {
  probeControlPlaneSync,
  writeCompanyActivationToPaperclip,
  type ControlPlaneSyncState,
} from "./controlPlaneSync";

export interface CompanySyncEvent {
  eventId: string;
  mode: "apply" | "manual_sync";
  status: "ready" | "degraded" | "not_configured";
  message: string;
  endpoint: string | null;
  checkedAt: string;
  paperclipIssueId: string | null;
  paperclipCommentId: string | null;
}

export interface CompanyActivationState {
  companyId: string;
  companyName: string;
  templateKey: string;
  selectedProjects: string[];
  workspaceId: string;
  userKey: string;
  createdAt: string;
  updatedAt: string;
  paperclipIssueId: string | null;
  controlPlaneSync: ControlPlaneSyncState;
  syncHistory: CompanySyncEvent[];
}

export interface CompanyRegistryState {
  workspaceId: string;
  userKey: string;
  activeCompanyId: string | null;
  companies: CompanyActivationState[];
  updatedAt: string;
}

function shouldUseKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

function getKvKey(scope: CompanyScope) {
  return `musu:company-registry:${scope.scopeKey}`;
}

function getStateFilePath(scope: CompanyScope) {
  return path.join(
    process.cwd(),
    "data",
    "company-registries",
    `${scope.scopeKey}.json`
  ) as string;
}

function normalizeSyncEvent(value: unknown): CompanySyncEvent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.eventId !== "string" ||
    typeof record.mode !== "string" ||
    typeof record.message !== "string" ||
    typeof record.checkedAt !== "string"
  ) {
    return null;
  }
  return {
    eventId: record.eventId,
    mode: record.mode === "manual_sync" ? "manual_sync" : "apply",
    status:
      record.status === "ready" || record.status === "degraded" || record.status === "not_configured"
        ? record.status
        : "not_configured",
    message: record.message,
    endpoint: typeof record.endpoint === "string" ? record.endpoint : null,
    checkedAt: record.checkedAt,
    paperclipIssueId:
      typeof record.paperclipIssueId === "string" ? record.paperclipIssueId : null,
    paperclipCommentId:
      typeof record.paperclipCommentId === "string" ? record.paperclipCommentId : null,
  };
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
  const syncHistory = Array.isArray(record.syncHistory)
    ? record.syncHistory
        .map((entry) => normalizeSyncEvent(entry))
        .filter((entry): entry is CompanySyncEvent => entry !== null)
    : [];

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
    paperclipIssueId:
      typeof record.paperclipIssueId === "string" && record.paperclipIssueId.length > 0
        ? record.paperclipIssueId
        : null,
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
    syncHistory,
  };
}

function buildEmptyRegistry(scope: CompanyScope): CompanyRegistryState {
  return {
    workspaceId: scope.workspaceId,
    userKey: scope.userKey,
    activeCompanyId: null,
    companies: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeRegistry(value: unknown, scope: CompanyScope): CompanyRegistryState {
  if (!value || typeof value !== "object") return buildEmptyRegistry(scope);
  const record = value as Record<string, unknown>;
  const companies = Array.isArray(record.companies)
    ? record.companies
        .map((entry) => normalizeActivation(entry, scope))
        .filter((entry): entry is CompanyActivationState => entry !== null)
    : [];

  const activeCompanyId =
    typeof record.activeCompanyId === "string" &&
    companies.some((company) => company.companyId === record.activeCompanyId)
      ? record.activeCompanyId
      : companies[0]?.companyId ?? null;

  return {
    workspaceId:
      typeof record.workspaceId === "string" && record.workspaceId.length > 0
        ? record.workspaceId
        : scope.workspaceId,
    userKey:
      typeof record.userKey === "string" && record.userKey.length > 0
        ? record.userKey
        : scope.userKey,
    activeCompanyId,
    companies,
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.length > 0
        ? record.updatedAt
        : new Date().toISOString(),
  };
}

function fileGet(scope: CompanyScope): CompanyRegistryState {
  try {
    const raw = fs.readFileSync(getStateFilePath(scope), "utf8");
    return normalizeRegistry(JSON.parse(raw), scope);
  } catch {
    return buildEmptyRegistry(scope);
  }
}

function fileSet(scope: CompanyScope, state: CompanyRegistryState): void {
  const stateFile = getStateFilePath(scope);
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(os.tmpdir(), `company-registry-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, stateFile);
}

async function kvGet(scope: CompanyScope): Promise<CompanyRegistryState> {
  const { kv } = await import("@vercel/kv");
  const stored = await kv.get<CompanyRegistryState>(getKvKey(scope));
  return normalizeRegistry(stored, scope);
}

async function kvSet(scope: CompanyScope, state: CompanyRegistryState): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(getKvKey(scope), state);
}

async function loadRegistry(scope: CompanyScope): Promise<CompanyRegistryState> {
  if (shouldUseKv()) return kvGet(scope);
  return fileGet(scope);
}

async function persistRegistry(scope: CompanyScope, state: CompanyRegistryState): Promise<void> {
  if (shouldUseKv()) {
    await kvSet(scope, state);
  } else {
    fileSet(scope, state);
  }
}

function appendSyncEvent(
  company: CompanyActivationState,
  event: CompanySyncEvent,
  nextSyncState: ControlPlaneSyncState,
  paperclipIssueId: string | null = company.paperclipIssueId
): CompanyActivationState {
  return {
    ...company,
    paperclipIssueId,
    updatedAt: event.checkedAt,
    controlPlaneSync: nextSyncState,
    syncHistory: [event, ...company.syncHistory].slice(0, 12),
  };
}

export async function getCompanyRegistry(
  scopeInput: CompanyScopeInput = {}
): Promise<CompanyRegistryState> {
  const scope = resolveCompanyScope(scopeInput);
  return loadRegistry(scope);
}

export async function getCompanyActivation(
  scopeInput: CompanyScopeInput = {}
): Promise<CompanyActivationState | null> {
  const registry = await getCompanyRegistry(scopeInput);
  return registry.companies.find((company) => company.companyId === registry.activeCompanyId) ?? null;
}

export async function applyCompanyActivation(
  setup: CompanySetupState,
  template: DefaultCompanyTemplate = defaultCompanyTemplate,
  scopeInput: CompanyScopeInput = {}
): Promise<{ registry: CompanyRegistryState; activation: CompanyActivationState }> {
  const scope = resolveCompanyScope(scopeInput);
  const registry = await loadRegistry(scope);
  const syncState = await probeControlPlaneSync();
  const checkedAt = syncState.checkedAt;
  const activation: CompanyActivationState = {
    companyId: randomUUID(),
    companyName: setup.companyName,
    templateKey: template.templateKey,
    selectedProjects: [...setup.selectedProjects],
    workspaceId: scope.workspaceId,
    userKey: scope.userKey,
    createdAt: checkedAt,
    updatedAt: checkedAt,
    paperclipIssueId: null,
    controlPlaneSync: syncState,
    syncHistory: [
      {
        eventId: randomUUID(),
        mode: "apply",
        status: syncState.status,
        message: syncState.message,
        endpoint: syncState.endpoint,
        checkedAt,
        paperclipIssueId: null,
        paperclipCommentId: null,
      },
    ],
  };

  const nextRegistry: CompanyRegistryState = {
    ...registry,
    workspaceId: scope.workspaceId,
    userKey: scope.userKey,
    activeCompanyId: activation.companyId,
    companies: [activation, ...registry.companies],
    updatedAt: checkedAt,
  };

  await persistRegistry(scope, nextRegistry);
  return { registry: nextRegistry, activation };
}

export async function setActiveCompany(
  companyId: string,
  scopeInput: CompanyScopeInput = {}
): Promise<CompanyRegistryState> {
  const scope = resolveCompanyScope(scopeInput);
  const registry = await loadRegistry(scope);
  if (!registry.companies.some((company) => company.companyId === companyId)) {
    throw new Error("Company not found.");
  }
  const nextRegistry = {
    ...registry,
    activeCompanyId: companyId,
    updatedAt: new Date().toISOString(),
  };
  await persistRegistry(scope, nextRegistry);
  return nextRegistry;
}

export async function deleteCompany(
  companyId: string,
  scopeInput: CompanyScopeInput = {}
): Promise<CompanyRegistryState> {
  const scope = resolveCompanyScope(scopeInput);
  const registry = await loadRegistry(scope);
  const companies = registry.companies.filter((company) => company.companyId !== companyId);
  const nextRegistry: CompanyRegistryState = {
    ...registry,
    companies,
    activeCompanyId:
      registry.activeCompanyId === companyId ? (companies[0]?.companyId ?? null) : registry.activeCompanyId,
    updatedAt: new Date().toISOString(),
  };
  await persistRegistry(scope, nextRegistry);
  return nextRegistry;
}

export async function syncCompanyActivation(
  companyId: string,
  scopeInput: CompanyScopeInput = {}
): Promise<{ registry: CompanyRegistryState; activation: CompanyActivationState }> {
  const scope = resolveCompanyScope(scopeInput);
  const registry = await loadRegistry(scope);
  const company = registry.companies.find((entry) => entry.companyId === companyId);
  if (!company) {
    throw new Error("Company not found.");
  }

  const syncResult = await writeCompanyActivationToPaperclip(company);
  const event: CompanySyncEvent = {
    eventId: randomUUID(),
    mode: "manual_sync",
    status: syncResult.status,
    message: syncResult.message,
    endpoint: syncResult.endpoint,
    checkedAt: syncResult.checkedAt,
    paperclipIssueId: syncResult.paperclipIssueId,
    paperclipCommentId: syncResult.paperclipCommentId,
  };

  const nextCompany = appendSyncEvent(
    company,
    event,
    {
      provider: "paperclip",
      status: syncResult.status,
      message: syncResult.message,
      endpoint: syncResult.endpoint,
      checkedAt: syncResult.checkedAt,
    },
    syncResult.paperclipIssueId ?? company.paperclipIssueId
  );

  const nextRegistry: CompanyRegistryState = {
    ...registry,
    companies: registry.companies.map((entry) =>
      entry.companyId === companyId ? nextCompany : entry
    ),
    updatedAt: syncResult.checkedAt,
  };

  await persistRegistry(scope, nextRegistry);
  return { registry: nextRegistry, activation: nextCompany };
}
