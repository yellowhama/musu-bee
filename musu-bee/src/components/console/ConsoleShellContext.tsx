"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface ConsoleShellContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  activeNode: string | null;
  setActiveNode: (v: string | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
}

const ConsoleShellContext = createContext<ConsoleShellContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  activeNode: null,
  setActiveNode: () => {},
  paletteOpen: false,
  setPaletteOpen: () => {},
});

export function ConsoleShellProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("musu_sidebar_v1");
    if (stored === "collapsed") setCollapsedState(true);
  }, []);

  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    localStorage.setItem("musu_sidebar_v1", v ? "collapsed" : "expanded");
  }

  return (
    <ConsoleShellContext.Provider
      value={{ collapsed, setCollapsed, activeNode, setActiveNode, paletteOpen, setPaletteOpen }}
    >
      {children}
    </ConsoleShellContext.Provider>
  );
}

export function useConsoleShell() {
  return useContext(ConsoleShellContext);
}
