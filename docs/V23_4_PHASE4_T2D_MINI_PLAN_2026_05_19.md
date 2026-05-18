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
5. User fills name "Daily summary" + adds 3 step rows (post Critic C1 fix — agent_id IS identity, no step-N synthesis):
   - row 0 (UI label "Row 1"): agent_id=`writer`, prompt="Summarize today's commits", depends_on=`[]`
   - row 1 (UI label "Row 2"): agent_id=`reviewer`, prompt="Review summary for clarity", depends_on=`["writer"]`
   - row 2 (UI label "Row 3"): agent_id=`publisher`, prompt="Post to slack", depends_on=`["reviewer"]`
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
| 8 | `musu-bee/src/app/c/[company]/workflows/[id]/WorkflowFormClient.tsx` | NEW | ~110 | Orchestration only — name input + Add Step + Save + Run + 422 toast. Per-row controls split to StepRow.tsx |
| 8b | `musu-bee/src/app/c/[company]/workflows/[id]/StepRow.tsx` | NEW | ~70 | Per-row component: agent dropdown + prompt textarea + depends_on checkboxes + ↑↓✕ buttons. Critic C9 split for complexity-mgmt |
| 9 | `musu-bee/src/app/c/[company]/workflows/[id]/RunPanel.tsx` | NEW | ~50 | Polls `/status` every 2000ms; renders step badges; click expands |
| 10 | `musu-bee/e2e/workflows-form.spec.ts` | NEW | ~40 | Playwright: happy path + cycle 422 + empty form validation, mocked |

**Total**: ~560 LOC across 11 files (v2 added StepRow.tsx split per Critic C9 + revised WorkflowFormClient down to ~110 LOC). Net delta vs master plan ~400: +160. Documented breakdown:
- Proxy split into 3 narrow files (+45)
- `topoOrder` helper in workflow-spec.ts (+25)
- Robust test coverage incl. C3 reorder + C6 empty-agents (+60)
- StepRow.tsx component split for complexity mgmt per Critic C9 (+30; offset by -10 in WorkflowFormClient)

**LOC contingency** (if real LOC overruns): collapse 3 proxy files into single `[...path]` reuse → recovers ~70 LOC.

### §2.1 Files NOT created

`EditorClient.tsx`, `NodePalette.tsx`, `AgentNode.tsx`, `workflow-graph.ts`, `@xyflow/react` dep — all V23.6 T2-D-visual scope.

---

## §3 WorkflowSpec encode/decode logic (`workflow-spec.ts`)

### §3.1 Form data model (v2 — Critic C1 fix)

**Critic C1 found HIGH bug in v1**: original spec had separate `step_id` (UI label) and `agent_id` (real agent role); encode hardcoded `agents[].id = step.step_id`, discarding the real agent_id. T2-A' executor (`workflow_executor.py:285`) calls `enqueue_wake(agent_id=step["agent_id"])` where `step["agent_id"]` comes from `workflow_steps.agent_id` written from `AgentSpec.id`. So shipping v1 encode would dispatch to nonexistent agent "step-1" instead of real "writer".

**v2 fix**: drop `step_id` from FormStep entirely. `agent_id` IS the identity. UI shows row position ("Row 1", "Row 2") as separate display-only label, derived from array index.

```ts
export interface FormStep {
  // Stable React identity (UUID generated at row-add time).
  // Used internally for reorder tracking; NEVER sent to backend.
  reactKey: string;

  // Real agent role / identity from company's agents table.
  // Becomes AgentSpec.id directly. Must match server regex
  // ^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$ (max 63 chars, single-char OK per Critic C11).
  // Must be unique across steps (enforced both client-side and by executor).
  agent_id: string;

  // User-authored instruction. Becomes AgentSpec.command = [prompt].
  prompt: string;

  // agent_ids of upstream steps this step depends on.
  // Stored by agent_id (stable, since agent_id is the identity).
  depends_on: string[];
}

export interface WorkflowFormState {
  name: string;
  steps: FormStep[];
}
```

**Implications**:
- Each step's row label in UI = `"Row " + (index + 1)`. No `step-1` style auto-generated identifier.
- `depends_on` is array of `agent_id` strings (e.g. `["writer", "reviewer"]`), not synthetic `step-N` IDs.
- Reorder swaps array entries; React `key={step.reactKey}` keeps row identity stable across reorder without renaming agent_ids.
- Uniqueness constraint: same agent_id can't appear in two rows (enforces "one row per agent role per workflow" — semantically matches executor's dispatch model).

### §3.1.b OQ-OPEN: should single agent_id appear in 2 steps? Decision

Critic C1 OQ: "should same agent_id appear in 2 rows?" Planner v2 decision: **NO** — enforce uniqueness client-side. Rationale:
- T2-A' executor uses `agent_id` as primary dispatch key. Two steps with same `agent_id` cannot be told apart.
- Workflow semantics: "writer agent runs 'summarize' then 'rewrite' as two steps" — backend treats this as TWO separate workflow_steps rows with same agent_id, which IS valid SQL-wise but creates dispatch ambiguity (which step's command goes first when same agent enqueued twice?).
- For mini scope, force unique agent_ids. If user wants writer twice, they create separate company-level agents (`writer`, `writer-2`) via Fleet view.
- V23.6 visual editor can revisit if dogfood shows demand.

### §3.2 Backend WorkflowSpec shape (read from `workflow_routes.py:107-170`)

```python
class WorkflowSpec(BaseModel):
    agents: list[AgentSpec] = Field(min_length=1)
    edges: list[EdgeSpec] = Field(default_factory=list)

class AgentSpec(BaseModel):
    id: str            # pattern ^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$ (max 63; single-char OK per Critic C11)
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

### §3.3 Encode logic (v2 — Critic C1 fix)

```
encodeFormToSpec(name, steps): {name, spec: WorkflowSpec}
  1. Client validation:
     - name non-empty (throw "name required")
     - steps.length >= 1 (throw "at least one step required")
     - each step.agent_id matches pattern ^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$
       (throw "invalid agent_id: X")
     - agent_ids unique across steps (throw "duplicate agent: X" — see §3.1.b)
     - each step.agent_id + step.prompt non-empty
     - each step.depends_on[i] references existing step.agent_id (throw "unknown
       dependency: X")
  2. Build agents array:
     for step in steps:
       agents.push({
         id: step.agent_id,           // ← Critic C1 fix: real agent identity
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
         edges.push({from: upstream, to: step.agent_id, condition: "succeeded"})
  4. Return {name, spec: {agents, edges}}
```

**Reorder consequence**: agent_ids are stable identity (NOT regenerated on reorder). depends_on references survive reorder unchanged. encode emits edges using current agent_ids — which are the same agent_ids regardless of row order. ✓

### §3.4 Decode logic (v2 — Critic C1 fix)

```
decodeSpecToForm(spec): FormStep[]
  1. Build reverse-edge map: depends_on[agent_id] = []
     for edge in spec.edges:
       depends_on[edge.to].push(edge.from)
  2. For each agent in topoOrder(spec.agents, spec.edges):
     formStep = {
       reactKey: crypto.randomUUID(),       // fresh stable key for new row
       agent_id: agent.id,                  // ← Critic C1: real agent identity
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

### §4.1 Step row controls (v2 — Critic C1 fix)

- **Row label**: "Row {N}" where N is 1-indexed array position. Display-only, regenerates on reorder. NOT a backend identifier.
- **Agent dropdown**: populated by `GET /api/companies/{company_id}/agents` (`server.py:1851`). Each option shows `agent.name` with `value={agent.id}`. Selected `agent.id` becomes `FormStep.agent_id`. Falls back to text input if endpoint returns 503 OR returns empty list (Critic C6 — must support 0-agent company onboarding). Free-text input validates against AgentSpec.id regex.
- **Prompt**: `<textarea>` with 3-row default; resizable.
- **Depends on**: checkbox list rendering `agent_id` of all *prior* rows (rows with index < current). Multi-select. Hidden if no prior rows.
- **Uniqueness enforcement** (Critic C1 §3.1.b): if user picks the same agent_id in two rows, validation error on Save with inline highlight. UI prevents picking same agent_id from dropdown if already selected in another row.

### §4.2 Reorder mechanism (Planner decision + Critic C8 a11y fix)

**Up/down arrow buttons per row.** NOT drag-and-drop. Rationale: ~30 LOC saved, accessible by default, V23.6 React Flow inherently solves visual reorder.

Accessibility (Critic C8):
- `<button aria-label="Move row up">↑</button>` (disabled at first row)
- `<button aria-label="Move row down">↓</button>` (disabled at last row)
- `<button aria-label="Delete row {N}">✕</button>` includes row position for context

Reorder swaps array entries. `agent_id` (identity) does NOT change. `depends_on` references stay valid (they're stored by `agent_id`, not by row position). React `key={step.reactKey}` ensures React doesn't recycle DOM nodes incorrectly during swap.

### §4.3 Validation (client-side)

Before POSTing: name non-empty, steps.length >= 1, each step has agent_id + prompt non-empty.

NOT validated client-side: cycle detection (server authoritative), agent_id existence (dropdown is server-sourced), `image` validity.

### §4.4 Save flow

```
onSave(): returns {ok: boolean, id?: string}
  1. Run client validation; halt + inline errors if fail → return {ok: false}
  2. body = encodeFormToSpec(name, steps); body.company_id = companyId
  3. resp = fetch('/api/workflows', POST, JSON.stringify(body))
  4. On 201: setSavedWorkflowId(json.id); toast saved; router.replace; return {ok: true, id: json.id}
  5. On 422: parse json.detail; toast `Save failed: ${detail}`; keep form editable; return {ok: false}
  6. On other error: toast "bridge unreachable"; return {ok: false}
```

### §4.5 Run flow (v2 — Critic C7 race fix)

```
onRun(id?: string):
  // id parameter avoids race: caller passes savedWorkflowId from chained Save
  const wfId = id ?? savedWorkflowId;
  1. If !wfId: toast "Save workflow first"; return
  2. fetch(`/api/workflows/${wfId}`, PATCH, {status: 'running'})
  3. On 200: toast running; RunPanel already polling (if mounted)
  4. On 422: toast detail
  5. On 404: toast "Workflow not found — re-save"
```

### §4.6 Save-and-Run combined flow (Critic C7)

```
onSaveAndRun():
  const result = await onSave();
  if (result.ok) await onRun(result.id);  // pass id directly, no race
```

UI: separate Save and Run buttons (existing), plus optional "Save and Run" combined button that chains both. The combined path uses the returned id directly, bypassing React state flush.

Run button is `disabled` when `!savedWorkflowId` (visual cue + prevents standalone race).

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

### §6.0 Env var convention (Critic C2 + C10)

`BRIDGE_URL` (server-side proxy URL) uses `MUSU_BRIDGE_URL` (server env, no `NEXT_PUBLIC_` prefix) primary, `NEXT_PUBLIC_BRIDGE_URL` (public) fallback for dev. `MUSU_BRIDGE_TOKEN` is **server-only** (NEVER `NEXT_PUBLIC_*`) — verified safe to embed in proxy route handler. Existing musu-bee codebase has two divergent conventions (`NEXT_PUBLIC_BRIDGE_URL` in catch-all proxy, `NEXT_PUBLIC_MUSU_BRIDGE_URL` in `/c/[id]/page.tsx` direct fetches). T2-D-mini server-side proxies use `NEXT_PUBLIC_BRIDGE_URL` (matches catch-all). Future unification deferred V23.6.

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

### §7.1 `workflow-spec.test.ts` (v2 — Critic C3 + C11 fixes)

Test cases:
1. encode 3-step linear chain → 3 agents (id=agent_id), 2 edges
2. encode diamond fan-out/in → 4 agents, 4 edges
3. encode 1-step solo → 1 agent, 0 edges (incl single-char agent_id per Critic C11)
4. encode rejects empty name (throw)
5. encode rejects empty steps (throw)
6. encode rejects duplicate **agent_id** (throw, per §3.1.b uniqueness)
7. encode rejects depends_on to non-existent agent_id (throw)
8. encode rejects invalid agent_id regex (uppercase, dots, etc.)
9. decode 3-step linear chain → 3 FormStep with correct depends_on (by agent_id, not step_id)
10. round-trip linear (encode → decode → compare; assert agent_id preserved)
11. round-trip diamond
12. **(Critic C3 NEW)** reorder simulation: swap rows 1 and 3, encode emits edges using current agent_ids (unchanged because agent_id IS identity)
13. **(Critic C3 NEW)** decode of spec with `condition="failed"` edge — agent_id correctly populated, condition silently dropped (document lossiness in test message)

Cycle behavior NOT in client tests (server authoritative per §3.6; server cycle handler tested in `musu-bridge/tests/test_workflow_routes.py`).

### §7.2 `e2e/workflows-form.spec.ts` (v2 — Critic C4 + C6 fixes)

Playwright with `page.route()` bridge mocks (mirror `e2e/v23-fleet.spec.ts`):
1. **happy path**: fill 3 steps (writer/reviewer/publisher) → save 201 → run 200 → poll until succeeded.
   **Critic C4 fix**: assert PATCH request body exactly equals `{status: "running"}` (not wrapped, not extra fields).
2. **cycle 422**: form with cyclic depends_on → POST → backend 422 → error toast shows backend message verbatim → form remains editable
3. **empty form validation**: click Save with no name + no steps → inline validation errors → POST NOT issued (verify via stub call count)
4. **(Critic C6 NEW)** **empty company.agents fallback**: stub `/api/companies/X/agents` → returns `[]` → form shows "Add an agent in Fleet view" CTA + free-text input fallback works → user types `custom-agent` → Save succeeds (POST 201 with that agent_id)
5. **(Critic C4 NEW)** **polling stop condition**: after status reaches `succeeded`, verify polling stops (no further `/status` GETs within 5s window)

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

Phase 1.5 Critic (system-architect) reviewed wiki/435 v1 and returned 1 HIGH + 4 MED + 4 LOW + 2 INFO. All resolved in v2:

| ID | Sev | Finding | Resolution (v2) |
|---|---|---|---|
| **C1** | **HIGH** | `agents[].id = step.step_id` discards real agent_id; executor would dispatch to nonexistent "step-1" | **Plan rewritten**: dropped `step_id` from FormStep entirely. `agent_id` IS identity. UI shows "Row N" as display-only label. §3.1/§3.3/§3.4/§1.1/§4.1 updated. §3.1.b decision: agent_id unique per workflow |
| C2 | MED | env var name divergence in codebase | §6.0 documents convention; future unification noted (no V23.5 work) |
| C3 | MED | Missing reorder/round-trip + condition-lossiness tests | §7.1 tests 12+13 added |
| C4 | MED | §7.2 Playwright missing PATCH-body assertion | §7.2 test 1 asserts `expect(JSON.parse(req.postData())).toEqual({status: "running"})`; new test 5 polling-stop |
| C5 | MED | Master plan §5.D references `/run` endpoint (doesn't exist) | Master plan amendment to be included in wiki/439 closure PR (1-line edit) |
| C6 | LOW | Empty company.agents Playwright case missing | §7.2 test 4 added |
| C7 | LOW | Save→Run race (state flush timing) | §4.4 returns `{ok, id}`; §4.5 takes optional `id` param; §4.6 Save-and-Run chained path bypasses React state. Run button disabled when `!savedWorkflowId` |
| C8 | LOW | Reorder buttons missing aria-labels | §4.2 specifies `aria-label="Move row up/down/Delete row N"` |
| C9 | LOW | WorkflowFormClient 120 LOC underbudgeted for 10 features | §2 split into WorkflowFormClient (~110 orchestration) + StepRow.tsx (~70 per-row) |
| C10 | INFO | Env var safety (server vs client) | §6.0 documents: token is server-only |
| C11 | INFO | AgentSpec.id regex slightly wrong in §3.2 doc | §3.2 regex fixed to include `\|^[a-z0-9]$` single-char branch |

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
| **v2** | 2026-05-19 | Critic 1 HIGH (C1 agent_id identity) + 4 MED + 4 LOW + 2 INFO applied | Phase 1.5 Critic findings |
