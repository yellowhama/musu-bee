"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("musu-theme") as Theme) ?? "system";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem("musu-theme", next);
    applyTheme(next);
  }, []);

  return { theme, setTheme } as const;
}

/** Cycle: system → dark → light → system */
const CYCLE: Theme[] = ["system", "dark", "light"];

/** Compact theme toggle for the console top strip */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const next = () => {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  };

  const icon = !mounted
    ? "◐"
    : theme === "dark"
      ? "🌙"
      : theme === "light"
        ? "☀️"
        : "◐";

  const label = !mounted
    ? "Theme"
    : theme === "dark"
      ? "Dark"
      : theme === "light"
        ? "Light"
        : "System";

  return (
    <button
      id="theme-toggle"
      onClick={next}
      title={`Theme: ${label} — click to cycle`}
      aria-label={`Current theme: ${label}`}
      style={{
        background: "none",
        border: "1px solid var(--console-sidebar-border, rgba(255,255,255,0.07))",
        borderRadius: "5px",
        padding: "2px 7px",
        color: "var(--console-sidebar-text, rgba(253,251,247,0.7))",
        opacity: 0.6,
        fontSize: "13px",
        cursor: "pointer",
        lineHeight: "18px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        transition: "opacity 150ms, background 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.background = "var(--console-sidebar-hover, rgba(255,255,255,0.05))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "0.6";
        e.currentTarget.style.background = "none";
      }}
    >
      <span style={{ fontSize: "12px" }}>{icon}</span>
    </button>
  );
}
