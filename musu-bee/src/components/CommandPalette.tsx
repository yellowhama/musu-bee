"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChannelId } from "@/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onChannelSelect: (id: ChannelId) => void;
  onInjectText: (text: string) => void;
}

type PaletteItem =
  | { kind: "channel"; id: ChannelId; label: string; icon: string }
  | { kind: "command"; label: string; value: string; icon: string };

const ITEMS: PaletteItem[] = [
  { kind: "channel", id: "ceo", label: "CEO", icon: "👔" },
  { kind: "channel", id: "cto", label: "CTO", icon: "🔧" },
  { kind: "channel", id: "engineer", label: "Engineer", icon: "💻" },
  { kind: "channel", id: "cos", label: "CoS", icon: "🗂" },
  { kind: "channel", id: "qa", label: "QA", icon: "🧪" },
  { kind: "channel", id: "worker", label: "Worker", icon: "⚙️" },
  { kind: "channel", id: "general", label: "General", icon: "#" },
  { kind: "channel", id: "dev", label: "Dev", icon: "🛠" },
  { kind: "channel", id: "tasks", label: "Tasks", icon: "📋" },
  { kind: "channel", id: "alerts", label: "Alerts", icon: "🔔" },
  { kind: "channel", id: "issues", label: "Issues", icon: "🐛" },
  { kind: "channel", id: "approvals", label: "Approvals", icon: "✅" },
  { kind: "channel", id: "projects", label: "Projects", icon: "🗂" },
  { kind: "channel", id: "goals", label: "Goals", icon: "🎯" },
  { kind: "channel", id: "costs", label: "Costs", icon: "💰" },
  { kind: "channel", id: "search", label: "Search Codebase", icon: "🔍" },
  { kind: "channel", id: "issues", label: "Go to Issues", icon: "🐛" },
  { kind: "channel", id: "approvals", label: "Go to Approvals", icon: "✅" },
  { kind: "channel", id: "projects", label: "Go to Projects", icon: "🗂" },
  { kind: "channel", id: "goals", label: "Go to Goals", icon: "🎯" },
  { kind: "command", label: "/task add", value: "/task add ", icon: "📌" },
  { kind: "command", label: "/approve", value: "/approve ", icon: "✓" },
  { kind: "command", label: "/reject", value: "/reject ", icon: "✗" },
  { kind: "command", label: "@route", value: "@route ", icon: "📡" },
  { kind: "command", label: "@wiki", value: "@wiki ", icon: "📚" },
  { kind: "command", label: "/run", value: "/run ", icon: "▶" },
];

export default function CommandPalette({
  open,
  onClose,
  onChannelSelect,
  onInjectText,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter items by query
  const filtered = query
    ? ITEMS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : ITEMS;

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[selectedIdx];
        if (!item) return;
        if (item.kind === "channel") {
          onChannelSelect(item.id);
        } else {
          onInjectText(item.value);
        }
        onClose();
      }
    },
    [filtered, selectedIdx, onChannelSelect, onInjectText, onClose]
  );

  const handleItemClick = useCallback(
    (item: PaletteItem) => {
      if (item.kind === "channel") {
        onChannelSelect(item.id);
      } else {
        onInjectText(item.value);
      }
      onClose();
    },
    [onChannelSelect, onInjectText, onClose]
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9998,
        }}
      />
      {/* Palette */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, 90vw)",
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search channels or commands..."
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid #2a2a2a",
            color: "#e5e7eb",
            fontSize: 15,
            padding: "14px 16px",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "12px 16px",
                fontSize: 13,
                color: "#6b7280",
                textAlign: "center",
              }}
            >
              No results
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={`${item.kind}-${item.kind === "channel" ? item.id : item.label}`}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => setSelectedIdx(idx)}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  background: idx === selectedIdx ? "#1e1e1e" : "transparent",
                  color: idx === selectedIdx ? "#f3f4f6" : "#9ca3af",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
