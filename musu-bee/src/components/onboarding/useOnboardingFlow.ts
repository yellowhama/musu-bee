"use client";

import { useCallback, useEffect, useState } from "react";

export type OnboardingStep = 1 | 2 | 3 | 4;
export type AdapterType = "claude_local" | "codex_local" | "gemini_local";

export interface ProposedTemplate {
  slug: string;
  displayName: string;
  departments: Array<{
    name: string;
    role: string;
    agentCount: number;
    /** When this department joins ("day-1" | "month-1+" | "month-3+"). */
    phase: string;
  }>;
}

export interface OnboardingFlow {
  step: OnboardingStep;

  // Step 1
  companyName: string;
  mission: string;

  // Step 2
  adapter: AdapterType;
  nodeId: string | null;
  budgetCents: number;
  testStatus: "idle" | "checking" | "ok" | "fail";

  // Step 3
  decision: "pending" | "found" | "research" | null;
  foundTemplate: string | null;
  researchTaskId: string | null;
  proposedTemplate: ProposedTemplate | null;
  decisionError: string | null;

  // Step 4
  spawnStatus: "idle" | "spawning" | "ok" | "fail";
  spawnedCompanyId: string | null;
  spawnError: string | null;
}

const INITIAL_FLOW: OnboardingFlow = {
  step: 1,
  companyName: "",
  mission: "",
  adapter: "claude_local",
  nodeId: null,
  budgetCents: 2000,
  testStatus: "idle",
  decision: null,
  foundTemplate: null,
  researchTaskId: null,
  proposedTemplate: null,
  decisionError: null,
  spawnStatus: "idle",
  spawnedCompanyId: null,
  spawnError: null,
};

const DRAFT_KEY = "musu_company_onboarding_draft";

/**
 * v12-onboarding A — modal state machine for the 4-tab company-creation
 * flow.
 *
 * State persists to localStorage so closing the modal mid-way doesn't
 * lose what the operator typed. Cleared on successful spawn.
 *
 * Sub-cycle B fills in `requestDecision()` real logic. C/D fill `spawn()`.
 */
export function useOnboardingFlow() {
  const [flow, setFlow] = useState<OnboardingFlow>(() => {
    if (typeof window === "undefined") return INITIAL_FLOW;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return INITIAL_FLOW;
      const parsed = JSON.parse(raw);
      return { ...INITIAL_FLOW, ...parsed, spawnStatus: "idle", testStatus: "idle" };
    } catch {
      return INITIAL_FLOW;
    }
  });

  // Persist draft on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(flow));
    } catch {
      // localStorage full or unavailable — ignore.
    }
  }, [flow]);

  const setField = useCallback(<K extends keyof OnboardingFlow>(key: K, value: OnboardingFlow[K]) => {
    setFlow((prev) => ({ ...prev, [key]: value }));
  }, []);

  const next = useCallback(() => {
    setFlow((prev) => {
      const guards: Record<OnboardingStep, () => boolean> = {
        1: () => prev.companyName.trim().length > 0 && prev.mission.trim().length >= 10,
        2: () => !!prev.nodeId, // Test connection ok is preferred but not required in A.
        3: () => prev.decision === "found" || prev.proposedTemplate !== null,
        4: () => prev.spawnStatus === "ok",
      };
      if (!guards[prev.step]()) return prev;
      if (prev.step === 4) return prev;
      return { ...prev, step: (prev.step + 1) as OnboardingStep };
    });
  }, []);

  const back = useCallback(() => {
    setFlow((prev) => {
      if (prev.step === 1) return prev;
      return { ...prev, step: (prev.step - 1) as OnboardingStep };
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
    setFlow(INITIAL_FLOW);
  }, []);

  /**
   * v12-onboarding B — Ask bridge whether the mission matches a built-in
   * template, or whether research is needed. The bridge endpoint is
   * deterministic (token overlap), so this never blocks for long.
   */
  const requestDecision = useCallback(async () => {
    // Capture current draft inside the updater so the callback can stay
    // dependency-free (state is owned by setFlow's prev).
    let mission = "";
    let companyName = "";
    setFlow((prev) => {
      mission = prev.mission;
      companyName = prev.companyName;
      return { ...prev, decision: "pending", decisionError: null };
    });
    try {
      const r = await fetch("/api/bridge/companies/onboarding/template-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission, company_name: companyName }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: {
        decision: "found" | "research";
        template?: string;
        score?: number;
        preview?: { agents: Array<{ name: string; role: string }> };
        research_task_id?: string;
        estimated_seconds?: number;
      } = await r.json();
      if (data.decision === "found" && data.template) {
        setFlow((prev) => ({
          ...prev,
          decision: "found",
          foundTemplate: data.template ?? null,
        }));
      } else if (data.decision === "research" && data.research_task_id) {
        setFlow((prev) => ({
          ...prev,
          decision: "research",
          researchTaskId: data.research_task_id ?? null,
        }));
      } else {
        throw new Error("Invalid decision response");
      }
    } catch (e) {
      setFlow((prev) => ({
        ...prev,
        decision: null,
        decisionError: e instanceof Error ? e.message : String(e),
      }));
    }
  }, []);

  const spawn = useCallback(async () => {
    setFlow((prev) => ({ ...prev, spawnStatus: "spawning", spawnError: null }));
    // A stub. C/D wire the real /api/bridge/companies call.
    await new Promise((r) => setTimeout(r, 800));
    setFlow((prev) => ({
      ...prev,
      spawnStatus: "ok",
      spawnedCompanyId: `stub-${Date.now()}`,
    }));
  }, []);

  return { flow, setField, next, back, reset, requestDecision, spawn };
}
