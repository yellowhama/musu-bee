"use client";

import { useMemo, useState } from "react";
import type { DefaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";
import type { CompanySetupState } from "@/lib/companySetup";
import type { CompanyActivationState, CompanyRegistryState } from "@/lib/companyActivation";

interface CompanyTemplateModalProps {
  template: DefaultCompanyTemplate;
  companySetup: CompanySetupState;
  companyActivation: CompanyActivationState | null;
  companyRegistry: CompanyRegistryState | null;
  onSave: (next: { companyName: string; selectedProjects: string[] }) => Promise<void>;
  onApply: (next: { companyName: string; selectedProjects: string[] }) => Promise<void>;
  onSelectActive: (companyId: string) => Promise<void>;
  onSync: (companyId: string) => Promise<void>;
  onDelete: (companyId: string) => Promise<void>;
  onClose: () => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#6b7280",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

export default function CompanyTemplateModal({
  template,
  companySetup,
  companyActivation,
  companyRegistry,
  onSave,
  onApply,
  onSelectActive,
  onSync,
  onDelete,
  onClose,
}: CompanyTemplateModalProps) {
  const [copied, setCopied] = useState(false);
  const [companyName, setCompanyName] = useState(companySetup.companyName);
  const [selectedProjects, setSelectedProjects] = useState(companySetup.selectedProjects);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeCompanyActionId, setActiveCompanyActionId] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify(template, null, 2), [template]);

  async function handleCopy() {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function toggleProject(project: string) {
    setSelectedProjects((prev) =>
      prev.includes(project) ? prev.filter((entry) => entry !== project) : [...prev, project]
    );
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave({
        companyName,
        selectedProjects,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save company setup.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApply() {
    setApplyError(null);
    setApplying(true);
    try {
      await onApply({
        companyName,
        selectedProjects,
      });
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Could not apply company template.");
    } finally {
      setApplying(false);
    }
  }

  async function runCompanyAction(
    companyId: string,
    action: "activate" | "sync" | "delete"
  ) {
    setActionError(null);
    setActiveCompanyActionId(companyId);
    try {
      if (action === "activate") {
        await onSelectActive(companyId);
      } else if (action === "sync") {
        await onSync(companyId);
      } else {
        await onDelete(companyId);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Company action failed.");
    } finally {
      setActiveCompanyActionId(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
        backdropFilter: "blur(4px)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 860,
          maxHeight: "84vh",
          overflow: "auto",
          background: "#111111",
          border: "1px solid #262626",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          padding: 28,
          color: "#e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 22 }}>🏢</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Company setup template
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
              {template.templateKey} · version {template.version}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => void handleCopy()}
              style={{
                background: copied ? "#14532d" : "#1a1a1a",
                border: `1px solid ${copied ? "#22c55e" : "#2d2d2d"}`,
                color: copied ? "#86efac" : "#e5e7eb",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #2d2d2d",
                color: "#9ca3af",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, marginBottom: 24 }}>
          {template.summary}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Scope</SectionTitle>
            <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 6 }}>
              Workspace: {companySetup.workspaceId}
            </div>
            <div style={{ fontSize: 13, color: "#d1d5db" }}>User: {companySetup.userKey}</div>
          </div>
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Control Plane Sync</SectionTitle>
            <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 6 }}>
              {companyActivation?.controlPlaneSync.status ?? "not_configured"}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
              {companyActivation?.controlPlaneSync.message ??
                "Apply the template to capture Paperclip sync status."}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#141414",
            border: "1px solid #242424",
            borderRadius: 12,
            padding: 16,
            marginBottom: 22,
          }}
        >
          <SectionTitle>Company Setup</SectionTitle>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Company name</div>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                style={{
                  width: "100%",
                  background: "#0d0d0d",
                  border: "1px solid #2d2d2d",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "#f3f4f6",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
                Starter projects
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {template.starterProjects.map((project) => {
                  const checked = selectedProjects.includes(project);
                  return (
                    <label
                      key={project}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13,
                        color: "#e5e7eb",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProject(project)}
                      />
                      <span>{project}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {saveError ? (
              <div style={{ fontSize: 13, color: "#fca5a5" }}>{saveError}</div>
            ) : null}
            {applyError ? (
              <div style={{ fontSize: 13, color: "#fca5a5" }}>{applyError}</div>
            ) : null}
            {actionError ? (
              <div style={{ fontSize: 13, color: "#fca5a5" }}>{actionError}</div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || companyName.trim().length === 0 || selectedProjects.length === 0}
                style={{
                  background: saving ? "#4c1d95" : "#7c3aed",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor:
                    saving || companyName.trim().length === 0 || selectedProjects.length === 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save company setup"}
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={
                  applying || companyName.trim().length === 0 || selectedProjects.length === 0
                }
                style={{
                  background: applying ? "#1d4ed8" : "#2563eb",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor:
                    applying || companyName.trim().length === 0 || selectedProjects.length === 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {applying ? "Applying..." : "Apply template"}
              </button>
            </div>
          </div>
        </div>

        {companyActivation ? (
          <div
            style={{
              background: "#141414",
              border: "1px solid #242424",
              borderRadius: 12,
              padding: 16,
              marginBottom: 22,
            }}
          >
            <SectionTitle>Active Company</SectionTitle>
            <div style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 6 }}>
              {companyActivation.companyName}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
              Company ID: {companyActivation.companyId}
              <br />
              Updated: {new Date(companyActivation.updatedAt).toLocaleString()}
            </div>
          </div>
        ) : null}

        {companyRegistry && companyRegistry.companies.length > 0 ? (
          <div
            style={{
              background: "#141414",
              border: "1px solid #242424",
              borderRadius: 12,
              padding: 16,
              marginBottom: 22,
            }}
          >
            <SectionTitle>Company Registry</SectionTitle>
            <div style={{ display: "grid", gap: 10 }}>
              {companyRegistry.companies.map((company) => {
                const isActive = companyRegistry.activeCompanyId === company.companyId;
                const isBusy = activeCompanyActionId === company.companyId;
                return (
                  <div
                    key={company.companyId}
                    style={{
                      border: "1px solid #262626",
                      borderRadius: 10,
                      padding: 12,
                      background: isActive ? "#101726" : "#111111",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f3f4f6" }}>
                        {company.companyName}
                      </div>
                      {isActive ? (
                        <span style={{ fontSize: 11, color: "#93c5fd" }}>ACTIVE</span>
                      ) : null}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => void runCompanyAction(company.companyId, "activate")}
                            disabled={isBusy}
                            style={{
                              background: "#1a1a1a",
                              border: "1px solid #2d2d2d",
                              color: "#e5e7eb",
                              borderRadius: 8,
                              padding: "6px 10px",
                              fontSize: 12,
                              cursor: isBusy ? "not-allowed" : "pointer",
                            }}
                          >
                            Set active
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void runCompanyAction(company.companyId, "sync")}
                          disabled={isBusy}
                          style={{
                            background: "#1d4ed8",
                            border: "none",
                            color: "#ffffff",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 12,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          {isBusy ? "Working..." : "Sync"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runCompanyAction(company.companyId, "delete")}
                          disabled={isBusy}
                          style={{
                            background: "transparent",
                            border: "1px solid #3f1d1d",
                            color: "#fca5a5",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 12,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, marginTop: 6 }}>
                      Template: {company.templateKey}
                      <br />
                      Projects: {company.selectedProjects.join(", ")}
                    </div>
                    {company.syncHistory.length > 0 ? (
                      <div style={{ marginTop: 10 }}>
                        <SectionTitle>Recent Sync</SectionTitle>
                        {company.syncHistory.slice(0, 3).map((event) => (
                          <div key={event.eventId} style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>
                            {event.mode} · {event.status} · {new Date(event.checkedAt).toLocaleString()}
                            <br />
                            <span style={{ color: "#9ca3af" }}>{event.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Goals</SectionTitle>
            {template.goals.map((goal) => (
              <div key={goal} style={{ fontSize: 13, marginBottom: 8, color: "#e5e7eb" }}>
                {goal}
              </div>
            ))}
          </div>
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Starter Projects</SectionTitle>
            {template.starterProjects.map((project) => (
              <div key={project} style={{ fontSize: 13, marginBottom: 8, color: "#e5e7eb" }}>
                {project}
              </div>
            ))}
          </div>
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Default Lanes</SectionTitle>
            {template.defaultAgents.map((agent) => (
              <div key={agent} style={{ fontSize: 13, marginBottom: 8, color: "#e5e7eb" }}>
                {agent}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Bootstrap Checklist</SectionTitle>
            {template.bootstrapChecklist.map((item, index) => (
              <div key={item} style={{ fontSize: 13, color: "#d1d5db", marginBottom: 10, lineHeight: 1.5 }}>
                {index + 1}. {item}
              </div>
            ))}
          </div>
          <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
            <SectionTitle>Maintenance</SectionTitle>
            {template.maintenance.map((item) => (
              <div key={item} style={{ fontSize: 13, marginBottom: 8, color: "#e5e7eb" }}>
                {item}
              </div>
            ))}
            <div style={{ height: 14 }} />
            <SectionTitle>Comment Contract</SectionTitle>
            <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.6 }}>
              Required: {template.boardCommentContract.requiredFields.join(", ")}
              <br />
              Conditional: {template.boardCommentContract.conditionalFields.join(", ")}
            </div>
          </div>
        </div>

        <div style={{ background: "#0d0d0d", border: "1px solid #242424", borderRadius: 12, padding: 16 }}>
          <SectionTitle>Template JSON</SectionTitle>
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
              color: "#cbd5e1",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {payload}
          </pre>
        </div>
      </div>
    </div>
  );
}
