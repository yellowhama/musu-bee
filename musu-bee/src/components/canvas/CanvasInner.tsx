"use client";

import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useCallback } from "react";

export interface CanvasInnerProps {
  companyId: string | null;
  onTriggerOnboarding?: () => void;
}

/**
 * tldraw mount + initial editor setup.
 *
 * Sub-cycles B (cards), C (node colors), D (edges), E (zoom), F (empty
 * state) will hook into the editor via this component.
 */
export default function CanvasInner({
  companyId,
  onTriggerOnboarding,
}: CanvasInnerProps) {
  void companyId;
  void onTriggerOnboarding;

  const handleMount = useCallback((editor: Editor) => {
    // Read-only by default until card/edge tools land in sub-cycle E.
    editor.updateInstanceState({ isReadonly: false, isGridMode: true });
  }, []);

  return (
    <Tldraw
      onMount={handleMount}
      // Hide non-canvas tools until v12-canvas E lands.
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
  );
}
