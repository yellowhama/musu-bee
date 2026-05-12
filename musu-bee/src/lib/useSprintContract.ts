"use client";

import { useEffect, useState } from "react";

export interface SprintContract {
  id: string;
  task_id: string | null;
  task: string;
  scope: string[];
  out_of_scope: string[];
  acceptance_criteria: string[];
  done_definition: string;
  created_at: number;
}

interface UseSprintContractReturn {
  contract: SprintContract | null;
  loading: boolean;
  /** "none" when the bridge returned 404 (no contract was generated for
   * this task) — distinct from a network error, so the UI can show a
   * friendly "no contract yet" message. */
  status: "idle" | "loading" | "loaded" | "none" | "error";
  error: string | null;
}

/**
 * v15.3 — Fetch the sprint contract for a delegated task.
 *
 * Wraps GET /api/bridge/tasks/{taskId}/sprint-contract. Backend returns
 * 404 when no contract has been authored — that's not an error, it just
 * means the task hasn't gone through the CTO scoping step.
 *
 * `taskId === null` keeps the hook idle (used when the panel hasn't
 * picked a task yet). The bridge enforces UUID-36 format; passing a
 * malformed id returns 422 which surfaces here as an error.
 */
export function useSprintContract(taskId: string | null): UseSprintContractReturn {
  const [contract, setContract] = useState<SprintContract | null>(null);
  const [status, setStatus] = useState<UseSprintContractReturn["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setContract(null);
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    fetch(`/api/bridge/tasks/${taskId}/sprint-contract`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setContract(null);
          setStatus("none");
          return;
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const data: SprintContract = await r.json();
        setContract(data);
        setStatus("loaded");
      })
      .catch((e) => {
        if (cancelled) return;
        setContract(null);
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return {
    contract,
    loading: status === "loading",
    status,
    error,
  };
}
