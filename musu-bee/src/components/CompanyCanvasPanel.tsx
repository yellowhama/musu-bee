"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// tldraw is heavy (~1MB). Dynamic-import so the canvas only loads when
// this panel is actually opened. SSR off — tldraw needs window.
const CanvasInner = dynamic(() => import("./canvas/CanvasInner"), {
  ssr: false,
  loading: () => (
    <div className="canvas-loading">
      <div className="canvas-loading-spinner" />
      <p>Loading canvas…</p>
    </div>
  ),
});

export interface CompanyCanvasPanelProps {
  /** Effective company id from AppShell (active workspace's company). */
  companyId: string | null;
  /** Open OnboardingModal from AppShell (used when canvas is empty). */
  onTriggerOnboarding?: () => void;
  /** v12-inbox D — company ids that should yellow-ring flash. */
  flashCompanyIds?: string[];
  /** v12-inbox D — called after a flash animation finishes for a company. */
  onFlashConsumed?: (companyId: string) => void;
}

/**
 * v12-canvas — All-companies × All-nodes dashboard.
 *
 * The main MUSU view. Shows every company the operator runs as a card,
 * with each card carrying:
 *   - the company name + mission
 *   - its agents (working = pulse, idle = grey, blocked = red dot)
 *   - a node-color border showing which device(s) it runs on
 *
 * Edges between companies appear automatically when one company's agent
 * messages another (frequency = thickness, 24h silence = fade).
 *
 * Empty state (no companies) drops a "Start your first company" card
 * that fires `onTriggerOnboarding`.
 */
export default function CompanyCanvasPanel({
  companyId,
  onTriggerOnboarding,
  flashCompanyIds,
  onFlashConsumed,
}: CompanyCanvasPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="canvas-shell">
        <div className="canvas-loading">
          <div className="canvas-loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-shell">
      <CanvasInner
        companyId={companyId}
        onTriggerOnboarding={onTriggerOnboarding}
        flashCompanyIds={flashCompanyIds}
        onFlashConsumed={onFlashConsumed}
      />
      <div className="canvas-watermark" aria-hidden>
        Made with tldraw · MUSU
      </div>
    </div>
  );
}
