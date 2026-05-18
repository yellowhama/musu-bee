// V23.4 Phase 4 T2-D-mini — Main workflow form client (wiki/435 v2 §4).
// Orchestration: name input, steps array state, add/remove/reorder, Save +
// Save-and-Run, agent_id duplicate detection. RunPanel mounts after save.
// Per Critic C7: Save-and-Run uses chained id (no React-state race).
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeWorkflow, type FormStep } from "@/lib/workflow-spec";
import StepRow from "./StepRow";
import RunPanel from "./RunPanel";

interface Props {
  companyId: string;
  initialName: string;
  initialSteps: FormStep[];
  initialWorkflowId: string | null;
}

function newReactKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `rk-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export default function WorkflowFormClient({
  companyId,
  initialName,
  initialSteps,
  initialWorkflowId,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState<FormStep[]>(initialSteps);
  const [savedId, setSavedId] = useState<string | null>(initialWorkflowId);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const duplicateAgentIds = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of steps) {
      const id = s.agent_id.trim();
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return new Set(Object.entries(counts).filter(([, n]) => n > 1).map(([k]) => k));
  }, [steps]);

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { reactKey: newReactKey(), agent_id: "", prompt: "", depends_on: [] },
    ]);
  };

  const updateStep = (idx: number, patch: Partial<FormStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => {
      const removed = prev[idx];
      const filtered = prev.filter((_, i) => i !== idx);
      // Clean references to the removed agent_id.
      return filtered.map((s) => ({
        ...s,
        depends_on: s.depends_on.filter((d) => d !== removed.agent_id),
      }));
    });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const onSave = async (): Promise<{ ok: boolean; id?: string }> => {
    setBusy(true);
    try {
      const body = encodeWorkflow(name, steps);
      const payload = { ...body, company_id: companyId };
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; detail?: string };
      if (res.status === 201 && json.id) {
        setSavedId(json.id);
        setToast({ kind: "ok", msg: "Workflow saved" });
        // Replace URL with real id so refresh works.
        router.replace(`/c/${companyId}/workflows/${json.id}/edit`);
        return { ok: true, id: json.id };
      }
      const detail = typeof json.detail === "string" ? json.detail : `HTTP ${res.status}`;
      setToast({ kind: "err", msg: `Save failed: ${detail}` });
      return { ok: false };
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof Error ? e.message : "save failed" });
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };

  const onRun = async (id?: string): Promise<void> => {
    const wfId = id ?? savedId;
    if (!wfId) {
      setToast({ kind: "err", msg: "Save workflow first" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/workflows/${wfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "running" }),
      });
      if (res.ok) {
        setToast({ kind: "ok", msg: "Running" });
      } else {
        const json = (await res.json().catch(() => ({}))) as { detail?: string };
        setToast({ kind: "err", msg: `Run failed: ${json.detail ?? `HTTP ${res.status}`}` });
      }
    } finally {
      setBusy(false);
    }
  };

  const onSaveAndRun = async (): Promise<void> => {
    const result = await onSave();
    if (result.ok) await onRun(result.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--fg2)" }}>Name</span>
        <input
          type="text"
          value={name}
          placeholder="Daily summary"
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "8px 12px",
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            color: "var(--fg1)",
          }}
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((s, i) => (
          <StepRow
            key={s.reactKey}
            step={s}
            rowIndex={i}
            totalRows={steps.length}
            otherStepAgentIds={steps
              .filter((_, j) => j !== i)
              .map((o) => o.agent_id.trim())
              .filter((id) => id.length > 0)}
            duplicateAgentId={
              s.agent_id.trim().length > 0 && duplicateAgentIds.has(s.agent_id.trim())
            }
            onChange={(patch) => updateStep(i, patch)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
            onRemove={() => removeStep(i)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addStep}
        style={{
          padding: "8px 12px",
          background: "var(--bg-card)",
          border: "1px dashed var(--border-default)",
          borderRadius: 8,
          color: "var(--fg2)",
          cursor: "pointer",
        }}
      >
        + Add step
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onSave} disabled={busy} data-testid="btn-save">
          Save
        </button>
        <button type="button" onClick={() => onRun()} disabled={busy || !savedId} data-testid="btn-run">
          Run
        </button>
        <button type="button" onClick={onSaveAndRun} disabled={busy} data-testid="btn-save-run">
          Save and Run
        </button>
      </div>

      {toast && (
        <div
          role={toast.kind === "err" ? "alert" : "status"}
          style={{
            padding: "8px 12px",
            background: "var(--bg-card)",
            border: `1px solid ${toast.kind === "err" ? "var(--status-error)" : "var(--status-online)"}`,
            borderRadius: 6,
            color: toast.kind === "err" ? "var(--status-error)" : "var(--status-online)",
            fontSize: 13,
          }}
        >
          {toast.msg}
        </div>
      )}

      {savedId && <RunPanel workflowId={savedId} />}
    </div>
  );
}
