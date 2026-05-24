"use client";

import { useState, useRef, useEffect } from "react";

export function UserAvatar({ email, displayName, avatarUrl, size = 28 }: { email?: string | null; displayName?: string | null; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
        referrerPolicy="no-referrer"
      />
    );
  }
  const initial = (displayName?.[0] ?? email?.[0] ?? "?").toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent)",
        color: "var(--fg-on-accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 700,
      }}
    >
      {initial}
    </div>
  );
}

interface UserMenuProps {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function UserMenu({ email, displayName, avatarUrl }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const label = displayName ?? email.split("@")[0];

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          borderRadius: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--fg1)",
        }}
      >
        <UserAvatar avatarUrl={avatarUrl} displayName={displayName} email={email} size={24} />
        <span style={{ fontSize: 13, color: "var(--fg2)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 50,
            marginTop: 8,
            minWidth: 180,
            borderRadius: 12,
            border: "1px solid rgba(255,166,2,0.2)",
            background: "var(--musu-color-brand-ink, var(--fg-on-accent))",
            padding: "4px 0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          <a
            href="/account"
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", fontSize: 13, color: "var(--fg2)", textDecoration: "none" }}
          >
            Account
          </a>
          <div style={{ margin: "4px 0", borderTop: "1px solid rgba(255,166,2,0.1)" }} />
          <button
            onClick={() => { /* sign out not available in musu-bee */ }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", fontSize: 13, color: "var(--fg2)", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
