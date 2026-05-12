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

  const { cards, layout, loading, error } = useCompaniesCanvasData();
  const { edges } = useCompanyMessageFlow();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [zoomedId, setZoomedId] = useState<string | null>(null);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ESC to leave zoom.
  useEffect(() => {
    if (!zoomedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomedId]);

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

  const handleCardClick = useCallback((id: string) => {
    setZoomedId((cur) => (cur === id ? null : id));
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
      <div className={`canvas-card-layer${zoomedId ? " zoomed" : ""}`} ref={overlayRef}>
        <FlowEdges edges={edges} anchors={anchors} width={viewport.width} height={viewport.height} />
        {cards.map((c) => {
          const pos = layout[c.companyId];
          if (!pos) return null;
          const isZoomed = zoomedId === c.companyId;
          const dimmed = zoomedId !== null && !isZoomed;
          return (
            <CompanyCard
              key={c.companyId}
              data={c}
              style={{
                left: pos.left,
                top: pos.top,
                opacity: dimmed ? 0.18 : 1,
                transform: isZoomed ? "scale(1.6)" : undefined,
                transformOrigin: "top left",
                zIndex: isZoomed ? 2 : 1,
                pointerEvents: dimmed ? "none" : "auto",
              }}
              onClick={handleCardClick}
            />
          );
        })}
        {zoomedId ? (
          <button
            type="button"
            className="canvas-zoom-exit"
            onClick={() => setZoomedId(null)}
            aria-label="Exit zoom (ESC)"
          >
            ESC ← Back to all companies
          </button>
        ) : null}
        {!loading && cards.length === 0 ? (
          <button
            type="button"
            className="canvas-empty-trigger"
            onClick={() => onTriggerOnboarding?.()}
            disabled={!onTriggerOnboarding}
          >
            <span className="canvas-empty-trigger-icon" aria-hidden>+</span>
            <span className="canvas-empty-trigger-title">Start your first company</span>
            <span className="canvas-empty-trigger-hint">
              {error
                ? `(canvas offline: ${error})`
                : "Give it a mission. Your CEO picks a template or designs a new one."}
            </span>
          </button>
        ) : null}
      </div>
    </>
  );
}
