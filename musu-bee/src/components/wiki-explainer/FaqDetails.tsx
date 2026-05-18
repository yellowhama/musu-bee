// V23.5 W-5 — Tariq #14 pattern: collapsible FAQ row.
//
// Extracted from `docs/MUSU_ARCHITECTURE_2026_05_18.html` (wiki/458) `details`
// block at lines 186–213. The prototype styled `<details>` + `<summary>` with
// a rotating `▶` glyph via `details[open] > summary::before { transform:
// rotate(90deg); }`. We preserve that contract — same root tag, same class
// hook — so the W-5 CSS can mirror the prototype 1:1.
//
// Why native <details> vs ARIA accordion + JS:
//   - <details> is keyboard accessible (Space/Enter toggles) without JS.
//   - State (open/closed) is owned by the DOM, so SSR + hydration is trivial.
//   - Tariq #14 explicitly favors minimal-JS, semantic HTML5.
//
// Hard constraint #2 (Accessibility): native <summary> announces as "summary,
//   collapsed/expanded" in screen readers without extra ARIA. We add no
//   redundant role/aria-expanded to avoid double-announcing.

import React from "react";

export interface FaqDetailsProps {
  /** Question shown in the always-visible <summary>. */
  question: string;
  /** Answer revealed when expanded. */
  children: React.ReactNode;
  /** Whether the row is open on first render. */
  defaultOpen?: boolean;
  /** Optional extra className appended to the root <details>. */
  className?: string;
}

export function FaqDetails({
  question,
  children,
  defaultOpen = false,
  className,
}: FaqDetailsProps) {
  const rootClass = ["faq-details", className ?? ""].filter(Boolean).join(" ");
  return (
    <details className={rootClass} open={defaultOpen || undefined}>
      <summary className="faq-details__summary">{question}</summary>
      <div className="faq-details__body">{children}</div>
    </details>
  );
}

export default FaqDetails;
