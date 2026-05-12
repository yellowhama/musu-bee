"use client";

import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useCallback } from "react";
import CompanyCard from "./CompanyCard";
import { useCompaniesCanvasData } from "./useCompaniesCanvasData";

export interface CanvasInnerProps {
  companyId: string | null;
  onTriggerOnboarding?: () => void;
}

/**
 * tldraw mount + company-card overlay.
 *
 * Sub-cycles C (node colors), D (edges), E (zoom), F (empty state)
 * extend the overlay layer.
 */
export default function CanvasInner({
  companyId,
  onTriggerOnboarding,
}: CanvasInnerProps) {
  void companyId;
  void onTriggerOnboarding;

  const { cards, layout, loading, error } = useCompaniesCanvasData();

  const handleMount = useCallback((editor: Editor) => {
    editor.updateInstanceState({ isReadonly: false, isGridMode: true });
  }, []);

  return (
    <>
      <Tldraw
        onMount={handleMount}
        components={{
          ContextMenu: null,
          ActionsMenu: null,
          HelpMenu: null,
          DebugMenu: null,
          SharePanel: null,
          StylePanel: null,
          MainMenu: null,
          NavigationPanel: null,
          Toolbar: null,
          PageMenu: null,
          ZoomMenu: null,
        }}
      />
      <div className="canvas-card-layer">
        {cards.map((c) => {
          const pos = layout[c.companyId];
          if (!pos) return null;
          return (
            <CompanyCard
              key={c.companyId}
              data={c}
              style={{ left: pos.left, top: pos.top }}
            />
          );
        })}
        {!loading && cards.length === 0 ? (
          <div className="canvas-empty-overlay" role="note">
            <p>{error ? `Canvas offline: ${error}` : "No companies yet"}</p>
            <p className="canvas-empty-hint">v12-canvas F will land the onboarding trigger here.</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
