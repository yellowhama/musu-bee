"use client";

import { useSprintContract } from "@/lib/useSprintContract";

interface SprintContractSectionProps {
  /** Active task id (UUID-36). When null/empty, the section renders nothing. */
  taskId: string | null;
}

/**
 * v15.3 — Inline sprint-contract reader.
 *
 * Renders the 5 sections of the contract negotiated by the CTO before
 * implementation (scope / out-of-scope / acceptance / done). Read-only;
 * the write-side (UI to author/edit) is v16.
 *
 * Lazy-fetches on mount via useSprintContract — TasksPanel only mounts
 * this when a row is expanded, so the network call doesn't happen for
 * collapsed rows.
 */
export default function SprintContractSection({ taskId }: SprintContractSectionProps) {
  const { contract, status, error } = useSprintContract(taskId);

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

  return (
    <div style={WRAP_STYLE}>
      <p style={LABEL_STYLE}>SPRINT CONTRACT</p>

      <Field label="Task" value={contract.task} mono />

      <BulletField label="Scope" items={contract.scope} />
      <BulletField label="Out of scope" items={contract.out_of_scope} />
      <BulletField label="Acceptance criteria" items={contract.acceptance_criteria} />

      {contract.done_definition ? (
        <Field label="Done when" value={contract.done_definition} />
      ) : null}
    </div>
  );
}

// ── Subviews ────────────────────────────────────────────────────────────────

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

// ── Styles ──────────────────────────────────────────────────────────────────

const WRAP_STYLE: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--musu-border-dim)",
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
