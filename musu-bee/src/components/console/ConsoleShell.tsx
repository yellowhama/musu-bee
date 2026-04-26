"use client";

import { useEffect } from "react";
import type { RegistryNode } from "@/lib/types/node";
import { ConsoleShellProvider, useConsoleShell } from "./ConsoleShellContext";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleTopStrip } from "./ConsoleTopStrip";
import { ConsoleMobileTabBar } from "./ConsoleMobileTabBar";
import { CommandPalette } from "./CommandPalette";

interface ConsoleShellProps {
  user: { email: string; displayName: string | null; avatarUrl: string | null };
  nodes: RegistryNode[];
  children: React.ReactNode;
  contextPanel?: React.ReactNode;
  onNavigate?: (id: string) => void;
}

function ConsoleShellInner({ user, nodes, children, contextPanel, onNavigate }: ConsoleShellProps) {
  const { collapsed, setCollapsed, setPaletteOpen } = useConsoleShell();
  const sidebarWidth = collapsed ? 56 : 220;

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
      {/* Fixed sidebar */}
      <ConsoleSidebar contextPanel={contextPanel} onNavigate={onNavigate} />

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
        />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
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

export function ConsoleShell({ user, nodes, children, contextPanel, onNavigate }: ConsoleShellProps) {
  return (
    <ConsoleShellProvider>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#2D1D19",
          overflow: "hidden",
        }}
      >
        <ConsoleShellInner user={user} nodes={nodes} contextPanel={contextPanel} onNavigate={onNavigate}>
          {children}
        </ConsoleShellInner>
      </div>
    </ConsoleShellProvider>
  );
}
