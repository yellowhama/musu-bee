"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  Inbox,
  BookOpen,
  BarChart3,
  Settings,
  Server,
  SendHorizonal,
} from "lucide-react";
import { useConsoleShell } from "./ConsoleShellContext";
import type { RegistryNode } from "@/lib/types/node";

// ---- Types ----

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  action: () => void;
}

// ---- CommandPalette ----

interface CommandPaletteProps {
  nodes: RegistryNode[];
}

export function CommandPalette({ nodes }: CommandPaletteProps) {
  const { paletteOpen, setPaletteOpen, setActiveNode } = useConsoleShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Focus input when opened
  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [paletteOpen]);

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);

  // Navigation commands
  const navCommands: Command[] = [
    {
      id: "nav-home",
      label: "Go to Home",
      hint: "/home",
      icon: <Inbox size={14} />,
      action: () => { router.push("/home"); close(); },
    },
    {
      id: "nav-wiki",
      label: "Go to Wiki",
      hint: "/wiki",
      icon: <BookOpen size={14} />,
      action: () => { router.push("/wiki"); close(); },
    },
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      hint: "/fleet",
      icon: <BarChart3 size={14} />,
      action: () => { router.push("/fleet"); close(); },
    },
    {
      id: "nav-account",
      label: "Go to Account",
      hint: "/account",
      icon: <Settings size={14} />,
      action: () => { router.push("/account"); close(); },
    },
  ];

  // Node switch commands
  const nodeCommands: Command[] = nodes.map((n) => ({
    id: `node-${n.node_name}`,
    label: `Switch to ${n.node_name}`,
    hint: "node",
    icon: <Server size={14} />,
    action: () => {
      setActiveNode(n.node_name);
      router.push(`/fleet?node=${encodeURIComponent(n.node_name)}`);
      close();
    },
  }));

  // Task delegation: query starts with ">"
  const isDelegation = query.trim().startsWith(">");
  const delegationText = query.trim().slice(1).trim();

  const delegateCommand: Command | null = isDelegation && delegationText
    ? {
        id: "delegate",
        label: `Delegate: ${delegationText}`,
        hint: "send task",
        icon: <SendHorizonal size={14} />,
        action: () => {
          router.push(`/home?task=${encodeURIComponent(delegationText)}`);
          close();
        },
      }
    : null;

  // Build filtered list
  const allCommands = [...navCommands, ...nodeCommands];
  let filtered: Command[];
  if (isDelegation) {
    filtered = delegateCommand ? [delegateCommand] : [];
  } else if (!query.trim()) {
    filtered = allCommands;
  } else {
    const q = query.toLowerCase();
    filtered = allCommands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.hint ?? "").toLowerCase().includes(q)
    );
  }

  // Keyboard handling
  useEffect(() => {
    if (!paletteOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[activeIdx]?.action();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, filtered, activeIdx, close]);

  // Reset activeIdx on query change
  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!mounted || !paletteOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,0,0,0.55)",
          animation: "musu-palette-fade 150ms ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          width: "min(560px, calc(100vw - 32px))",
          background: "#261813",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          animation: "musu-palette-in 150ms ease",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 16px",
            height: "48px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <Search size={16} color="rgba(253,252,240,0.35)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search commands… or type ">" to delegate a task'
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "#FDFCF0",
              fontSize: "14px",
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              fontSize: "11px",
              color: "rgba(253,252,240,0.25)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "4px",
              padding: "1px 5px",
              fontFamily: "var(--font-jetbrains), monospace",
              flexShrink: 0,
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "360px", overflowY: "auto", padding: "6px" }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "rgba(253,252,240,0.3)",
                fontSize: "13px",
              }}
            >
              No results
            </div>
          )}
          {filtered.map((cmd, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={cmd.id}
                onClick={cmd.action}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  borderRadius: "7px",
                  border: "none",
                  background: isActive ? "rgba(255,209,102,0.1)" : "transparent",
                  color: isActive ? "#FFD166" : "rgba(253,252,240,0.7)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  transition: "background 80ms, color 80ms",
                }}
              >
                <span
                  style={{
                    color: isActive ? "#FFD166" : "rgba(253,252,240,0.3)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {cmd.icon}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cmd.label}
                </span>
                {cmd.hint && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "rgba(253,252,240,0.25)",
                      fontFamily: "var(--font-jetbrains), monospace",
                      flexShrink: 0,
                    }}
                  >
                    {cmd.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes musu-palette-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes musu-palette-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>,
    document.body
  );
}
