// V23.4 Phase 4 T2-D-mini — Form ⇄ WorkflowSpec encoder/decoder (wiki/435 v2).
//
// HARD CONSTRAINT (Critic C1 fix, §3.1): `agent_id` IS the identity. There is
// NO `step_id` field. `reactKey` (UUID) is React list-key only — never sent
// to backend, never persisted. "Row N" is display-only, computed from array
// index at render time.
//
// Backend `AgentSpec.id` regex (workflow_routes.py:73):
//   ^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$  (max 63 chars, single-char OK).
// Replicated client-side for early validation.
//
// Round-trip lossiness (§3.5): encode always emits `condition: "succeeded"`.
// Decoding a spec with `condition: "failed"` silently drops the condition.

export interface FormStep {
  /** Stable React identity (UUID at row-add time). NEVER sent to backend. */
  reactKey: string;
  /** Real agent role / identity. Becomes AgentSpec.id. */
  agent_id: string;
  /** User-authored instruction. Becomes AgentSpec.command = [prompt]. */
  prompt: string;
  /** agent_ids of upstream steps this step depends on. */
  depends_on: string[];
}

export interface WorkflowFormState {
  name: string;
  steps: FormStep[];
}

export const AGENT_ID_REGEX = /^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$/;
export const AGENT_ID_MAX = 63;

export interface AgentSpec {
  id: string;
  image: string;
  command: string[];
  nodeSelector: Record<string, string>;
  timeoutSeconds: number;
  retry: { maxAttempts: number; backoffSeconds: number };
  resources: Record<string, never>;
  inputs: unknown[];
  outputs: string[];
}

export interface EdgeSpec {
  from: string;
  to: string;
  condition: "succeeded" | "failed" | "always";
}

export interface WorkflowSpec {
  agents: AgentSpec[];
  edges: EdgeSpec[];
}

export interface EncodedWorkflow {
  name: string;
  spec: WorkflowSpec;
}

/** Encode form to backend WorkflowSpec. Throws on validation error. */
export function encodeWorkflow(
  name: string,
  steps: FormStep[]
): EncodedWorkflow {
  if (!name.trim()) throw new Error("name required");
  if (steps.length < 1) throw new Error("at least one step required");

  const seen = new Set<string>();
  for (const s of steps) {
    const id = s.agent_id.trim();
    if (!id) throw new Error("agent_id required for every step");
    if (id.length > AGENT_ID_MAX || !AGENT_ID_REGEX.test(id)) {
      throw new Error(`invalid agent_id: ${id}`);
    }
    if (seen.has(id)) throw new Error(`duplicate agent: ${id}`);
    seen.add(id);
    if (!s.prompt.trim()) throw new Error(`prompt required for agent: ${id}`);
  }

  for (const s of steps) {
    for (const dep of s.depends_on) {
      if (!seen.has(dep)) throw new Error(`unknown dependency: ${dep}`);
    }
  }

  const agents: AgentSpec[] = steps.map((s) => ({
    id: s.agent_id,
    image: "default",
    command: [s.prompt],
    nodeSelector: {},
    timeoutSeconds: 3600,
    retry: { maxAttempts: 0, backoffSeconds: 30 },
    resources: {},
    inputs: [],
    outputs: [],
  }));

  const edges: EdgeSpec[] = [];
  for (const s of steps) {
    for (const upstream of s.depends_on) {
      edges.push({ from: upstream, to: s.agent_id, condition: "succeeded" });
    }
  }

  return { name, spec: { agents, edges } };
}

/** Decode backend spec back to form. condition="failed" edges lose condition. */
export function decodeWorkflow(spec: WorkflowSpec): FormStep[] {
  const dependsOn: Record<string, string[]> = {};
  for (const a of spec.agents) dependsOn[a.id] = [];
  for (const e of spec.edges) {
    if (dependsOn[e.to]) dependsOn[e.to].push(e.from);
  }
  return spec.agents.map((a) => ({
    reactKey:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${a.id}-${Math.random().toString(36).slice(2)}`,
    agent_id: a.id,
    prompt: (a.command ?? []).join(" "),
    depends_on: dependsOn[a.id] ?? [],
  }));
}
