// V23.5 W-5 — Tariq #14 pattern: severity chip.
//
// Extracted from `docs/MUSU_ARCHITECTURE_2026_05_18.html` (wiki/458) `.badge`
// + `.sev-*` blocks at lines 104–124. The prototype used two parallel systems
// (status badges `.badge.*` for active/planned/etc. and severity colours
// `.sev-strong` / `.sev-ok` / `.sev-weak` / `.sev-gap`). For Tariq #14
// "severity chip" we unify on a single `<SeverityBadge/>` API with four
// canonical levels (HIGH / MED / LOW / INFO).
//
// Hard constraint #2 (Accessibility): the severity text label is ALWAYS
//   visible — colour-blind users see the text first ("HIGH"), the colour
//   second. We also expose `aria-label` so screen readers announce
//   "severity HIGH" (or caller-supplied override text) explicitly. This is
//   intentional redundancy: text + colour + ARIA label.

import React from "react";

export type Severity = "HIGH" | "MED" | "LOW" | "INFO";

export interface SeverityBadgeProps {
  severity: Severity;
  /** Optional visible text override; defaults to the severity itself. */
  text?: string;
  /** Optional extra className appended to the root element. */
  className?: string;
}

const SEVERITY_ARIA: Record<Severity, string> = {
  HIGH: "severity HIGH",
  MED: "severity MEDIUM",
  LOW: "severity LOW",
  INFO: "severity INFO",
};

export function SeverityBadge({
  severity,
  text,
  className,
}: SeverityBadgeProps) {
  const rootClass = [
    "severity-badge",
    `severity-badge--${severity.toLowerCase()}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = text ?? severity;
  const ariaLabel = text
    ? `${SEVERITY_ARIA[severity]}: ${text}`
    : SEVERITY_ARIA[severity];
  return (
    <span className={rootClass} role="status" aria-label={ariaLabel}>
      {label}
    </span>
  );
}

export default SeverityBadge;
