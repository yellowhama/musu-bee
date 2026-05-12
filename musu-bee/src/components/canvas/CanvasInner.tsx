"use client";

import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompanyCard from "./CompanyCard";
import FlowEdges from "./FlowEdges";
import { useCompaniesCanvasData } from "./useCompaniesCanvasData";
import { useCompanyMessageFlow } from "./useCompanyMessageFlow";

// Card dims used for anchor math. Keep in sync with .company-card CSS.
const CARD_W = 240;
// Approximate card height — varies with agent count. Use a fixed value
// for anchor math; the SVG arrows hit the card center, not its edge.
const CARD_H = 170;

export interface CanvasInnerProps {
  companyId: string | null;
  onTriggerOnboarding?: () => void;
}

export default function CanvasInner({
  companyId,
  onTriggerOnboarding,
}: CanvasInnerProps) {
  void companyId;
  void onTriggerOnboarding;

  const { cards, layout, loading, error } = useCompaniesCanvasData();
  const { edges } = useCompanyMessageFlow();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const anchors = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const c of cards) {
      const pos = layout[c.companyId];
      if (!pos) continue;
      out[c.companyId] = {
        x: pos.left + CARD_W / 2,
        y: pos.top + CARD_H / 2,
      };
    }
    return out;
  }, [cards, layout]);

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
      <div className="canvas-card-layer" ref={overlayRef}>
        <FlowEdges edges={edges} anchors={anchors} width={viewport.width} height={viewport.height} />
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
