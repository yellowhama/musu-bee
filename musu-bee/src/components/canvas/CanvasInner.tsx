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
  flashCompanyIds?: string[];
  onFlashConsumed?: (companyId: string) => void;
  refreshKey?: number;
}

const FLASH_DURATION_MS = 1500;

export default function CanvasInner({
  companyId,
  onTriggerOnboarding,
  flashCompanyIds,
  onFlashConsumed,
  refreshKey,
}: CanvasInnerProps) {
  void companyId;

  const { cards, layout, loading, error, refresh } = useCompaniesCanvasData();

  // v14.2 — refetch immediately when AppShell bumps the key (e.g. after spawn).
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    refresh();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { edges } = useCompanyMessageFlow();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  const flashTimers = useRef<Map<string, number>>(new Map());

  // v12-inbox D — pick up new flash signals from the inbox hook.
  useEffect(() => {
    if (!flashCompanyIds || flashCompanyIds.length === 0) return;
    setFlashing((prev) => {
      const next = new Set(prev);
      for (const cid of flashCompanyIds) next.add(cid);
      return next;
    });
    for (const cid of flashCompanyIds) {
      const existing = flashTimers.current.get(cid);
      if (existing !== undefined) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        setFlashing((prev) => {
          if (!prev.has(cid)) return prev;
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
        flashTimers.current.delete(cid);
        onFlashConsumed?.(cid);
      }, FLASH_DURATION_MS);
      flashTimers.current.set(cid, timer);
    }
  }, [flashCompanyIds, onFlashConsumed]);

  // Cleanup on unmount.
  useEffect(() => {
    const timersRef = flashTimers;
    return () => {
      for (const t of timersRef.current.values()) window.clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

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
              flash={flashing.has(c.companyId)}
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
        {!loading && cards.length === 0 && !error ? (
          <button
            type="button"
            className="canvas-empty-trigger"
            onClick={() => onTriggerOnboarding?.()}
            disabled={!onTriggerOnboarding}
          >
            <span className="canvas-empty-trigger-icon" aria-hidden>+</span>
            <span className="canvas-empty-trigger-title">Start your first company</span>
            <span className="canvas-empty-trigger-hint">
              Give it a mission. Your CEO picks a template or designs a new one.
            </span>
          </button>
        ) : null}
        {!loading && cards.length > 0 && onTriggerOnboarding ? (
          // v14.2 — floating "+ New" button always available so the operator
          // can spin up another company without first emptying the canvas.
          <button
            type="button"
            className="canvas-new-trigger"
            onClick={() => onTriggerOnboarding()}
            title="Start a new company"
            aria-label="Start a new company"
          >
            +
          </button>
        ) : null}
        {!loading && error ? (
          <div className="canvas-error-card" role="alert">
            <span className="canvas-error-icon" aria-hidden>⚠</span>
            <span className="canvas-error-title">Canvas temporarily offline</span>
            <span className="canvas-error-detail">{error}</span>
            <button
              type="button"
              className="canvas-error-retry"
              onClick={() => refresh()}
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
