# MUSU Pro Command Center Master Plan

Date: 2026-05-12  
Owner: MUSU operator / Codex  
Status: active master plan

## Goal
Turn `musu.pro` into the real control plane for MUSU: a protected operator surface where a user can see machines, agents, tasks, costs, relay state, failures, and safe recovery actions.

The product is not a decorative dashboard. The operating loop is:

```text
goal -> action -> observation -> outcome -> correction -> audit
```

`vibecode.town` explains and proves the intelligence. `musu.pro` gives the user control over it.

## Current Code Situation

### Live site
- `https://musu.pro/` is live and public.
- `/dashboard` exists and redirects unauthenticated users to `/login?redirect=%2Fdashboard`.
- `/workspace` exists and redirects unauthenticated users to `/login?redirect=/workspace`.
- `/app` returns 404 on live.
- Public routes `/docs`, `/how-it-works`, `/pricing`, and `/market` return 200.
- Protected APIs exist and return `401 {"error":"Not authenticated"}` when unauthenticated:
  - `/api/bridge/agents`
  - `/api/account/relay-token`
  - `/api/nodes`
  - `/api/bridge/watchdog`

### Accessible local source
- Primary editable repo: `/home/hugh51/musu-functions/musu-bee`
- Backup/bridge mirror: `/home/hugh51/.musu/bridge/musu-bee`
- Both accessible trees differ from the live deployment:
  - Local has `/auth/login`, live has `/login`.
  - Local currently has `/app`, live `/app` is 404.
  - Local accessible tree does not contain live `/workspace`.
  - Live has `/api/account/relay-token`; local accessible tree does not.

### Local changes already present
- `/dashboard` server page renders `DashboardClient`.
- Dashboard components exist under `src/components/dashboard/`.
- `auth-server.ts` and `nodes-server.ts` exist.
- `middleware.ts` protects `/dashboard`.
- `npm run typecheck` and `npm run build` passed on local `musu-bee`.

### Known local defects
- `src/app/globals.css` has `n@keyframes musu-status-pulse`.
- `src/app/auth/login/page.tsx` ignores `next=/dashboard` and pushes `/app`.
- `nodes-server.ts` sets `last_seen` to `new Date()` for every node, so offline machines can appear online.
- `DashboardClient` calls `/api/account/relay-token`, but local accessible source lacks that route.
- `DashboardClient` calls `/api/bridge/watchdog?node=...&cmd=...`, while local bridge expects `/api/watchdog/{node}/status` and `/api/watchdog/{node}/{command}`.
- New dashboard files are untracked in the current worktree.
- `musu-bridge/server.py`, `tsconfig.tsbuildinfo`, and `bridge_emergency.log` changes are present but not part of the dashboard scope.

### Local fixes completed on 2026-05-12
- `/auth/login` now honors `next`/`redirect` return paths.
- `n@keyframes musu-status-pulse` was corrected to `@keyframes`.
- `/api/account/relay-token` was added locally and fails closed when unauthenticated or unconfigured.
- `/api/bridge/watchdog` was added locally to adapt dashboard query calls to the bridge watchdog path contract.
- `nodes-server.ts` now probes node `/health` and does not fabricate `last_seen` for every configured node.
- Watchdog route unit tests, `npm run typecheck`, `npm run build`, and local `next start` smoke tests pass locally.

### P1 local fixes completed on 2026-05-12
- `/login` was added as the live-compatible login entry and forwards safely to `/auth/login`.
- Middleware now protects `/workspace` as well as `/dashboard` and `/app`.
- `/dashboard` and `/workspace` redirect unauthenticated users to `/login?redirect=...`.
- `/workspace` was added locally and backed by the existing execution surface.
- `/app` remains a legacy local route until source-of-truth alignment is complete.

### P4 local fixes completed on 2026-05-12
- Watchdog API now returns 401 before request validation when unauthenticated.
- Request-scoped API auth helper was added for route handlers.
- Watchdog POST writes JSONL audit events to `~/.musu/audit/command-center.jsonl`.
- Watchdog tests now cover unauthenticated 401, authenticated validation, bridge proxying, and audit writes.

## Non-Negotiable Principle
Do not claim "READY" until the exact deployed source is identified and the authenticated dashboard/workspace path is smoke-tested.

The current state is:

```text
live route shell: present
local dashboard prototype: compiles
source-of-truth alignment: unresolved
authenticated runtime behavior: not yet verified
```

## Phases

### P0 — Source Alignment and Runtime Contract
Purpose: make sure we are changing the code that actually ships.

Tasks:
- Identify the canonical source for live `musu.pro`.
- Decide whether `/home/hugh51/musu-functions/musu-bee` is stale, forked, or partially synced.
- Preserve current local dashboard work as a branch/patch before any large move.
- Map live routes to source files: `/login`, `/workspace`, `/dashboard`, `/api/account/relay-token`, `/api/bridge/[...path]`, `/api/nodes`.
- Write a route/API contract test matrix.

Exit criteria:
- One canonical repo/path is named.
- Local source route tree matches live route tree or a migration plan exists.
- Protected route behavior is documented for unauthenticated and authenticated users.

### P1 — Auth and Navigation Coherence
Purpose: remove split-brain login behavior.

Tasks:
- Support `/login?redirect=...` or intentionally redirect it to `/auth/login?next=...`.
- Make email login and OAuth honor the requested return path.
- Make `/dashboard` and `/workspace` consistent in middleware and server components.
- Remove or redirect `/app` if it is not part of the live product.

Exit criteria:
- `/dashboard` unauth -> login -> `/dashboard`.
- `/workspace` unauth -> login -> `/workspace`.
- No dead dashboard entry points.

### P2 — Dashboard API Contract
Purpose: make cards/buttons reflect real systems, not fake freshness.

Tasks:
- Add or align `/api/account/relay-token`.
- Add a watchdog adapter route or change the client to call the bridge shape.
- Stop generating fake `last_seen`.
- Distinguish `online`, `stale`, `offline`, `unknown`, and `auth missing`.
- Add explicit error states for bridge unavailable and relay unavailable.

Exit criteria:
- Node status is based on real source timestamps or health checks.
- Watchdog status and commands hit the correct bridge endpoints.
- Relay status can be authenticated and tested.

### P3 — Workspace Surface
Purpose: define what `/workspace` does as separate from `/dashboard`.

Working definition:
- `/dashboard`: fleet/agent/ops cockpit.
- `/workspace`: active work execution surface: current project, task context, artifacts, run timeline, approvals, and human intervention.

Tasks:
- Inventory live `/workspace` behavior after authenticated access.
- Map workspace data model to `run_id`, `trace_id`, `task_id`, `project_id`, `company_id`.
- Define workspace empty state, active run state, and failure state.

Exit criteria:
- `/workspace` has a documented product role.
- It is not a duplicate dashboard.

### P4 — Audit, Safety, and Experience Ledger
Purpose: make MUSU an experience-based control plane.

Tasks:
- Audit every dashboard action: actor, node, command, before, after, result, timestamp, trace/run id.
- Add a run ledger: goal, action, observation, prediction, actual outcome, correction.
- Separate AI claims from verified observations.
- Add promotion policy for wiki/memory: draft -> reviewed -> verified -> canonical.

Exit criteria:
- A user can answer what happened, who did it, why it happened, and what changed afterward.

## Execution Board

| ID | Phase | Task | Status |
|---|---|---|---|
| CC-000 | P0 | Write master plan | done |
| CC-001 | P0 | Write source-alignment detail plan | pending |
| CC-002 | P0 | Identify live source path/repo | in_progress |
| CC-003 | P0 | Preserve current dashboard prototype patch | pending |
| CC-004 | P1 | Fix local login return path | done |
| CC-004a | P1 | Add live-compatible `/login` route | done |
| CC-004b | P1 | Add protected `/workspace` route | done |
| CC-005 | P2 | Fix `n@keyframes` typo | done |
| CC-006 | P2 | Add/align relay token route | done |
| CC-007 | P2 | Align watchdog API shape | done |
| CC-008 | P2 | Replace fake node freshness | done |
| CC-009 | P3 | Define `/workspace` role and route contract | pending |
| CC-010 | P4 | Add audit log contract for control actions | done |

## Verification Gates
- Local: `npm run typecheck`
- Local: `npm run build`
- Route: unauthenticated `curl -I` for `/dashboard`, `/workspace`, `/api/*`
- Browser: authenticated Playwright smoke test once credentials/session are available
- Live: compare `x-matched-path`, redirects, and visible page states against this plan

## Rule for Future Sub-Plans
Each implementation slice gets its own detail plan in this directory before code changes:

```text
docs/command-center/P{N}_{short_name}_YYYY_MM_DD.md
```

Each detail plan must include:
- files owned
- exact acceptance criteria
- tests to run
- rollback notes
- live verification notes
