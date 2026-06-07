# AG UI/UX Control-Plane Design

Generated: 2026-06-07 KST

## Scope

`AG` means Agent Grid: the MUSU experience for sending work to local AI agents,
watching their progress, coordinating project rooms, and proving where work ran.

This design is for MUSU.PRO plus MUSU Desktop together:

- MUSU.PRO receives user input from web/mobile/remote surfaces.
- MUSU Desktop on each device executes work locally.
- MUSU.PRO can coordinate rooms, presence, rendezvous, path selection, relay
  fallback, and evidence.
- MUSU.PRO must not present itself as the runtime that executed local work.

## SaaS Landscape Research

Sources checked on 2026-06-07:

- OpenAI Codex product page:
  `https://openai.com/codex/`
- OpenAI Codex help:
  `https://help.openai.com/en/articles/11369540-getting-started-with-codex`
- GitHub Copilot cloud agent docs:
  `https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent`
- Cursor background agents docs:
  `https://docs.cursor.com/background-agent`
- Google Jules docs:
  `https://jules.google/docs/`
- Devin docs:
  `https://docs.devin.ai/get-started/devin-intro`
- Replit Agent docs:
  `https://docs.replit.com/references/agent/overview`

Observed patterns:

| Service | Execution model | UX pattern | Lesson for MUSU |
|---|---|---|---|
| OpenAI Codex | connected local/cloud agent surfaces | command center, parallel agents, skills, background work | MUSU needs a command center, but must show local device ownership rather than only cloud worktrees. |
| GitHub Copilot cloud agent | GitHub Actions powered ephemeral environment | issue/PR workflow, plan, branch, logs, PR review | MUSU should expose plan, branch/artifact, review, and audit trails; every task needs a clear handoff object. |
| Cursor background agents | remote async environment connected to IDE/web/mobile | background-agent sidebar, status, follow-ups, take-over | MUSU should support remote input and follow-ups, but the take-over target is a local device/runtime. |
| Google Jules | cloud VM that clones repos | repo selector, branch selector, plan approval, notifications | MUSU needs repo/project selectors, plan approval, and completion notifications before local execution feels safe. |
| Devin | autonomous software engineer with CLI/desktop/cloud/integrations | team workflow, tickets, integrations, backlog work | MUSU should model agents as team members tied to rooms, tickets, and local capabilities. |
| Replit Agent | hosted workspace and deployment flow | natural-language build flow, plan mode, design preview | MUSU can borrow plain-language ordering and preview, but must avoid hiding infra/runtime location. |

Competitive gap for MUSU:

Most comparable SaaS products make cloud execution feel simple. MUSU should make
distributed local execution feel just as simple while making execution location,
device identity, route path, and evidence more visible than competitors do.

## Product Position

MUSU should feel like an operator cockpit for "my AI company running across my
own machines."

Primary promise:

> Order work from anywhere. Your local MUSU devices do the work. MUSU.PRO
> coordinates the room, route, and evidence.

Non-goals:

- Do not present MUSU.PRO as the compute/runtime.
- Do not hide whether a task is waiting on a local machine.
- Do not use a generic chatbot layout as the primary product.
- Do not make `localhost:3001` a user-facing release concept.

## Information Architecture

Top-level navigation:

- Command Center
- Project Rooms
- Agent Grid
- Devices
- Tasks
- Evidence
- Settings

Persistent surfaces:

- left rail: workspace, rooms, device fleet, agent groups
- center workspace: selected room/task/device/evidence view
- right console: command composer, selected run timeline, approvals, logs

The first screen after login should be Command Center, not a marketing page.

## Core Objects

| Object | User-facing meaning | Required visible fields |
|---|---|---|
| Project room | shared work context for humans and agents | room name, project, active agents, open orders, decisions, artifacts |
| Agent | AI worker connected to a local runtime or toolchain | name, role, model/tool, assigned device, permissions, current state |
| Device | local MUSU runtime endpoint | device name, owner, online/offline, CPU/memory, version, route candidates |
| Order | user request from web/mobile/desktop | prompt, room, target agents/devices, required approval, privacy mode |
| Run | execution attempt on a local device | status, plan, device, route kind, logs, artifacts, evidence |
| Evidence | proof that work used the expected path | CPU, route kind, peer identity, encryption, relay proof, audit log |

## Key Screens

### 1. Command Center

Purpose: give one place to order work and understand what is running.

Layout:

- left: active rooms, pinned devices, saved agent groups
- center top: order composer with room/device/agent scope controls
- center body: active run table grouped by room
- right: selected run timeline and required approvals

Essential controls:

- room selector
- target selector: `Best device`, specific device, agent group
- execution path selector: `Prefer direct`, `Allow relay fallback`, `Local only`
- approval toggle for write/file/command/network actions
- budget controls: max time, max spend, max CPU, max parallel agents

Status badges:

- `Local`
- `LAN`
- `Tailscale`
- `Direct QUIC`
- `Relay`
- `Waiting for device`
- `Needs approval`
- `Evidence missing`

### 2. Project Room

Purpose: the "company meeting room" where humans and local agents coordinate.

Room layout:

- agenda lane: current goal, decisions needed, blockers
- discussion lane: human messages and agent updates
- work board: orders, runs, artifacts, PRs/files, evidence
- roster: humans, agents, devices, route state

Room rules:

- agents can propose plans, split tasks, and request approval;
- only approved work orders reach local runtimes;
- every accepted/rejected order writes command audit metadata;
- room state is metadata/control plane, not payload execution.

### 3. Agent Grid

Purpose: manage agents as a team, not as anonymous chat threads.

Views:

- grid/list of agents with role, skill, device, status, permissions
- capability matrix: coding, research, docs, QA, design, operations
- assignment view: agent to room, agent to device, agent to task

Agent cards should be compact and operational:

- name and role
- online/running/blocked state
- assigned device
- current run
- permission tier
- last evidence timestamp

### 4. Device Mesh

Purpose: make local execution and P2P route state understandable.

Device list columns:

- device
- version
- local runtime status
- desktop shell status
- CPU/memory baseline
- route candidates: LAN, Tailscale, public endpoint, relay
- last successful route kind
- last evidence

Device detail tabs:

- Overview
- Runtime
- Routes
- Agents
- Evidence
- Logs

Route view:

- candidate graph: `LAN -> Tailscale -> Direct QUIC -> Relay`
- current path badge
- handshake result
- peer identity
- encryption proof
- latency
- reason for fallback

### 5. Run Timeline

Purpose: make async local work inspectable.

Timeline stages:

1. order received
2. room policy checked
3. device selected
4. route selected
5. plan generated
6. approval requested
7. local runtime executing
8. tests/checks
9. artifacts/evidence attached
10. done/blocked

Every stage should show:

- timestamp
- actor: human, MUSU.PRO, local bridge, agent
- location: web/control plane or local device
- evidence link when applicable

### 6. Evidence Center

Purpose: make release and trust gates first-class.

Evidence views:

- Runtime CPU
- Process ownership
- Single instance
- Route/P2P
- Relay fallback
- Command audit
- Store/support evidence

Each row should show:

- gate name
- status
- machine count
- latest evidence timestamp
- current commit/build
- blocker count
- next action

This is where "No-Go" should be explainable without opening raw JSON.

### 7. MUSU Desktop Mini Console

Purpose: keep local state visible without turning desktop into a web dashboard.

Surface:

- tray/window mini console
- device name and account
- bridge status
- current room/order count
- local CPU/memory baseline
- connected peers
- pause local execution
- open logs/evidence folder

This console should say "Local runtime" clearly. It should not advertise
`localhost:3001` as the user flow.

## UX Rules

### Execution Location Must Be Explicit

Every run needs a visible line:

- "Input from MUSU.PRO"
- "Execution on HUGH_SECOND"
- "Route: LAN/direct/relay"
- "Evidence: available/missing"

### Control Plane Must Not Look Like Compute

MUSU.PRO screens should use labels like:

- `Submitted`
- `Rendezvous`
- `Route selected`
- `Delivered to local runtime`
- `Awaiting local result`

Avoid labels that imply hosted execution:

- `Running on MUSU.PRO`
- `Cloud worker`
- `Hosted task`

### Ask Less, Show More

The default user flow:

1. choose room
2. type order
3. accept plan or set auto-approval policy
4. watch local device progress
5. review evidence/artifacts

Advanced network fields should be progressive disclosure unless something fails.

### Make Blockers Actionable

A blocked run should say:

- what failed
- which device owns the fix
- whether MUSU.PRO can help with rendezvous/relay
- whether a paid relay feature is required
- the exact next action

Example:

`HUGH-MAIN is registered but not reachable at 192.168.1.192:8949. Install/start
current MUSU Desktop on HUGH-MAIN or enable Connect relay fallback.`

## Visual System

Use the existing MUSU design system:

- light neo-brutalist control-room style
- strong black structure
- orange for important action/selection
- compact tables and panels
- hard shadows only
- no gradient orbs, bokeh, or marketing hero treatment inside the app

Recommended screen density:

- Command Center: dense table plus right run console
- Project Room: medium density discussion plus task/evidence board
- Device Mesh: table-first, graph second
- Evidence Center: table-first, JSON/detail drawer second

## Permission Model UX

Every order has a visible permission envelope:

- read-only
- local files
- command execution
- network access
- relay fallback
- secret access
- external service access

Approval prompts should show:

- agent
- local device
- command/tool/action
- affected files/services
- route/path
- timeout and cancellation
- audit destination

## Plan For Implementation

Phase 1: clickable IA and copy

- Command Center wireframe
- Project Room wireframe
- Device Mesh wireframe
- Evidence Center wireframe
- Desktop Mini Console wireframe

Phase 2: data contracts

- room/order/run/evidence view models
- route badge taxonomy
- blocker taxonomy
- approval envelope schema

Phase 3: implementation

- MUSU.PRO remote input and room UI
- local desktop mini console
- device mesh route state
- evidence center
- notifications and run handoff

Phase 4: release proof

- visual gates must map to existing verifier outputs
- every UI "ready" state must be backed by release evidence
- second-PC and relay proof must be visible in Evidence Center

## Design Audit Checklist

- Can a user tell where work will run before submitting?
- Can a user tell whether MUSU.PRO is coordinating or executing?
- Can a user tell which local device owns a blocked task?
- Can a user inspect route kind and relay fallback reason?
- Can a user find CPU/process/route evidence without raw logs?
- Can a user pause or revoke local runtime execution?
- Can a user approve or deny risky actions with enough context?
- Can a user understand public release No-Go blockers from the UI?
