"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Plus, X } from "lucide-react";

interface Company {
  id: string;
  name: string;
  created_at?: string;
}

interface Props {
  onlineNode: string | null;
}

export default function CompanySelector({ onlineNode }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!onlineNode) return;
    try {
      const [listRes, wsRes] = await Promise.all([
        fetch(`/api/bridge/companies?node=${encodeURIComponent(onlineNode)}`, { cache: "no-store" }),
        fetch(`/api/bridge/workspace?node=${encodeURIComponent(onlineNode)}`, { cache: "no-store" }),
      ]);
      if (listRes.ok) {
        const data = await listRes.json() as Company[];
        setCompanies(data);
        setLoadError(false);
        if (wsRes.ok) {
          const ws = await wsRes.json() as { active_company_id?: string };
          setActiveId(ws.active_company_id ?? data[0]?.id ?? "");
        } else {
          setActiveId((prev) => prev || data[0]?.id || "");
        }
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  }, [onlineNode]);

  useEffect(() => { void load(); }, [load]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function selectCompany(id: string) {
    if (!onlineNode) return;
    setActiveId(id);
    setOpen(false);
    try {
      await fetch(`/api/bridge/workspace?node=${encodeURIComponent(onlineNode)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_company_id: id }),
      });
    } catch {
      // non-critical — workspace preference saved on node, not required
    }
  }

  async function createCompany() {
    const name = newName.trim();
    if (!name || !onlineNode) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bridge/companies?node=${encodeURIComponent(onlineNode)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const created = await res.json() as Company;
        setCompanies((prev) => [...prev, created]);
        void selectCompany(created.id);
        setNewName("");
        setCreating(false);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!onlineNode || loadError || companies.length === 0) return null;

  const active = companies.find((c) => c.id === activeId);

  return (
    <div
      ref={dropdownRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        onClick={() => { setOpen((v) => !v); setCreating(false); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: "4px 10px 4px 8px",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(253,251,247,0.6)",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "border-color 0.15s",
        }}
      >
        <Building2 size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active?.name ?? "Workspace"}
        </span>
        <span style={{ opacity: 0.3, fontSize: "9px" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 200,
            background: "#261811",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {/* Company list */}
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => void selectCompany(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 12px",
                  background: c.id === activeId ? "rgba(255,166,2,0.07)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: c.id === activeId ? "var(--accent)" : "var(--fg1)",
                  fontSize: "12px",
                  fontWeight: c.id === activeId ? 700 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </span>
                {c.id === activeId && (
                  <span style={{ fontSize: "10px", opacity: 0.5, flexShrink: 0, marginLeft: 6 }}>active</span>
                )}
              </button>
            ))}
          </div>

          {/* Create new company */}
          {creating ? (
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createCompany();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Workspace name"
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "5px",
                    padding: "5px 8px",
                    color: "var(--fg1)",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => void createCompany()}
                  disabled={saving || !newName.trim()}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "5px",
                    border: "none",
                    background: "var(--accent)",
                    color: "var(--fg-on-accent)",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? "…" : "Create"}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(""); }}
                  style={{
                    padding: "5px",
                    borderRadius: "5px",
                    border: "none",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(253,251,247,0.4)",
                    cursor: "pointer",
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                width: "100%",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(253,251,247,0.4)",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Plus size={11} />
              New workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
