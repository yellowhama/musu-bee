"use client";

import { useEffect, useState } from "react";
import type { RegistryNode } from "@/lib/types/node";
import { ConsoleShellProvider, useConsoleShell } from "./ConsoleShellContext";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleTopStrip } from "./ConsoleTopStrip";
import { ConsoleMobileTabBar } from "./ConsoleMobileTabBar";
import { CommandPalette } from "./CommandPalette";

type ViewMode = "mobile" | "tablet" | "desktop";

function useViewport(): ViewMode {
  const [mode, setMode] = useState<ViewMode>("desktop");
  useEffect(() => {
    function check() {
      const w = window.innerWidth;
      setMode(w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mode;
}

import type { InboxJumpTarget } from "@/components/inbox/InboxBell";
import type { UseInboxReturn } from "@/lib/useInbox";

interface ConsoleShellProps {
  user: { email: string; displayName: string | null; avatarUrl: string | null };
  nodes: RegistryNode[];
  children: React.ReactNode;
  contextPanel?: React.ReactNode;
  onNavigate?: (id: string) => void;
  activePanel?: string;
  /** v12-inbox B — shared inbox subscription from AppShell. */
  inbox?: UseInboxReturn;
  /** v12-inbox B — handler when a user clicks an inbox row. */
  onInboxJump?: (target: InboxJumpTarget) => void;
}

function ConsoleShellInner({
  user,
  nodes,
  children,
  contextPanel,
  onNavigate,
  activePanel,
  inbox,
  onInboxJump,
}: ConsoleShellProps) {
  const { collapsed, setCollapsed, setPaletteOpen } = useConsoleShell();
  const viewMode = useViewport();
  const isMobile = viewMode === "mobile";
  const isTablet = viewMode === "tablet";
  const sidebarWidth = isMobile ? 0 : isTablet ? 56 : collapsed ? 56 : 220;

  // Cmd+K / Ctrl+K global listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        const target = e.target as HTMLElement;
        if (target.matches("input, textarea, select, [contenteditable]")) return;
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  return (
    <>
      {/* Fixed sidebar — hidden on mobile */}
      {!isMobile && (
        <ConsoleSidebar contextPanel={contextPanel} onNavigate={onNavigate} activePanel={activePanel} />
      )}

      {/* Main content area — shifts with sidebar */}
      <div
        style={{
          position: "absolute",
          left: sidebarWidth,
          top: 0,
          right: 0,
          bottom: 0,
          transition: "left 200ms ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <ConsoleTopStrip
          user={user}
          nodes={nodes}
          sidebarCollapsed={collapsed}
          onToggleSidebar={() => setCollapsed(!collapsed)}
          inbox={inbox}
          onInboxJump={onInboxJump}
        />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            paddingBottom: isMobile ? 56 : 0,
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <ConsoleMobileTabBar />

      {/* Command palette — portals to document.body */}
      <CommandPalette nodes={nodes} />
    </>
  );
}

export function ConsoleShell(props: ConsoleShellProps) {
  return (
    <ConsoleShellProvider>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--console-sidebar-bg, #432c1c)",
          overflow: "hidden",
        }}
      >
        <ConsoleShellInner {...props}>{props.children}</ConsoleShellInner>
      </div>
    </ConsoleShellProvider>
  );
}
