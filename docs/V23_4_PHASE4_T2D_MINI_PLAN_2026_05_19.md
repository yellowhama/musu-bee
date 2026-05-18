# V23.4 Phase 4 T2-D-mini Detail Plan (wiki/435)

**Date**: 2026-05-19
**Wiki ID**: `wiki/435`
**Sub-WS**: T2-D-mini (form-based workflow builder; visual React Flow editor deferred V23.6)
**Master plan**: `F:\workspace\musu-bee\docs\V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.D
**Branch**: `v23/phase4` (HEAD `f8c0ace` after T2-D-mini reshape commit)
**Depends on**: T2-A' SHIPPED (workflow_routes.py live, schema v37 applied)
**Closure target**: wiki/439

---

## §0 Status + scope

### §0.1 Reshape origin

T2-D was originally scoped as ~1400 LOC React Flow drag-connect editor with `@xyflow/react` dependency. On 2026-05-19 grilling Q3 (T2-D-keep vs T2-D-mini vs T2-D-defer), user chose **T2-D-mini**: ~400 LOC form-based step list, no React Flow dep. Visual graph editor (T2-D-visual ~1100 LOC) deferred to V23.6 gated on closed beta dogfood feedback.

Master plan reshape recorded at §5.D (lines 286-316 of V23_4_PHASE4_MASTER_PLAN_2026_05_18.md). LOC delta `-1100` reflected in §0.3 reshape table.

### §0.2 Scope statement

T2-D-mini delivers the **form-based workflow authoring surface** for V23.4 Phase 4. Any company member (developer or non-developer marketer in closed beta) can:

1. List workflows for a company at `/c/[company]/workflows`
2. Open editor at `/c/[company]/workflows/[id]` and author a step-list workflow
3. Save → POST musu-bridge `/api/workflows` → server validates spec (cycle detection, agent ID uniqueness, edge references) and creates SQLite rows
4. Run → PATCH `/api/workflows/{id}` body `{"status": "running"}` → T2-A' asyncio executor picks up pending steps and dispatches via `enqueue_wake`
5. Watch live status in RunPanel (2s poll of `/api/workflows/{id}/status` — SSE NOT in scope)

**Total budget**: ~520 LOC (revised upward from master plan ~400 estimate; documented in §2), 1 `/loop` iteration. Closed beta acceptance gate §9 #9 satisfied via form-based DAG manipulation (`depends_on` multi-select per step).

### §0.3 Out-of-scope (deferred V23.5 / V23.6)

- React Flow visual graph editor (T2-D-visual V23.6)
- SSE-based status push (form-based polling sufficient for MVP; master plan §1 SCOPE OUT)
- Workflow versioning, concurrent editing (V23.5)
- `<user>.musu.pro` SaaS parity smoke (deferred V23.5 — Paddle gates that)
- Drag-reorder of step rows (up/down arrows used instead — see §4)
- Spec mutation via PATCH (T2-A' Phase 0 Researcher OQ-RES-5: status-only PATCH for MVP; spec edits = delete + recreate)

---

## §1 Goal + acceptance

### §1.1 User flow (V23.5 closed beta user — non-developer marketer)

1. User logs in, navigates to a company → clicks "Workflows" sidebar item or `/c/[company]/workflows`
2. Sees list of saved workflows for that company (name, status badge, created_at). Empty state shows "+ New workflow" button prominently
3. Clicks "+ New workflow" → client generates UUID locally, navigates to `/c/[company]/workflows/[new-uuid]?new=1`
4. Editor renders empty form: `name` input + "Add step" button
5. User fills name "Daily summary" + adds 3 step rows:
   - row 0: `step_id=step-1`, agent_role=`writer`, prompt="Summarize today's commits", depends_on=`[]`
   - row 1: `step_id=step-2`, agent_role=`reviewer`, prompt="Review summary for clarity", depends_on=`[step-1]`
   - row 2: `step_id=step-3`, agent_role=`publisher`, prompt="Post to slack", depends_on=`[step-2]`
6. Clicks "Save" → client encodes form rows to `{name, spec: {agents: [...], edges: [...]}}` via `workflow-spec.ts` → POST `/api/workflows` → 201 with `{id, status: "pending"}` → toast "Workflow saved"
7. Clicks "Run" → PATCH `/api/workflows/{id}` body `{"status": "running"}` → 200 → toast "Running"
8. RunPanel begins polling `/api/workflows/{id}/status` every 2000 ms; renders 3 step rows with badges (pending → running → succeeded). On any step failure, badge turns red; click expands to show `error_json`
9. If user constructs a cycle (e.g. step-1 depends on step-3) and clicks Save: backend returns 422 `{detail: "cycle detected in workflow DAG"}` → frontend shows error toast with backend message; form remains editable; user fixes and resaves

### §1.2 Master plan §9 acceptance mapping

| Master plan §9 # | T2-D-mini deliverable |
|---|---|
| #4 (T2-D-mini SHIP-OK with single quality-engineer audit + parity discipline) | This plan + Builder/Auditor cycle |
| #9 (End-to-end gate test: user creates 3-step DAG in form → POSTs JSON spec → executor distributes across 2 PCs → results in RunPanel) | §7 Playwright `workflows-form.spec.ts` happy path covers single-PC subset; multi-PC gate runs at Phase 4 close on physical rig |

### §1.3 Non-functional acceptance

- `npx tsc --noEmit` clean
- `npm run test:vocab` does not regress (vocabulary-audit lint per T2-C)
- All new tests green via `npx tsx --test` (Node test runner pattern)
- Playwright `workflows-form.spec.ts` green against bridge mock
- Page mount → first paint < 200ms on localhost (no React Flow bundle)
- No `tldraw` or `@xyflow/react` imports anywhere in `/c/[company]/workflows/**`

---

## §2 File list with exact LOC + responsibility

| # | File | New/Edit | LOC | Responsibility |
|---|---|---|---|---|
| 1 | `musu-bee/src/lib/workflow-spec.ts` | NEW | ~70 | `FormStep` type; `encodeFormToSpec(name, steps)`; `decodeSpecToForm(spec)`; `topoOrder(steps)` helper |
| 2 | `musu-bee/src/lib/workflow-spec.test.ts` | NEW | ~80 | Node test runner; encode round-trip (linear, diamond, solo); decode round-trip; edge cases |
| 3 | `musu-bee/src/app/api/workflows/route.ts` | NEW | ~30 | Proxy for `/api/workflows` (GET list, POST create); reuses `buildBridgeHeaders` |
| 4 | `musu-bee/src/app/api/workflows/[id]/route.ts` | NEW | ~25 | Proxy for `/api/workflows/{id}` (GET, PATCH, DELETE) |
| 5 | `musu-bee/src/app/api/workflows/[id]/status/route.ts` | NEW | ~15 | Proxy for `/api/workflows/{id}/status` (GET only) — narrow handler, polled at 2s |
| 6 | `musu-bee/src/app/c/[company]/workflows/page.tsx` | NEW | ~40 | List page; fetches GET `/api/workflows?company_id=`; renders rows + "+ New workflow" |
| 7 | `musu-bee/src/app/c/[company]/workflows/[id]/page.tsx` | NEW | ~50 | Editor SSR shell; mounts WorkflowFormClient + RunPanel; reads `?new=1` |
| 8 | `musu-bee/src/app/c/[company]/workflows/[id]/WorkflowFormClient.tsx` | NEW | ~120 | Form-based step list; Save + Run; surfaces backend 422 errors |
| 9 | `musu-bee/src/app/c/[company]/workflows/[id]/RunPanel.tsx` | NEW | ~50 | Polls `/status` every 2000ms; renders step badges; click expands |
| 10 | `musu-bee/e2e/workflows-form.spec.ts` | NEW | ~40 | Playwright: happy path + cycle 422 + empty form validation, mocked |

**Total**: ~520 LOC across 10 files. Master plan §5.D estimated ~400 LOC for 8 files; +120 LOC delta from: proxy split into 3 narrow files (+45), `topoOrder` helper (+25), robust test coverage (+50). Documented for Critic transparency.

**LOC contingency** (if Critic flags scope creep): collapse 3 proxy files into single `[...path]` reuse → recovers ~70 LOC; or trim test coverage by ~30 LOC. Planner recommends accepting ~520 LOC.

### §2.1 Files NOT created

`EditorClient.tsx`, `NodePalette.tsx`, `AgentNode.tsx`, `workflow-graph.ts`, `@xyflow/react` dep — all V23.6 T2-D-visual scope.

---

## §3 WorkflowSpec encode/decode logic (`workflow-spec.ts`)

### §3.1 Form data model

```ts
export interface FormStep {
  step_id: string;       // user-visible row identifier, also becomes agents[].id
  agent_id: string;      // agent role / capability key
  prompt: string;        // user-authored instruction; becomes agents[].command[0]
  depends_on: string[];  // step_ids of prior steps this step depends on
}

export interface WorkflowFormState {
  name: string;
  steps: FormStep[];
}
```

### §3.2 Backend WorkflowSpec shape (read from `workflow_routes.py:107-170`)

```python
class WorkflowSpec(BaseModel):
    agents: list[AgentSpec] = Field(min_length=1)
    edges: list[EdgeSpec] = Field(default_factory=list)

class AgentSpec(BaseModel):
    id: str            # pattern ^[a-z0-9][-a-z0-9]*[a-z0-9]$ (max 63)
    image: str         # NON-EMPTY required
    command: list[str] = []
    nodeSelector: dict[str, str] = {}  # whitelisted keys only
    timeoutSeconds: int = 3600
    retry: RetryPolicy = {maxAttempts: 0, backoffSeconds: 30}
    resources: AgentResources = {}
    inputs: list[AgentInput] = []
    outputs: list[str] = []

class EdgeSpec(BaseModel):
    from_: str = Field(alias="from")
    to: str
    condition: Literal["succeeded", "failed", "always"] = "succeeded"
```

### §3.3 Encode logic

```
encodeFormToSpec(name, steps): {name, spec: WorkflowSpec}
  1. Client validation:
     - name non-empty (throw "name required")
     - steps.length >= 1 (throw "at least one step required")
     - each step.step_id matches pattern (throw on violation)
     - step_ids unique (throw "duplicate step id: X")
     - each step.agent_id + step.prompt non-empty
     - each step.depends_on[i] references existing step.step_id (throw on unknown)
  2. Build agents array:
     for step in steps:
       agents.push({
         id: step.step_id,
         image: "default",
         command: [step.prompt],
         nodeSelector: {},
         timeoutSeconds: 3600,
         retry: {maxAttempts: 0, backoffSeconds: 30},
         resources: {},
         inputs: [],
         outputs: [],
       })
  3. Build edges array:
     for step in steps:
       for upstream in step.depends_on:
         edges.push({from: upstream, to: step.step_id, condition: "succeeded"})
  4. Return {name, spec: {agents, edges}}
```

### §3.4 Decode logic

```
decodeSpecToForm(spec): FormStep[]
  1. Build reverse-edge map: depends_on[step_id] = []
     for edge in spec.edges:
       depends_on[edge.to].push(edge.from)
  2. For each agent in topoOrder(spec.agents, spec.edges):
     formStep = {
       step_id: agent.id,
       agent_id: agent.id,
       prompt: agent.command.join(" "),
       depends_on: depends_on[agent.id] ?? [],
     }
  3. Return formSteps
```

### §3.5 Round-trip preservation

`decode(encode(formState))` produces semantically equivalent `formState'`. encode emits `condition: "succeeded"` always; if a future V23.6 spec had `condition: "failed"` edges, decoding loses that info. Documented in workflow-spec.ts header comment.

### §3.6 Client-side cycle detection: DEFERRED

Per Phase 0 Researcher finding (workflow_routes.py:134-152 runs Kahn's algorithm at POST), client-side cycle detection NOT implemented. Backend rejects with 422; UX consequence in §9 R2.

---

## §4 Form UX detail (`WorkflowFormClient.tsx`)

### §4.1 Step row controls

- **Auto-generated step_id**: `step-{N}` where N is 1-indexed row position. Read-only display. Internal React `key` (UUID generated at row-add time) is the stable identity; depends_on references stored by stable key, translated to step_id at encode time. This prevents reorder-induced reference breakage (§9 R5).
- **Agent role dropdown**: populated by `GET /api/companies/{company_id}/agents` (`server.py:1851`). Falls back to text input if endpoint returns 503 (mirror T2-C convention).
- **Prompt**: `<textarea>` with 3-row default; resizable.
- **Depends on**: checkbox list rendering all *prior* step_ids (steps with index < current). Multi-select. Hidden if no prior steps.

### §4.2 Reorder mechanism (Planner decision)

**Up/down arrow buttons per row.** NOT drag-and-drop. Rationale: ~30 LOC saved, accessible by default, V23.6 React Flow inherently solves visual reorder.

### §4.3 Validation (client-side)

Before POSTing: name non-empty, steps.length >= 1, each step has agent_id + prompt non-empty.

NOT validated client-side: cycle detection (server authoritative), agent_id existence (dropdown is server-sourced), `image` validity.

### §4.4 Save flow

```
onSave():
  1. Run client validation; halt + inline errors if fail
  2. body = encodeFormToSpec(name, steps); body.company_id = companyId
  3. fetch('/api/workflows', POST, JSON.stringify(body))
  4. On 201: setSavedWorkflowId(json.id); toast saved; router.replace
  5. On 422: parse json.detail; toast `Save failed: ${detail}`; keep form editable
  6. On other error: toast "bridge unreachable"
```

### §4.5 Run flow

```
onRun():
  1. If !savedWorkflowId: toast "Save workflow first"; return
  2. fetch(`/api/workflows/${savedWorkflowId}`, PATCH, {status: 'running'})
  3. On 200: toast running; RunPanel already polling
  4. On 422: toast detail
  5. On 404: toast "Workflow not found — re-save"
```

---

## §5 RunPanel detail (`RunPanel.tsx`)

### §5.1 Polling pattern

```ts
useEffect(() => {
  if (!workflowId) return;
  let alive = true;
  const fetchStatus = async () => {
    try {
      const resp = await fetch(`/api/workflows/${workflowId}/status`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!alive) return;
      setStatus(json);
      setError(null);
    } catch (e) {
      if (!alive) return;
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  };
  fetchStatus();
  const timer = setInterval(fetchStatus, 2000);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}, [workflowId]);
```

### §5.2 Status badge mapping

```ts
const statusColor = {
  pending:    "var(--status-warn)",
  running:    "var(--status-running)",
  succeeded:  "var(--status-online)",
  failed:     "var(--status-error)",
  timeout:    "var(--status-error)",
  skipped:    "var(--fg3)",
};
```

CSS vars confirmed via Phase 0 Researcher grep.

### §5.3 Step row rendering

- Click row → toggle expanded
- Expanded `succeeded`: `started_at` + `finished_at` + duration
- Expanded `failed`/`timeout`: `error_json` in `<pre>` monospace
- `pending`/`running` non-expandable

### §5.4 Polling stop condition

Polling stops when `status.status ∈ {succeeded, failed, cancelled}`. Saves bridge load.

### §5.5 SSE alternative

Out of scope (master plan §1 SCOPE OUT).

---

## §6 API proxy routes

### §6.1 `app/api/workflows/route.ts` (POST + GET)

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildBridgeHeaders } from "@/lib/bridgeHeaders";

const BRIDGE_URL =
  process.env.MUSU_BRIDGE_URL ?? process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:8070";

async function proxy(req: NextRequest, method: "GET" | "POST"): Promise<NextResponse> {
  try {
    const target = new URL(`${BRIDGE_URL}/api/workflows`);
    req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const body = method === "POST" ? await req.text() : undefined;
    const res = await fetch(target.toString(), {
      method,
      headers: buildBridgeHeaders(process.env.MUSU_BRIDGE_TOKEN ?? ""),
      body,
      cache: "no-store",
    });
    const data = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { parsed = data; }
    return NextResponse.json(parsed, { status: res.status });
  } catch {
    return NextResponse.json({ error: "musu-bridge unavailable" }, { status: 503 });
  }
}

export const GET = (req: NextRequest) => proxy(req, "GET");
export const POST = (req: NextRequest) => proxy(req, "POST");
```

### §6.2 `app/api/workflows/[id]/route.ts` (GET + PATCH + DELETE)

Same shape; path interpolates `params.id`. PATCH body forwarded verbatim.

### §6.3 `app/api/workflows/[id]/status/route.ts` (GET only)

Narrowest handler; called every 2s by RunPanel.

### §6.4 Status passthrough

All routes passthrough status code from bridge (201/200/204/404/409/422). Body forwarded verbatim.

---

## §7 Tests

### §7.1 `workflow-spec.test.ts`

Test cases:
1. encode 3-step linear chain → 3 agents, 2 edges
2. encode diamond fan-out/in → 4 agents, 4 edges
3. encode 1-step solo → 1 agent, 0 edges
4. encode rejects empty name (throw)
5. encode rejects empty steps (throw)
6. encode rejects duplicate step_id (throw)
7. encode rejects depends_on to non-existent step (throw)
8. decode 3-step linear chain → 3 FormStep with correct depends_on
9. round-trip linear (encode → decode → compare)
10. round-trip diamond

Cycle behavior NOT in client tests (server authoritative per §3.6).

### §7.2 `e2e/workflows-form.spec.ts`

Playwright with `page.route()` bridge mocks (mirror `e2e/v23-fleet.spec.ts`):
1. happy path: fill 3 steps → save 201 → run 200 → poll until succeeded
2. cycle 422 shows error toast, form remains editable
3. empty form validation error on Save, no POST issued

---

## §8 Sub-task ordering (Builder execution)

| # | Task | LOC | Depends on |
|---|---|---|---|
| 1 | `workflow-spec.ts` encode/decode + helpers | ~70 | — |
| 2 | `workflow-spec.test.ts` | ~80 | (1) |
| 3 | `app/api/workflows/route.ts` | ~30 | — |
| 4 | `app/api/workflows/[id]/route.ts` | ~25 | — |
| 5 | `app/api/workflows/[id]/status/route.ts` | ~15 | — |
| 6 | `/c/[company]/workflows/page.tsx` | ~40 | (3) |
| 7 | `/c/[company]/workflows/[id]/page.tsx` | ~50 | — |
| 8 | `WorkflowFormClient.tsx` | ~120 | (1), (3), (4) |
| 9 | `RunPanel.tsx` | ~50 | (5) |
| 10 | `e2e/workflows-form.spec.ts` | ~40 | (6)-(9) |
| 11 | `npx tsc --noEmit` clean | — | all above |
| 12 | `npm run test:vocab` no regression | — | all above |
| 13 | Fix defects, run Playwright lane | — | all above |

Total Builder LOC: ~520. Single `/loop` iteration target.

---

## §9 Const-gates + risks

### §9.1 Const-gates

- **Const III**: N/A (schema v37 already applied during T2-A' ship)
- **Const VI**: N/A
- **Const VII**: per-push ACTIVE; main-merge gate at Phase 4 close

### §9.2 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `depends_on` UI confusion | MED | Auto-numbered step_ids visible as row label; checkbox list shows step_id + agent_role inline; copy "Run after these steps complete" |
| R2 | Cycle detection lag (server-side only) | LOW-MED | Backend error message displayed verbatim in toast; user manually fixes. Per-edge highlighting deferred V23.6 |
| R3 | `agent_role` options stale | LOW | Refresh on form mount; free-text fallback if endpoint 503 |
| R4 | Polling cleanup on unmount leak | LOW | `alive` boolean closure + `clearInterval` in cleanup; Auditor verifies via grep |
| R5 | Reorder regression: depends_on stale references | MED | React `key` (UUID) is stable identity; depends_on stored by key, translated to step_id at encode time |
| R6 | LOC overrun (520 vs ~400 budget) | LOW | Documented in §2; fallback: collapse proxy split → recover ~70 LOC |
| R7 | Agent dropdown empty when company has no agents | LOW | Empty-state CTA "Add an agent in Fleet view"; free-text fallback |
| R8 | Master plan §5.D referenced `/run` endpoint that doesn't exist | INFO (resolved) | T2-A' uses PATCH status=running; this plan §4.5 uses PATCH |

---

## §10 V23.6 forward-pointer (T2-D-visual)

When closed beta dogfood signals demand for visual graph editor:

- **Files reused unchanged**: `workflow-spec.ts`, `RunPanel.tsx`, all 3 proxy routes, all tests
- **New files (~1100 LOC)**: `EditorClient.tsx`, `NodePalette.tsx`, `AgentNode.tsx`, `useWorkflowGraph.ts`
- **New dep**: `@xyflow/react ^12.x`
- **Gate**: ≥2 of 5 closed beta users request visual graph
- **Co-existence**: tldraw stays in `/c/[id]`; React Flow in `/c/[company]/workflows/[id]`; `next/dynamic` code-split

---

## §11 Critic findings (resolved)

_Empty header; populated by Phase 1.5 Critic._

---

## §12 References

- `V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.D (T2-D-mini scope reshaped 2026-05-19)
- Phase 0 Researcher findings (preceding turn): API contract, file reuse map, server-side cycle validation, status badge CSS vars, polling pattern
- `musu-bridge/workflow_routes.py` (T2-A' API; all 8 endpoints + Pydantic models)
- `musu-core/src/musu_core/migrations.py:1446-1563` (schema v37)
- `musu-bee/src/app/c/[id]/page.tsx` (status dot, alive polling pattern reference)
- `musu-bee/src/app/api/bridge/[...path]/route.ts` (proxy idiom)
- `musu-bee/src/lib/bridgeHeaders.ts` (`buildBridgeHeaders`)
- `musu-bee/e2e/v23-fleet.spec.ts` (Playwright bridge-mock pattern)
- `musu-bridge/server.py:1851` (`GET /api/companies/{id}/agents` for dropdown)
- `MODE_Agent_Team.md` Phase 1 → Phase 1.5 Critic → Phase 3 Builder
- [[feedback-no-yagni-architecture]] (rationale for mini over keep)

---

## Revision history

| Rev | Date | Change | Trigger |
|---|---|---|---|
| v1 | 2026-05-19 | Initial T2-D-mini detail plan per master plan §5.D reshape | grilling Q3 (user chose mini) |
