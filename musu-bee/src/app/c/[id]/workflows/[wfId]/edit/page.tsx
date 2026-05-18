// V23.4 Phase 4 T2-D-mini — Workflow editor server shell (wiki/435 v2 §2 file #7).
// Fetches existing workflow if wfId !== "new"; passes initial state to client.
import { headers } from "next/headers";
import WorkflowFormClient from "./WorkflowFormClient";
import {
  decodeWorkflow,
  type FormStep,
  type WorkflowSpec,
} from "@/lib/workflow-spec";

interface WorkflowDetail {
  id: string;
  company_id: string;
  name: string;
  status: string;
  spec: WorkflowSpec;
}

async function fetchWorkflow(wfId: string): Promise<WorkflowDetail | null> {
  if (wfId === "new") return null;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const res = await fetch(`${proto}://${host}/api/workflows/${encodeURIComponent(wfId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as WorkflowDetail;
  } catch {
    return null;
  }
}

export default async function WorkflowEditPage({
  params,
}: {
  params: Promise<{ id: string; wfId: string }>;
}) {
  const { id: companyId, wfId } = await params;
  const existing = await fetchWorkflow(wfId);
  const initialSteps: FormStep[] = existing ? decodeWorkflow(existing.spec) : [];
  const initialName = existing?.name ?? "";
  const initialId = existing?.id ?? null;
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", color: "var(--fg1)" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {existing ? `Duplicate · ${existing.name}` : "New workflow"}
      </h1>
      {existing ? (
        <p style={{ fontSize: 13, color: "var(--fg2)", marginBottom: 24 }}>
          Save creates a new workflow (update-in-place lands V23.6). Original {existing.id} stays unchanged.
        </p>
      ) : null}
      <WorkflowFormClient
        companyId={companyId}
        initialName={initialName}
        initialSteps={initialSteps}
        initialWorkflowId={initialId}
      />
    </div>
  );
}
