// V23.4 Phase 4 T2-D-mini — Per-row step editor (wiki/435 v2 §2 file #8b).
// Critic C9 split. Renders agent_id input (regex-validated) + prompt textarea +
// depends_on checkboxes of OTHER steps' agent_ids + "Row N" label + ↑↓✕ buttons.
"use client";

import { AGENT_ID_REGEX, AGENT_ID_MAX, type FormStep } from "@/lib/workflow-spec";

interface Props {
  step: FormStep;
  rowIndex: number;
  totalRows: number;
  otherStepAgentIds: string[];
  duplicateAgentId: boolean;
  onChange: (next: Partial<FormStep>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

export default function StepRow({
  step,
  rowIndex,
  totalRows,
  otherStepAgentIds,
  duplicateAgentId,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  const rowLabel = `Row ${rowIndex + 1}`;
  const trimmed = step.agent_id.trim();
  const regexInvalid =
    trimmed.length > 0 && (trimmed.length > AGENT_ID_MAX || !AGENT_ID_REGEX.test(trimmed));
  const showError = duplicateAgentId || regexInvalid;
  const errorMsg = duplicateAgentId
    ? `duplicate agent: ${trimmed}`
    : regexInvalid
      ? "invalid agent_id (lowercase a-z, 0-9, hyphen; no leading/trailing hyphen)"
      : "";

  return (
    <div
      data-testid={`step-row-${rowIndex}`}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${showError ? "var(--status-error)" : "var(--border-default)"}`,
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 1 }}>
          {rowLabel}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            aria-label="Move row up"
            disabled={rowIndex === 0}
            onClick={onMoveUp}
            style={{ padding: "2px 8px" }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move row down"
            disabled={rowIndex === totalRows - 1}
            onClick={onMoveDown}
            style={{ padding: "2px 8px" }}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Delete row ${rowIndex + 1}`}
            onClick={onRemove}
            style={{ padding: "2px 8px", color: "var(--status-error)" }}
          >
            ✕
          </button>
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--fg2)" }}>Agent ID</span>
        <input
          type="text"
          value={step.agent_id}
          placeholder="e.g. writer"
          onChange={(e) => onChange({ agent_id: e.target.value })}
          style={{
            padding: "6px 10px",
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            color: "var(--fg1)",
            fontFamily: "monospace",
          }}
        />
        {showError && (
          <span role="alert" style={{ fontSize: 11, color: "var(--status-error)" }}>
            {errorMsg}
          </span>
        )}
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--fg2)" }}>Prompt</span>
        <textarea
          value={step.prompt}
          rows={3}
          onChange={(e) => onChange({ prompt: e.target.value })}
          style={{
            padding: "6px 10px",
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            color: "var(--fg1)",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </label>

      {otherStepAgentIds.length > 0 && (
        <fieldset
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <legend style={{ fontSize: 12, color: "var(--fg2)", padding: "0 4px" }}>
            Run after these steps
          </legend>
          {otherStepAgentIds.map((aid) => {
            const checked = step.depends_on.includes(aid);
            return (
              <label key={aid} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...step.depends_on, aid]
                      : step.depends_on.filter((d) => d !== aid);
                    onChange({ depends_on: next });
                  }}
                />
                <span style={{ fontFamily: "monospace" }}>{aid}</span>
              </label>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
