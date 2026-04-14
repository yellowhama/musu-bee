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
            color: "#6b7280",
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
            color: showForm ? "#f59e0b" : "#6b7280",
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
            border: "1px solid #3b3b3b",
            background: "#1a1a1a",
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
              background: "#111",
              border: "1px solid #333",
              borderRadius: 4,
              color: "#e5e7eb",
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
              background: "#111",
              border: "1px solid #333",
              borderRadius: 4,
              color: "#9ca3af",
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
              background: creating || !formName.trim() ? "#222" : "#f59e0b",
              border: "none",
              borderRadius: 4,
              color: creating || !formName.trim() ? "#6b7280" : "#111",
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
        <div style={{ fontSize: 11, color: "#6b7280", padding: "4px 12px" }}>
          Loading...
        </div>
      )}
      {!loading && companies.length === 0 && (
        <div style={{ fontSize: 11, color: "#4b5563", padding: "4px 12px" }}>
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
              background: isActive ? "#1d1d1d" : "transparent",
              marginBottom: 1,
              gap: 6,
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLDivElement).style.background = "#181818";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 12, flex: 1, color: isActive ? "#f3f4f6" : "#9ca3af", fontWeight: isActive ? 600 : 400 }}>
              {co.name}
            </span>
            <span
              style={{
                fontSize: 9,
                color: "#4b5563",
                background: "#1e1e1e",
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
                color: "#4b5563",
                cursor: "pointer",
                fontSize: 12,
                padding: 0,
                lineHeight: 1,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#4b5563")}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
