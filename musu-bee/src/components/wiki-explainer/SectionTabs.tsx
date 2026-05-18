// V23.5 W-5 — Tariq #14 pattern: CSS-only section tabs.
//
// Extracted from `docs/MUSU_ARCHITECTURE_2026_05_18.html` (wiki/458) `.tabs`
// block at lines 156–183 / 405–460. The prototype used JS-driven
// `data-tab` buttons (`.tab-btn.active` toggling); for Tariq #14
// "self-contained + minimum JS" we re-shape this as a pure CSS-only
// pattern using radio inputs + `:checked ~ ...` sibling selectors. The
// component renders zero `onClick` handlers; tab switching is browser-
// native.
//
// Why radio + `:checked` (vs `<details>` group, vs ARIA tablist + JS):
//   - `<details>` is per-item collapsible, not a mutually-exclusive set.
//   - A real ARIA tablist needs keyboard arrow-key handlers (JS). Tariq
//     #14 explicitly avoids that.
//   - Radio inputs are mutually exclusive by group name and keyboard-
//     accessible by default (Tab to enter the group, Arrow to switch).
//
// Hard constraint #1 (CSS-only tabs): no useState, no handlers, no effects.
// Hard constraint #2 (Accessibility): each tab is a real radio input with
//   a labelled <label>; the active radio's :checked state drives both the
//   label highlight and content visibility via CSS sibling selectors in
//   wiki-explainer.css (`.section-tabs__radio:checked ~ ...`).
// Hard constraint: the radio `name` MUST be unique per instance so two
//   <SectionTabs/> on the same page don't share state. We use either a
//   caller-supplied `groupId` or React's `useId()`.

"use client";

import React, { useId } from "react";

export interface SectionTab {
  /** Stable id used in the DOM and `defaultActiveId`. */
  id: string;
  /** Tab button label. */
  label: string;
  /** Tab panel content. */
  content: React.ReactNode;
}

export interface SectionTabsProps {
  tabs: SectionTab[];
  /** Id of the tab to show by default. Falls back to the first tab. */
  defaultActiveId?: string;
  /** ARIA label for the surrounding tablist region. */
  ariaLabel?: string;
  /**
   * Optional explicit radio-group name. If omitted, a unique id is generated
   * via `useId()` so multiple <SectionTabs/> on the same page don't share
   * radio state.
   */
  groupId?: string;
  /** Optional extra className appended to the root element. */
  className?: string;
}

export function SectionTabs({
  tabs,
  defaultActiveId,
  ariaLabel = "Sections",
  groupId,
  className,
}: SectionTabsProps) {
  const autoId = useId();
  // useId returns a string containing colons in React 18+; sanitise to a value
  // safe for use as an HTML `name`/`id` (radio `name` accepts any string, but
  // the per-input `id` and label `htmlFor` should avoid colons for older
  // browsers).
  const safeAutoId = autoId.replace(/[^a-zA-Z0-9_-]/g, "");
  const name = groupId ?? `section-tabs-${safeAutoId}`;
  const activeId = defaultActiveId ?? tabs[0]?.id;
  const rootClass = ["section-tabs", className ?? ""].filter(Boolean).join(" ");

  if (tabs.length === 0) {
    return <div className={rootClass} aria-label={ariaLabel} />;
  }

  return (
    <div className={rootClass} role="region" aria-label={ariaLabel}>
      {/* Radio inputs: mutually exclusive, keyboard-friendly, no JS needed. */}
      {tabs.map((t) => (
        <input
          key={`r-${t.id}`}
          type="radio"
          name={name}
          id={`${name}-${t.id}`}
          className="section-tabs__radio"
          defaultChecked={t.id === activeId}
          data-tab-id={t.id}
        />
      ))}
      {/* Labels act as the visible tab buttons. */}
      <div className="section-tabs__buttons" role="tablist">
        {tabs.map((t) => (
          <label
            key={`l-${t.id}`}
            htmlFor={`${name}-${t.id}`}
            className="section-tabs__button"
            data-tab-id={t.id}
          >
            {t.label}
          </label>
        ))}
      </div>
      {/* Panels: visibility driven by `.section-tabs__radio:checked ~ ...`. */}
      <div className="section-tabs__panels">
        {tabs.map((t) => (
          <div
            key={`p-${t.id}`}
            className="section-tabs__panel"
            data-tab-id={t.id}
            role="tabpanel"
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SectionTabs;
