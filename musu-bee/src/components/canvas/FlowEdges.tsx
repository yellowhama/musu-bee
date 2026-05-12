"use client";

import { useMemo } from "react";

interface EdgeForRender {
  from: string;
  to: string;
  thicknessPx: number;
  opacity: number;
}

export interface FlowEdgesProps {
  edges: EdgeForRender[];
  /** companyId → screen-space anchor point (card center). */
  anchors: Record<string, { x: number; y: number }>;
  /** Canvas viewport width × height in px. */
  width: number;
  height: number;
}

/**
 * v12-canvas D — SVG layer drawing arrows between company cards.
 *
 * The svg sits between the tldraw canvas and the company-card layer so
 * cards render on top of their own incoming/outgoing arrows.
 *
 * Each edge: a bezier-ish quadratic curve so two arrows between the
 * same pair don't overlap. Thickness and opacity come pre-computed.
 */
export default function FlowEdges({ edges, anchors, width, height }: FlowEdgesProps) {
  const paths = useMemo(() => {
    return edges
      .map((e) => {
        const a = anchors[e.from];
        const b = anchors[e.to];
        if (!a || !b) return null;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        // Pull the control point perpendicular to the line so the curve
        // is visible even when cards are roughly horizontal/vertical.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = 24;
        const cx = midX + (-dy / len) * offset;
        const cy = midY + (dx / len) * offset;
        return {
          key: `${e.from}->${e.to}`,
          d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
          thickness: e.thicknessPx,
          opacity: e.opacity,
        };
      })
      .filter((p): p is { key: string; d: string; thickness: number; opacity: number } => p !== null);
  }, [edges, anchors]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="canvas-flow-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--flow-edge, #94a3b8)" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="var(--flow-edge, #94a3b8)"
          strokeWidth={p.thickness}
          strokeOpacity={p.opacity}
          strokeLinecap="round"
          markerEnd="url(#flow-arrow)"
        />
      ))}
    </svg>
  );
}
