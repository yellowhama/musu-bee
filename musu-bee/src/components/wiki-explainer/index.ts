// V23.5 W-5 — wiki-explainer barrel.
//
// Consumers (W-4 wiki page renderer, future operator-shaped pages) should
// import from `@/components/wiki-explainer` rather than reaching into the
// individual files.
//
// CSS is intentionally NOT re-exported here: callers wire `wiki-explainer.css`
// into their layout once (e.g. `app/wiki/layout.tsx`) and then use the
// components anywhere underneath. Co-locating an import here would bundle the
// CSS at every call site instead of once per route, defeating Tariq #14
// "self-contained, opt-in" intent.

export { TldrCard } from "./TldrCard";
export type { TldrCardProps, TldrCardVariant } from "./TldrCard";

export { SectionTabs } from "./SectionTabs";
export type { SectionTabsProps, SectionTab } from "./SectionTabs";

export { FaqDetails } from "./FaqDetails";
export type { FaqDetailsProps } from "./FaqDetails";

export { SeverityBadge } from "./SeverityBadge";
export type { SeverityBadgeProps, Severity } from "./SeverityBadge";
