// V23.5 W-5 — Tariq #14 pattern: TL;DR card.
//
// Extracted from `docs/MUSU_ARCHITECTURE_2026_05_18.html` (wiki/458) `.tldr` block
// at lines 70–79 / 255–263. The prototype used a fixed dark gradient + accent
// left border; this component generalises that to three semantic variants
// (info / success / warning) while keeping the same outer shape.
//
// Hard constraint #2 (Accessibility first): rendered as <aside role="note">
// so screen readers announce it as a side note rather than just an unlabelled
// region. The title is the accessible label.
//
// Hard constraint #4 (Self-contained): only CSS hook is `tldr-card` + variant
// modifier — styling lives in `musu-bee/src/styles/wiki-explainer.css`. No
// inline styles, no styled-components dep.

import React from "react";

export type TldrCardVariant = "info" | "success" | "warning";

export interface TldrCardProps {
  /** Heading shown at the top of the card. Defaults to "TL;DR". */
  title?: string;
  /** Card body. Typically <ol>/<ul> or a short paragraph. */
  children: React.ReactNode;
  /** Visual variant — selects the background/border colour pair. */
  variant?: TldrCardVariant;
  /** Optional extra className appended to the root element. */
  className?: string;
}

export function TldrCard({
  title = "TL;DR",
  children,
  variant = "info",
  className,
}: TldrCardProps) {
  const rootClass = [
    "tldr-card",
    `tldr-card--${variant}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <aside className={rootClass} role="note" aria-label={title}>
      <h3 className="tldr-card__title">{title}</h3>
      <div className="tldr-card__body">{children}</div>
    </aside>
  );
}

export default TldrCard;
