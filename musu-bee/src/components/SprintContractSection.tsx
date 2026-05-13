"use client";

import { useEffect, useState } from "react";
import { useSprintContract, type SprintContractEdit } from "@/lib/useSprintContract";

interface SprintContractSectionProps {
  /** Active task id (UUID-36). When null/empty, the section renders nothing. */
  taskId: string | null;
}

/**
 * v15.3 — Inline sprint-contract reader.
 * v16.C — Operator-edit mode.
 *
 * Renders the 5 sections of the contract negotiated by the CTO before
 * implementation (scope / out-of-scope / acceptance / done). When the
 * contract is unlocked, an "Edit" button lets the operator rewrite each
 * field. The save uses PUT — the server rejects with 409 if the Engineer
 * has already accepted the contract, at which point the UI flips
 * permanently to read-only with a notice.
 *
 * Lazy-fetches on mount via useSprintContract — TasksPanel only mounts
 * this when a row is expanded, so the network call doesn't happen for
 * collapsed rows.
 */
export default function SprintContractSection({ taskId }: SprintContractSectionProps) {
  const { contract, status, error, locked, save } = useSprintContract(taskId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SprintContractEdit | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // When the contract reloads (different task or external refresh), drop
  // any in-flight edit. Without this the UI would silently overwrite a
  // newer server state with stale local input.
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setSaveError(null);
  }, [contract?.id]);

  if (!taskId) return null;

  if (status === "loading") {
    return <p style={LABEL_STYLE}>Loading sprint contract…</p>;
  }

  if (status === "none") {
    return (
      <p style={{ ...LABEL_STYLE, color: "var(--fg4)" }}>
        No sprint contract yet — the CTO hasn&apos;t scoped this task.
      </p>
    );
  }

  if (status === "error") {
    return (
      <p style={{ ...LABEL_STYLE, color: "var(--status-error)" }}>
        Could not load sprint contract: {error}
      </p>
    );
  }

  if (!contract) return null;

  const startEdit = () => {
    setDraft({
      task: contract.task,
      scope: [...contract.scope],
      out_of_scope: [...contract.out_of_scope],
      acceptance_criteria: [...contract.acceptance_criteria],
      done_definition: contract.done_definition,
    });
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setSaveError(null);
  };

  const submitEdit = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    const result = await save(draft);
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      setDraft(null);
    } else if (result.error === "locked") {
      setSaveError("This contract was just locked by the Engineer. Your edits were not saved.");
      // The hook already refreshed contract — exit edit mode so the UI
      // shows the locked banner instead of stale inputs.
      setEditing(false);
      setDraft(null);
    } else {
      setSaveError(result.message ?? "Save failed");
    }
  };

  return (
    <div style={WRAP_STYLE}>
      <div style={HEADER_ROW_STYLE}>
        <p style={LABEL_STYLE}>SPRINT CONTRACT</p>
        {!editing && !locked && (
          <button
            type="button"
            onClick={startEdit}
            style={BUTTON_STYLE}
            aria-label="Edit sprint contract"
          >
            Edit
          </button>
        )}
      </div>

      {locked && (
        <p style={{ ...SUBLABEL_STYLE, color: "var(--status-warning, #d4a017)" }}>
          🔒 Engineer has accepted this contract — read-only.
        </p>
      )}

      {!editing ? (
        <>
          <Field label="Task" value={contract.task} mono />
          <BulletField label="Scope" items={contract.scope} />
          <BulletField label="Out of scope" items={contract.out_of_scope} />
          <BulletField label="Acceptance criteria" items={contract.acceptance_criteria} />
          {contract.done_definition ? (
            <Field label="Done when" value={contract.done_definition} />
          ) : null}
        </>
      ) : draft ? (
        <>
          <EditField
            label="Task"
            value={draft.task}
            onChange={(v) => setDraft({ ...draft, task: v })}
            mono
            singleLine
          />
          <EditList
            label="Scope"
            items={draft.scope}
            onChange={(items) => setDraft({ ...draft, scope: items })}
          />
          <EditList
            label="Out of scope"
            items={draft.out_of_scope}
            onChange={(items) => setDraft({ ...draft, out_of_scope: items })}
          />
          <EditList
            label="Acceptance criteria"
            items={draft.acceptance_criteria}
            onChange={(items) => setDraft({ ...draft, acceptance_criteria: items })}
          />
          <EditField
            label="Done when"
            value={draft.done_definition}
            onChange={(v) => setDraft({ ...draft, done_definition: v })}
          />

          {saveError && (
            <p
              style={{
                ...SUBLABEL_STYLE,
                color: "var(--status-error, #d04040)",
                marginTop: 8,
              }}
              role="alert"
            >
              {saveError}
            </p>
          )}

          <div style={ACTION_ROW_STYLE}>
            <button
              type="button"
              onClick={submitEdit}
              disabled={saving}
              style={{ ...BUTTON_STYLE, ...(saving ? BUTTON_DISABLED_STYLE : {}) }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              style={{ ...BUTTON_SECONDARY_STYLE, ...(saving ? BUTTON_DISABLED_STYLE : {}) }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Read-mode subviews ──────────────────────────────────────────────────────

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginTop: 8 }}>
      <p style={SUBLABEL_STYLE}>{label}</p>
      <p
        style={{
          fontSize: 12,
          color: "var(--fg2)",
          margin: 0,
          lineHeight: 1.5,
          fontFamily: mono ? "monospace" : undefined,
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function BulletField({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ marginTop: 8 }}>
        <p style={SUBLABEL_STYLE}>{label}</p>
        <p style={{ fontSize: 11, color: "var(--fg4)", margin: 0 }}>(none)</p>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <p style={SUBLABEL_STYLE}>{label}</p>
      <ul style={{ margin: 0, paddingLeft: 18, listStyleType: "'– '" }}>
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              fontSize: 12,
              color: "var(--fg2)",
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Edit-mode subviews ──────────────────────────────────────────────────────

function EditField({
  label,
  value,
  onChange,
  mono,
  singleLine,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  singleLine?: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <p style={SUBLABEL_STYLE}>{label}</p>
      {singleLine ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...INPUT_STYLE, fontFamily: mono ? "monospace" : undefined }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...INPUT_STYLE, fontFamily: mono ? "monospace" : undefined, minHeight: 60 }}
          rows={3}
        />
      )}
    </div>
  );
}

/** v16.C — list editor: one item per line. Trailing empty lines are
 * preserved while typing, then trimmed at save. */
function EditList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const text = items.join("\n");
  return (
    <div style={{ marginTop: 8 }}>
      <p style={SUBLABEL_STYLE}>
        {label}{" "}
        <span style={{ color: "var(--fg4)", fontWeight: "normal" }}>(one per line)</span>
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          const next = e.target.value.split("\n").map((s) => s.trimEnd());
          // Drop empty trailing lines on save, but allow them while typing.
          // We pass the raw list — submit handler can rely on the server
          // to ignore empty entries, but we trim here for cleanliness.
          onChange(next.filter((s, i) => s.length > 0 || i < next.length - 1));
        }}
        style={{ ...INPUT_STYLE, minHeight: 80 }}
        rows={4}
      />
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const WRAP_STYLE: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--musu-border-dim)",
};

const HEADER_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 4,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--fg3)",
  margin: "0 0 6px",
  fontFamily: "monospace",
  letterSpacing: "0.05em",
};

const SUBLABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--fg3)",
  margin: "0 0 3px",
  fontFamily: "monospace",
  letterSpacing: "0.05em",
};

const BUTTON_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "monospace",
  letterSpacing: "0.05em",
  padding: "2px 8px",
  background: "var(--musu-accent, #4a8a3a)",
  color: "var(--fg-on-accent, #fff)",
  border: "1px solid var(--musu-border-dim)",
  borderRadius: 2,
  cursor: "pointer",
};

const BUTTON_SECONDARY_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  background: "transparent",
  color: "var(--fg2)",
};

const BUTTON_DISABLED_STYLE: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const ACTION_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginTop: 10,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  fontFamily: "inherit",
  color: "var(--fg2)",
  background: "var(--bg-input, rgba(255,255,255,0.04))",
  border: "1px solid var(--musu-border-dim)",
  borderRadius: 2,
  padding: "4px 6px",
  lineHeight: 1.4,
  boxSizing: "border-box",
  resize: "vertical",
};
