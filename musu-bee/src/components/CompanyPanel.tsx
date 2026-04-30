"use client";

import { useState, useEffect, useCallback } from "react";

interface Company {
  id: string;
  name: string;
  template_key: string;
  workspace_id: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface CompanyPanelProps {
  activeCompanyId?: string | null;
  onSelectCompany?: (id: string) => void;
}

export default function CompanyPanel({
  activeCompanyId,
  onSelectCompany,
}: CompanyPanelProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTemplate, setFormTemplate] = useState("default");

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = (await res.json()) as Company[];
        setCompanies(data);
      }
    } catch {
      // bridge unavailable — silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCompanies();
  }, [fetchCompanies]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          template_key: formTemplate,
          workspace_id: `ws-${Date.now()}`,
        }),
      });
      if (res.ok) {
        setFormName("");
        setFormTemplate("default");
        setShowForm(false);
        await fetchCompanies();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
    if (res.ok) await fetchCompanies();
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--fg3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Companies
        </span>
        <button
          onClick={() => setShowForm((v) => !v)}
          title="New company"
          style={{
            background: "none",
            border: "none",
            color: showForm ? "var(--status-warn)" : "var(--fg3)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          {showForm ? "✕" : "+"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div
          style={{
            margin: "0 4px 8px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border-default)",
            background: "var(--bg-card)",
          }}
        >
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            placeholder="Company name"
            autoFocus
            style={{
              width: "100%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              color: "var(--fg1)",
              fontSize: 12,
              padding: "4px 8px",
              marginBottom: 6,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
          <select
            value={formTemplate}
            onChange={(e) => setFormTemplate(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              color: "var(--fg2)",
              fontSize: 11,
              padding: "3px 6px",
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          >
            <option value="default">default</option>
            <option value="startup">startup</option>
            <option value="agency">agency</option>
          </select>
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !formName.trim()}
            style={{
              width: "100%",
              background: creating || !formName.trim() ? "var(--bg-overlay)" : "var(--status-warn)",
              border: "none",
              borderRadius: 4,
              color: creating || !formName.trim() ? "var(--fg3)" : "var(--bg-surface)",
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 0",
              cursor: creating || !formName.trim() ? "default" : "pointer",
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      {/* Company list */}
      {loading && (
        <div style={{ fontSize: 11, color: "var(--fg3)", padding: "4px 12px" }}>
          Loading...
        </div>
      )}
      {!loading && companies.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--fg4)", padding: "4px 12px" }}>
          No companies yet
        </div>
      )}
      {companies.map((co) => {
        const isActive = co.id === activeCompanyId;
        return (
          <div
            key={co.id}
            onClick={() => onSelectCompany?.(co.id)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
              background: isActive ? "var(--bg-card)" : "transparent",
              marginBottom: 1,
              gap: 6,
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 12, flex: 1, color: isActive ? "var(--fg1)" : "var(--fg2)", fontWeight: isActive ? 600 : 400 }}>
              {co.name}
            </span>
            <span
              style={{
                fontSize: 9,
                color: "var(--fg4)",
                background: "var(--bg-overlay)",
                borderRadius: 3,
                padding: "1px 4px",
                flexShrink: 0,
              }}
            >
              {co.template_key}
            </span>
            <button
              onClick={(e) => void handleDelete(co.id, e)}
              title="Delete"
              style={{
                background: "none",
                border: "none",
                color: "var(--fg4)",
                cursor: "pointer",
                fontSize: 12,
                padding: 0,
                lineHeight: 1,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--status-error)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--fg4)")}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
