"use client";

import { useCallback, useEffect, useState } from "react";

export interface SprintContract {
  id: string;
  task_id: string | null;
  task: string;
  scope: string[];
  out_of_scope: string[];
  acceptance_criteria: string[];
  done_definition: string;
  /** v16.C — true once the Engineer agent has accepted the contract.
   * Operator edits are refused (409) while locked. */
  locked: boolean;
  created_at: number;
}

/** v16.C — Fields the operator can edit. `task` is editable too — the
 * operator may want to rephrase the goal before the Engineer starts. */
export interface SprintContractEdit {
  task: string;
  scope: string[];
  out_of_scope: string[];
  acceptance_criteria: string[];
  done_definition: string;
}

export interface SaveResult {
  ok: boolean;
  /** Present when `ok=false`. "locked" maps to HTTP 409 from the bridge;
   * "not-found" to 404; "validation" to 422; otherwise "network". */
  error?: "locked" | "not-found" | "validation" | "network";
  message?: string;
}

interface UseSprintContractReturn {
  contract: SprintContract | null;
  loading: boolean;
  /** "none" when the bridge returned 404 (no contract was generated for
   * this task) — distinct from a network error, so the UI can show a
   * friendly "no contract yet" message. */
  status: "idle" | "loading" | "loaded" | "none" | "error";
  error: string | null;
  /** v16.C — derived from contract.locked. True when the Engineer has
   * accepted the contract; UI must disable edits. */
  locked: boolean;
  /** v16.C — operator-side update. Sends the full edited body to PUT
   * /api/bridge/tasks/{taskId}/sprint-contract. On success, updates local
   * state with the server's authoritative response. */
  save: (edit: SprintContractEdit) => Promise<SaveResult>;
}

/**
 * v15.3 — Fetch the sprint contract for a delegated task.
 * v16.C — Adds write-side: save() + locked flag.
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

  const save = useCallback(
    async (edit: SprintContractEdit): Promise<SaveResult> => {
      if (!taskId) {
        return { ok: false, error: "validation", message: "no task selected" };
      }
      try {
        const res = await fetch(`/api/bridge/tasks/${taskId}/sprint-contract`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edit),
        });
        if (res.status === 409) {
          // The contract was locked between load and save — sync local state
          // so the UI flips to read-only and reload the latest version.
          try {
            const fresh = await fetch(
              `/api/bridge/tasks/${taskId}/sprint-contract`
            );
            if (fresh.ok) {
              const data: SprintContract = await fresh.json();
              setContract(data);
            }
          } catch {
            // best-effort refresh — fall through with the error result
          }
          return { ok: false, error: "locked", message: "contract is locked" };
        }
        if (res.status === 404) {
          return { ok: false, error: "not-found", message: "no contract for this task" };
        }
        if (res.status === 422) {
          return { ok: false, error: "validation", message: "invalid input" };
        }
        if (!res.ok) {
          return {
            ok: false,
            error: "network",
            message: `HTTP ${res.status}`,
          };
        }
        const data: SprintContract = await res.json();
        setContract(data);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: "network",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
    [taskId]
  );

  return {
    contract,
    loading: status === "loading",
    status,
    error,
    locked: !!contract?.locked,
    save,
  };
}
