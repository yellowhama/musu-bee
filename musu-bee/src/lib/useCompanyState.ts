"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CompanyActivationState, CompanyRegistryState } from "@/lib/companyActivation";
import type { DefaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";
import { defaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";
import {
  getDefaultCompanySetupState,
  type CompanySetupState,
} from "@/lib/companySetup.shared";
import { resolveCompanyScopeFromClientContext } from "@/lib/companyScope";
import type { UserIdentity } from "@/lib/useAuth";

export interface UseCompanyStateReturn {
  companyTemplate: DefaultCompanyTemplate;
  companySetup: CompanySetupState;
  companyActivation: CompanyActivationState | null;
  companyRegistry: CompanyRegistryState | null;
  deviceLimit: number;
  workspaceId: string;
  activeCompany: CompanyActivationState | null;
  displayCompanyName: string;
  displaySelectedProjects: string[];
  handleSaveCompanySetup: (next: { companyName: string; selectedProjects: string[] }) => Promise<void>;
  handleApplyCompanyTemplate: (next: { companyName: string; selectedProjects: string[] }) => Promise<void>;
  handleSelectActiveCompany: (companyId: string) => Promise<void>;
  handleSyncCompany: (companyId: string) => Promise<void>;
  handleDeleteCompany: (companyId: string) => Promise<void>;
}

export function useCompanyState(userIdentity: UserIdentity): UseCompanyStateReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [companyTemplate, setCompanyTemplate] =
    useState<DefaultCompanyTemplate>(defaultCompanyTemplate);
  const [companySetup, setCompanySetup] = useState<CompanySetupState>(
    getDefaultCompanySetupState(defaultCompanyTemplate),
  );
  const [companyActivation, setCompanyActivation] = useState<CompanyActivationState | null>(null);
  const [companyRegistry, setCompanyRegistry] = useState<CompanyRegistryState | null>(null);
  const [deviceLimit, setDeviceLimit] = useState<number>(3);

  const safeSearchParams = searchParams ?? new URLSearchParams();
  const currentPathname = pathname ?? "/app";
  const workspaceHint =
    safeSearchParams.get("workspace") ?? safeSearchParams.get("workspaceId");
  const requestedCompanyId = safeSearchParams.get("company");

  const resolvedCompanyScope = useMemo(
    () =>
      resolveCompanyScopeFromClientContext({
        workspaceHint,
        pathname,
        userEmail: userIdentity.email,
        userId: userIdentity.id,
      }),
    [pathname, userIdentity.email, userIdentity.id, workspaceHint],
  );

  const workspaceId = resolvedCompanyScope.workspaceId;
  const userKey = resolvedCompanyScope.userKey;

  const companyScopeQuery = useMemo(
    () => new URLSearchParams({ workspaceId, userKey }).toString(),
    [userKey, workspaceId],
  );

  const syncRouteScope = useCallback(
    (next: { workspaceId?: string | null; companyId?: string | null }) => {
      const params = new URLSearchParams(safeSearchParams.toString());
      if (next.workspaceId) {
        params.set("workspace", next.workspaceId);
      } else {
        params.delete("workspace");
      }
      params.delete("workspaceId");
      if (next.companyId) {
        params.set("company", next.companyId);
      } else {
        params.delete("company");
      }
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${currentPathname}?${nextQuery}` : currentPathname, {
        scroll: false,
      });
    },
    [currentPathname, router, safeSearchParams],
  );

  // Company setup fetch
  useEffect(() => {
    fetch(`/api/company-setup?${companyScopeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CompanySetupState | null) => {
        if (data?.templateKey) setCompanySetup(data);
      })
      .catch(() => {});
  }, [companyScopeQuery]);

  // Company template fetch
  useEffect(() => {
    fetch("/api/company-template")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DefaultCompanyTemplate | null) => {
        if (data?.templateKey) setCompanyTemplate(data);
      })
      .catch(() => {});
  }, []);

  // Subscription device limit
  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { deviceLimit?: number } | null) => {
        if (data?.deviceLimit != null) setDeviceLimit(data.deviceLimit);
      })
      .catch(() => {});
  }, []);

  const refreshCompanyActivation = useCallback(async () => {
    const response = await fetch(`/api/company-activation?${companyScopeQuery}`);
    if (!response.ok) {
      setCompanyActivation(null);
      setCompanyRegistry(null);
      return;
    }
    const payload = (await response.json()) as {
      activation?: CompanyActivationState | null;
      registry?: CompanyRegistryState | null;
    };
    setCompanyActivation(payload.activation ?? null);
    setCompanyRegistry(payload.registry ?? null);
  }, [companyScopeQuery]);

  useEffect(() => {
    void refreshCompanyActivation().catch(() => {
      setCompanyActivation(null);
      setCompanyRegistry(null);
    });
  }, [refreshCompanyActivation]);

  // Sync URL when company registry changes
  useEffect(() => {
    if (!companyRegistry?.companies.length) return;

    if (requestedCompanyId) {
      if (companyRegistry.activeCompanyId === requestedCompanyId) return;
      if (companyRegistry.companies.some((c) => c.companyId === requestedCompanyId)) {
        void handleSelectActiveCompany(requestedCompanyId).catch(() => {});
      } else {
        syncRouteScope({ workspaceId, companyId: companyRegistry.activeCompanyId });
      }
      return;
    }

    syncRouteScope({ workspaceId, companyId: companyRegistry.activeCompanyId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyRegistry, requestedCompanyId, syncRouteScope, workspaceId]);

  const handleSaveCompanySetup = useCallback(
    async (next: { companyName: string; selectedProjects: string[] }) => {
      const res = await fetch(`/api/company-setup?${companyScopeQuery}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = (await res.json()) as CompanySetupState | { error?: string };
      if (!res.ok) {
        throw new Error(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Could not save company setup.",
        );
      }
      setCompanySetup(data as CompanySetupState);
    },
    [companyScopeQuery],
  );

  const handleApplyCompanyTemplate = useCallback(
    async (next: { companyName: string; selectedProjects: string[] }) => {
      await handleSaveCompanySetup(next);
      const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
        method: "POST",
      });
      const payload = (await res.json()) as
        | {
            activation?: CompanyActivationState | null;
            registry?: CompanyRegistryState | null;
            error?: string;
          }
        | null;
      if (!res.ok || !payload?.activation) {
        throw new Error(payload?.error ?? "Could not apply company template.");
      }
      setCompanyActivation(payload.activation);
      setCompanyRegistry(payload.registry ?? null);
      syncRouteScope({ workspaceId, companyId: payload.activation.companyId });
    },
    [companyScopeQuery, handleSaveCompanySetup, syncRouteScope, workspaceId],
  );

  const handleSelectActiveCompany = useCallback(
    async (companyId: string) => {
      const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", companyId }),
      });
      const payload = (await res.json()) as
        | {
            activation?: CompanyActivationState | null;
            registry?: CompanyRegistryState | null;
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not set active company.");
      }
      setCompanyActivation(payload?.activation ?? null);
      setCompanyRegistry(payload?.registry ?? null);
      syncRouteScope({
        workspaceId,
        companyId:
          payload?.activation?.companyId ?? payload?.registry?.activeCompanyId ?? null,
      });
    },
    [companyScopeQuery, syncRouteScope, workspaceId],
  );

  const handleSyncCompany = useCallback(
    async (companyId: string) => {
      const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", companyId }),
      });
      const payload = (await res.json()) as
        | {
            activation?: CompanyActivationState | null;
            registry?: CompanyRegistryState | null;
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not sync company.");
      }
      setCompanyActivation(payload?.activation ?? null);
      setCompanyRegistry(payload?.registry ?? null);
    },
    [companyScopeQuery],
  );

  const handleDeleteCompany = useCallback(
    async (companyId: string) => {
      const res = await fetch(
        `/api/company-activation?${companyScopeQuery}&companyId=${encodeURIComponent(companyId)}`,
        { method: "DELETE" },
      );
      const payload = (await res.json()) as
        | {
            activation?: CompanyActivationState | null;
            registry?: CompanyRegistryState | null;
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not delete company.");
      }
      setCompanyActivation(payload?.activation ?? null);
      setCompanyRegistry(payload?.registry ?? null);
      syncRouteScope({
        workspaceId,
        companyId: payload?.registry?.activeCompanyId ?? null,
      });
    },
    [companyScopeQuery, syncRouteScope, workspaceId],
  );

  const activeCompany =
    companyActivation ??
    companyRegistry?.companies.find(
      (c) => c.companyId === companyRegistry.activeCompanyId,
    ) ??
    null;
  const displayCompanyName = activeCompany?.companyName ?? companySetup.companyName;
  const displaySelectedProjects =
    activeCompany?.selectedProjects ?? companySetup.selectedProjects;

  return {
    companyTemplate,
    companySetup,
    companyActivation,
    companyRegistry,
    deviceLimit,
    workspaceId,
    activeCompany,
    displayCompanyName,
    displaySelectedProjects,
    handleSaveCompanySetup,
    handleApplyCompanyTemplate,
    handleSelectActiveCompany,
    handleSyncCompany,
    handleDeleteCompany,
  };
}
