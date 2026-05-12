"use client";

import { useEffect, useState } from "react";
import { useOnboardingFlow, type AdapterType, type OnboardingStep } from "./onboarding/useOnboardingFlow";

const ADAPTER_OPTIONS: Array<{ id: AdapterType; label: string; hint: string }> = [
  { id: "claude_local", label: "Claude", hint: "Anthropic CLI · sonnet 4.6 / opus 4.7" },
  { id: "codex_local", label: "Codex", hint: "OpenAI CLI · gpt-5.3-codex" },
  { id: "gemini_local", label: "Gemini", hint: "Google CLI · 2.5-pro / 2.5-flash" },
];

interface CompanyOnboardingModalProps {
  /** Available nodes from useNodes(). */
  availableNodes: Array<{ name: string; status: string }>;
  /** Close handler. */
  onClose: () => void;
  /** Called after the company has been successfully spawned. */
  onSpawned?: (companyId: string) => void;
}

/**
 * v12-onboarding — 4-tab company-creation modal.
 *
 * Wires to `useOnboardingFlow` for state. Sub-cycle A lands the
 * scaffolding; B replaces step-3 decision with the real bridge call;
 * C/D wires the real spawn.
 */
export default function CompanyOnboardingModal({
  availableNodes,
  onClose,
  onSpawned,
}: CompanyOnboardingModalProps) {
  const { flow, setField, next, back, reset, requestDecision, spawn, approveTemplate } = useOnboardingFlow();

  // Default node selection when entering step 2.
  useEffect(() => {
    if (flow.step === 2 && !flow.nodeId && availableNodes.length > 0) {
      const online = availableNodes.find((n) => n.status === "online") ?? availableNodes[0];
      setField("nodeId", online.name);
    }
  }, [flow.step, flow.nodeId, availableNodes, setField]);

  // Fire decision when entering step 3.
  useEffect(() => {
    if (flow.step === 3 && flow.decision === null) {
      void requestDecision();
    }
  }, [flow.step, flow.decision, requestDecision]);

  // Escape to close with safety prompt.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (flow.mission.trim() && flow.spawnStatus !== "ok") {
        if (!confirm("Close onboarding? Your draft will be saved.")) return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow.mission, flow.spawnStatus, onClose]);

  function handleNextOrSpawn() {
    if (flow.step === 4 && flow.spawnStatus === "idle") {
      void spawn();
      return;
    }
    if (flow.step === 4 && flow.spawnStatus === "ok") {
      reset();
      if (flow.spawnedCompanyId) onSpawned?.(flow.spawnedCompanyId);
      onClose();
      return;
    }
    next();
  }

  const nextLabel = (() => {
    if (flow.step === 4 && flow.spawnStatus === "ok") return "Done";
    if (flow.step === 4 && flow.spawnStatus === "spawning") return "Creating…";
    if (flow.step === 4) return "Create & start";
    return "Next →";
  })();

  const nextDisabled = (() => {
    if (flow.step === 1) return !flow.companyName.trim() || flow.mission.trim().length < 10;
    if (flow.step === 2) return !flow.nodeId;
    if (flow.step === 3) return flow.decision === "pending" || (flow.decision !== "found" && !flow.proposedTemplate);
    if (flow.step === 4) return flow.spawnStatus === "spawning";
    return true;
  })();

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal>
      <div className="onboarding-modal">
        <header className="onboarding-header">
          <span className="onboarding-title">Start a new company</span>
          <button className="onboarding-close" onClick={onClose} aria-label="Close" type="button">×</button>
        </header>

        <StepIndicator step={flow.step} />

        <div className="onboarding-body">
          {flow.step === 1 ? (
            <Step1Company flow={flow} setField={setField} />
          ) : flow.step === 2 ? (
            <Step2CEO flow={flow} setField={setField} availableNodes={availableNodes} />
          ) : flow.step === 3 ? (
            <Step3Template flow={flow} setField={setField} approveTemplate={approveTemplate} />
          ) : (
            <Step4Launch flow={flow} />
          )}
        </div>

        <footer className="onboarding-footer">
          {flow.step > 1 && flow.spawnStatus !== "ok" ? (
            <button className="onboarding-btn ghost" onClick={back} type="button">← Back</button>
          ) : <span />}
          <button
            className="onboarding-btn primary"
            onClick={handleNextOrSpawn}
            disabled={nextDisabled}
            type="button"
          >
            {nextLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: OnboardingStep }) {
  const labels = ["Company", "CEO", "Template", "Launch"];
  return (
    <ol className="onboarding-steps">
      {labels.map((label, i) => {
        const n = (i + 1) as OnboardingStep;
        const isActive = n === step;
        const isDone = n < step;
        return (
          <li key={label} className={`onboarding-step${isActive ? " active" : ""}${isDone ? " done" : ""}`}>
            <span className="onboarding-step-num">{isDone ? "✓" : n}</span>
            <span className="onboarding-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1 — Company ───────────────────────────────────────────────────────

type SetField = ReturnType<typeof useOnboardingFlow>["setField"];
type FlowSnapshot = ReturnType<typeof useOnboardingFlow>["flow"];

function Step1Company({ flow, setField }: { flow: FlowSnapshot; setField: SetField }) {
  return (
    <div className="onboarding-step-body">
      <label className="onboarding-field">
        <span className="onboarding-field-label">Company name</span>
        <input
          type="text"
          value={flow.companyName}
          onChange={(e) => setField("companyName", e.target.value)}
          placeholder="e.g. TechCo, Bloodline Writers, Trading Bot Inc."
          maxLength={80}
          autoFocus
        />
      </label>
      <label className="onboarding-field">
        <span className="onboarding-field-label">Mission</span>
        <textarea
          value={flow.mission}
          onChange={(e) => setField("mission", e.target.value)}
          placeholder="What does this company exist to do?  e.g. Run a 1-person SaaS that delivers a daily AI-news digest by email. Target: $5k MRR by Q3."
          rows={4}
          maxLength={600}
        />
        <span className="onboarding-field-hint">
          Plain language. Your CEO reads this and picks (or designs) the org. Minimum 10 chars.
        </span>
      </label>
    </div>
  );
}

// ── Step 2 — CEO ───────────────────────────────────────────────────────────

function Step2CEO({
  flow,
  setField,
  availableNodes,
}: {
  flow: FlowSnapshot;
  setField: SetField;
  availableNodes: Array<{ name: string; status: string }>;
}) {
  async function runTest() {
    setField("testStatus", "checking");
    setField("testReason", "");
    setField("testLatencyMs", null);
    try {
      const r = await fetch(`/api/bridge/adapters/${flow.adapter}/probe`, {
        method: "POST",
      });
      const data: { ok?: boolean; latency_ms?: number; reason?: string } = await r
        .json()
        .catch(() => ({}));
      setField("testStatus", data.ok ? "ok" : "fail");
      setField("testReason", data.reason ?? "");
      setField("testLatencyMs", typeof data.latency_ms === "number" ? data.latency_ms : null);
    } catch (e) {
      setField("testStatus", "fail");
      setField("testReason", e instanceof Error ? e.message : String(e));
      setField("testLatencyMs", null);
    }
  }

  return (
    <div className="onboarding-step-body">
      <fieldset className="onboarding-field">
        <legend className="onboarding-field-label">Adapter</legend>
        <div className="onboarding-adapter-list">
          {ADAPTER_OPTIONS.map((opt) => (
            <label key={opt.id} className={`onboarding-adapter${flow.adapter === opt.id ? " selected" : ""}`}>
              <input
                type="radio"
                name="adapter"
                value={opt.id}
                checked={flow.adapter === opt.id}
                onChange={() => setField("adapter", opt.id)}
              />
              <span className="onboarding-adapter-label">{opt.label}</span>
              <span className="onboarding-adapter-hint">{opt.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="onboarding-field">
        <span className="onboarding-field-label">Primary node</span>
        <select
          value={flow.nodeId ?? ""}
          onChange={(e) => setField("nodeId", e.target.value || null)}
        >
          {availableNodes.length === 0 ? <option value="">No nodes detected</option> : null}
          {availableNodes.map((n) => (
            <option key={n.name} value={n.name}>
              {n.name} {n.status === "online" ? "·  online" : "·  offline"}
            </option>
          ))}
        </select>
        <span className="onboarding-field-hint">
          Your CEO and its team start here. The mesh router will spill heavier work to other online nodes.
        </span>
      </label>
      <label className="onboarding-field">
        <span className="onboarding-field-label">Budget (USD / month)</span>
        <input
          type="number"
          min={5}
          max={1000}
          step={5}
          value={Math.round(flow.budgetCents / 100)}
          onChange={(e) => setField("budgetCents", Math.max(500, Math.round(Number(e.target.value) * 100)))}
        />
      </label>
      <div className="onboarding-test">
        <button className="onboarding-btn ghost" type="button" onClick={runTest} disabled={flow.testStatus === "checking"}>
          {flow.testStatus === "checking" ? "Testing…" : "Test connection"}
        </button>
        {flow.testStatus === "ok" ? (
          <span className="onboarding-test-ok">
            ✓ Adapter responded
            {flow.testLatencyMs != null ? ` · ${Math.round(flow.testLatencyMs)}ms` : ""}
            {flow.testReason ? ` · "${flow.testReason}"` : ""}
          </span>
        ) : null}
        {flow.testStatus === "fail" ? (
          <span className="onboarding-test-fail">
            ✗ {flow.testReason || "Adapter unreachable"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── Step 3 — Template decision ──────────────────────────────────────────────

function Step3Template({
  flow,
  setField,
  approveTemplate,
}: {
  flow: FlowSnapshot;
  setField: SetField;
  approveTemplate: () => Promise<void>;
}) {
  if (flow.decision === "pending" || flow.decision === null) {
    return (
      <div className="onboarding-step-body onboarding-decision-pending">
        <div className="canvas-loading-spinner" />
        <p>Your CEO is checking the template library…</p>
      </div>
    );
  }
  if (flow.decisionError) {
    return (
      <div className="onboarding-step-body">
        <p className="onboarding-decision-error">Decision failed: {flow.decisionError}</p>
        <button className="onboarding-btn ghost" type="button" onClick={() => setField("decision", null)}>
          Try again
        </button>
      </div>
    );
  }
  if (flow.decision === "found" && flow.foundTemplate) {
    return (
      <div className="onboarding-step-body">
        <h3 className="onboarding-found-title">CEO found a match</h3>
        <p className="onboarding-found-subtitle">
          Template <code>{flow.foundTemplate}</code> looks right for this mission.
        </p>
        {flow.decisionPreview && flow.decisionPreview.agents.length > 0 ? (
          <ul className="onboarding-found-agents">
            {flow.decisionPreview.agents.map((a) => (
              <li key={a.name}>
                <strong>{a.role}</strong>
                <span>{a.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  if (flow.decision === "research") {
    if (!flow.proposedTemplate) {
      return (
        <div className="onboarding-step-body onboarding-decision-pending">
          <div className="canvas-loading-spinner" />
          <p>Your mission is new — your CEO is designing an org structure.</p>
          <p className="onboarding-found-note">~30s. You can leave this open — your draft is saved.</p>
        </div>
      );
    }
    const approved = flow.foundTemplate === flow.proposedTemplate.slug;
    return (
      <div className="onboarding-step-body">
        <h3 className="onboarding-found-title">{flow.proposedTemplate.displayName}</h3>
        <p className="onboarding-found-subtitle">
          {flow.proposedTemplate.departments.length} departments across day-1 and later phases.
        </p>
        <ul className="onboarding-departments">
          {flow.proposedTemplate.departments.map((d) => (
            <li key={d.name}>
              <strong>{d.name}</strong>
              <span>{d.role} · {d.agentCount} agent{d.agentCount === 1 ? "" : "s"}</span>
              <em>{d.phase}</em>
            </li>
          ))}
        </ul>
        {approved ? (
          <p className="onboarding-found-note">
            ✓ Saved to <code>~/.musu/companies/_templates/{flow.proposedTemplate.slug}.yaml</code> — reusable next time.
          </p>
        ) : (
          <button className="onboarding-btn primary" type="button" onClick={() => void approveTemplate()}>
            Approve & save as template
          </button>
        )}
      </div>
    );
  }
  return null;
}

// ── Step 4 — Launch ─────────────────────────────────────────────────────────

function Step4Launch({ flow }: { flow: FlowSnapshot }) {
  if (flow.spawnStatus === "ok") {
    return (
      <div className="onboarding-step-body onboarding-spawned">
        <div className="onboarding-spawned-check">✓</div>
        <h3>Your company is live</h3>
        <p>Check the canvas — its lead is introducing the team to you now.</p>
      </div>
    );
  }
  return (
    <div className="onboarding-step-body">
      <h3 className="onboarding-summary-title">Ready to start</h3>
      <ul className="onboarding-summary">
        <li><span>Company</span><strong>{flow.companyName}</strong></li>
        <li><span>Mission</span><strong>{flow.mission.split("\n")[0]}</strong></li>
        <li><span>Template</span><strong>{flow.foundTemplate ?? flow.proposedTemplate?.slug ?? "—"}</strong></li>
        <li><span>Adapter</span><strong>{flow.adapter}</strong></li>
        <li><span>Primary node</span><strong>{flow.nodeId}</strong></li>
        <li><span>Budget</span><strong>${(flow.budgetCents / 100).toFixed(0)} / mo</strong></li>
      </ul>
      {flow.spawnError ? <p className="onboarding-decision-error">Spawn failed: {flow.spawnError}</p> : null}
    </div>
  );
}
