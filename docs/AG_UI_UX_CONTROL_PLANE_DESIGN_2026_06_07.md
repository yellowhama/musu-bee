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

- Deep research report:
  `docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`
- Late same-day source recheck:
  `docs\RESEARCH_AGENT_CONTROL_SAAS_LATE_RECHECK_2026_06_07.md`
- Claude Code Remote Control:
  `https://code.claude.com/docs/en/remote-control`
- Claude Code architecture:
  `https://code.claude.com/docs/en/how-claude-code-works`
- Claude Code on the web:
  `https://code.claude.com/docs/en/claude-code-on-the-web`
- OpenAI Codex product page:
  `https://openai.com/codex/`
- OpenAI Codex CLI docs:
  `https://developers.openai.com/codex/cli`
- OpenAI Codex with ChatGPT plan / enterprise controls:
  `https://help.openai.com/en/articles/11369540-codex-in-chatgpt`
- OpenAI local shell tool:
  `https://developers.openai.com/api/docs/guides/tools-local-shell`
- OpenAI Codex GitHub repo:
  `https://github.com/openai/codex`
- GitHub Copilot cloud agent docs:
  `https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent`
- GitHub Copilot CLI Remote Control docs:
  `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control`
- GitHub Copilot cloud/local sandbox docs:
  `https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes`
- GitHub Actions self-hosted runner docs:
  `https://docs.github.com/en/actions/reference/runners/self-hosted-runners`
- Cursor background agents docs:
  `https://docs.cursor.com/background-agent`
- Google Jules docs:
  `https://jules.google/docs/`
- Devin docs:
  `https://docs.devin.ai/get-started/devin-intro`
- Replit Agent docs:
  `https://docs.replit.com/references/agent/overview`
- AG-UI protocol docs and repo:
  `https://docs.ag-ui.com/`,
  `https://github.com/ag-ui-protocol/ag-ui`
- OpenHands docs and SDK:
  `https://docs.openhands.dev/overview/introduction`,
  `https://docs.openhands.dev/sdk/index`
- Factory Droids:
  `https://factory.ai/product/droids`
- VS Code Remote Tunnels:
  `https://code.visualstudio.com/docs/remote/tunnels`
- Cloudflare Tunnel:
  `https://developers.cloudflare.com/tunnel/`
- Tailscale DERP servers:
  `https://tailscale.com/docs/reference/derp-servers`
- Twingate architecture:
  `https://www.twingate.com/docs/how-twingate-works/`
- ZeroTier controller/root docs:
  `https://docs.zerotier.com/what-is-a-controller/`,
  `https://docs.zerotier.com/roots`

Observed patterns:

| Service | Execution model | UX pattern | Lesson for MUSU |
|---|---|---|---|
| Claude Code Remote Control | local session controlled from web/mobile | remote session list, QR/session URL, synced conversation, outbound-only connection | Closest direct comparator: MUSU.PRO should be a window/control plane into local MUSU Desktop execution, with local process liveness made explicit. |
| Claude Code on the web | cloud task on Anthropic infrastructure | same web surface, different execution location | MUSU must avoid using the same badge for local remote control and future hosted execution. |
| OpenAI Codex | connected local/cloud agent surfaces | command center, parallel agents, skills, background work | MUSU needs a command center, but must show local device ownership rather than only cloud worktrees. |
| OpenAI Codex controls | Codex Local, Codex Cloud, Remote Control | admin policy, RBAC, compliance/API visibility | MUSU.PRO needs org policy and audit views for remote control, not just a feature toggle. |
| OpenAI local shell | agent loop with local commands in user runtime | explicit local execution loop with sandbox/allowlist warning | MUSU remote order execution should always pass through local desktop permission policy. |
| GitHub Copilot cloud agent | GitHub Actions powered ephemeral environment | issue/PR workflow, plan, branch, logs, PR review | MUSU should expose plan, branch/artifact, review, and audit trails; every task needs a clear handoff object. |
| GitHub Copilot CLI Remote Control | local CLI session controlled from GitHub.com/mobile | live session list, remote prompts, approval responses, cancel, plan approval | MUSU remote UI should support prompts/approvals/cancel while clearly saying local commands and files remain on the selected device. |
| GitHub Copilot cloud/local sandboxes | explicit local or cloud execution sandbox | execution-location choice and policy-managed isolation | MUSU needs separate status labels for local execution, local sandbox, relay, and any future hosted worker mode. |
| GitHub Actions self-hosted runners | cloud queue assigns jobs to online customer runner | labels, idle/online matching, pickup timeout, external logs | Device scheduling should use labels/capabilities and make queued vs delivered vs executing states explicit. |
| Cursor background agents | remote async environment connected to IDE/web/mobile | background-agent sidebar, status, follow-ups, take-over | MUSU should support remote input and follow-ups, but the take-over target is a local device/runtime. |
| Google Jules | cloud VM that clones repos | repo selector, branch selector, plan approval, notifications | MUSU needs repo/project selectors, plan approval, and completion notifications before local execution feels safe. |
| Devin | autonomous software engineer with CLI/desktop/cloud/integrations | team workflow, tickets, integrations, backlog work | MUSU should model agents as team members tied to rooms, tickets, and local capabilities. |
| Replit Agent | hosted workspace and deployment flow | natural-language build flow, plan mode, design preview | MUSU can borrow plain-language ordering and preview, but must avoid hiding infra/runtime location. |
| AG-UI | event protocol between agents and user-facing apps | streaming messages, tool results, state sync, custom events, human-in-the-loop | MUSU AG UI should use typed room/order/run events while keeping local command execution behind Desktop policy. |
| OpenHands | local GUI/CLI, SDK, remote servers, cloud | open agent runtime with local-to-remote portability | Useful future reference, but MUSU's first release should not blur Windows Desktop evidence with optional hosted runtimes. |
| Factory Droids | multi-surface agent task flow | terminal, IDE, browser, Slack, model routing, adjustable autonomy | MUSU should allow the same room/order to originate from multiple surfaces while local permission policy remains consistent. |
| VS Code Remote Tunnels | remote server on user's machine over authenticated tunnel | connect from VS Code web/desktop without SSH or inbound listener | MUSU remote access should be outbound-only and authenticated; anonymous tunnel behavior must be impossible for agent control. |
| Tailscale | control plane coordinates devices; data plane runs on devices | device identity, policy, peer discovery, NAT traversal, direct/relayed paths | MUSU.PRO should coordinate registration/rendezvous/path choice while local devices move work and evidence. |
| Tailscale DERP / peer relays | direct paths preferred, peer/DERP relay fallback | DERP map, coordination server, encrypted blind relay | Route UI should show direct attempt, peer relay, hosted relay, and why fallback happened. |
| ZeroTier | controller/root discovery plus node data plane | membership authorization, root/moon discovery | Device enrollment should distinguish identity/control membership from payload routing. |
| Twingate | hosted controller, customer connector, relay fallback | controller/connector/relay separation | MUSU relay UI should expose connector/device identity without implying relay can inspect payloads. |
| Cloudflare Tunnel | local daemon opens outbound connection to cloud edge | public hostname to local service, no inbound ports | MUSU relay/connect should be explicit infrastructure, not a hidden default execution mode. |
| ngrok | local agent opens outbound TLS tunnel to cloud endpoint | no inbound ports, explicit tunnel endpoint, cloud relay | Relay fallback should be explicit and proven, not the default execution path. |

Competitive gap for MUSU:

Most comparable SaaS products make cloud execution feel simple. Claude Code
Remote Control and GitHub Copilot CLI Remote Control prove there is also demand
for browser/mobile control over a local session. MUSU should generalize that
pattern to multiple local devices and agents while making execution location,
device identity, route path, and evidence more visible than competitors do.

Strategic conclusion:

- MUSU.PRO is the web command room and rendezvous/control plane.
- MUSU Desktop is the local executor on each device.
- P2P direct paths are preferred after web rendezvous.
- Hosted relay is an explicit fallback path with release-grade proof.
- Paid MUSU.PRO value should be remote input, rooms, presence, rendezvous,
  relay fallback, evidence history, notifications, and team permissions, not
  moving default execution into the cloud.
- Remote control is allowed to synchronize prompts, messages, approvals,
  cancellations, and status; local file, shell, tool, and adapter execution
  remains on the selected MUSU Desktop device.

UX rule added from the 2026-06-07 supplemental research:

- A run must always show an execution-locus banner:
  `Input from <surface>`, `Executing on <device/runtime>`,
  `Route <direct|relay|cloud>`, and `Evidence <ok|missing|failed>`.
- `Remote control`, `Local execution`, `Local sandbox`, `Cloud task`, and
  `Relay fallback` are separate labels. They must never collapse into a single
  `connected` state.
- If MUSU later adds hosted workers, they must appear as a distinct execution
  mode with different policy, evidence, billing, and data controls.

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
- execution locus selector: `Local MUSU Desktop`; future `Hosted worker` stays
  disabled until a separate cloud-execution product exists
- approval toggle for write/file/command/network actions
- budget controls: max time, max spend, max CPU, max parallel agents
- session controls: keep awake hint, cancel current work, revoke remote access

Status badges:

- `Local`
- `LAN`
- `Tailscale`
- `Direct QUIC`
- `Relay`
- `Waiting for device`
- `Needs approval`
- `Evidence missing`
- `Remote control`
- `Cloud task`
- `Local sandbox`
- `Local-only action`

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
- local process keepalive/offline risk
- queue state: idle, assigned, pickup timeout, executing

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
- whether the connection is direct, peer relay, hosted relay, or tunnel
- whether inbound ports are open or the connector is outbound-only

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
- "Remote control: enabled/disabled/policy-blocked"

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

Use separate labels for execution-location choices:

- `Local execution`
- `Local sandbox`
- `Cloud sandbox`
- `Relay transport`
- `Remote control`

### Ask Less, Show More

The default user flow:

1. choose room
2. type order
3. accept plan or set auto-approval policy
4. watch local device progress
5. review evidence/artifacts

Advanced network fields should be progressive disclosure unless something fails.

### Remote Control Is A Limited Surface

Remote web/mobile sessions can:

- submit prompts and follow-ups
- answer agent questions
- approve or deny plans
- approve or deny permission requests
- cancel the current operation
- view logs, status, and evidence

Remote web/mobile sessions cannot silently grant broader local access than the
desktop policy already allows. Local-only commands and interactive local pickers
must render as unavailable with a clear reason.

### No Anonymous Agent Tunnels

The UI must never offer anonymous tunnel exposure for agent control. If a future
Connect feature uses outbound tunneling or relay, the visible contract must show:

- authenticated account/company owner
- device identity
- tunnel/relay endpoint
- allowed routes and permissions
- expiration and revoke control
- audit/evidence destination

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

## 2026-06-07 Operator Deep Research Update

The operator-requested deeper SaaS comparison is recorded in:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_OPERATOR_DEEP_DIVE_2026_06_07.md`

AG UI/UX impact:

- Command Center is the primary paid SaaS surface.
- The composer must require room, target, execution locus, route policy,
  permission envelope, queue timeout, and expected evidence before submission.
- No online eligible MUSU Desktop runtime means no immediate run; show explicit
  queue-with-timeout, install/start Desktop, or future hosted-worker selection.
- Device Mesh should show the runner-like lifecycle: online, idle, assigned,
  pickup timeout, executing, stale, offline.
- Evidence Center must explain No-Go from verifier outputs instead of exposing
  raw JSON as the primary user experience.
- Remote control local execution, local sandbox, relay fallback, and cloud
  execution are separate labels and must never collapse into one `connected`
  state.
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

## MVP Screen Contracts

The first AG UI slice should be a working operator cockpit, not a landing page.
It can be built before full multi-device release proof as long as blocked
states are honest.

### Command Center MVP

Primary table columns:

- room
- order
- assigned agents
- execution device
- local runtime state
- route state
- evidence state
- next action

Composer controls:

- room selector
- target selector: best device, specific device, or agent group
- route policy: local only, prefer direct, allow relay fallback
- approval policy: ask, read-only auto, project policy
- budget: time, CPU, cost, parallelism

The submit button is disabled when no eligible local MUSU Desktop runtime is
online, unless the order is explicitly queued. Queued orders must show pickup
timeout.

### Project Room MVP

The room should read like a compact meeting room for a small AI company:

- humans and agents in one roster
- current agenda/orders
- plan discussion and decisions
- artifacts
- evidence and blockers
- rejected work-order audit events

The room timeline stores coordination metadata. Local execution details remain
owned by the selected device and attached back as evidence.

### Device Mesh MVP

The device table must expose:

- device name
- owner/company
- installed version
- online/offline/sleep state
- local bridge health
- CPU/memory baseline
- route candidates
- current room/order
- revoke/pause action

Route state machine:

1. registered
2. presence current
3. candidates published
4. rendezvous created
5. candidate exchange complete
6. direct path attempted
7. relay lease requested
8. relay transport proven
9. payload delivery proven
10. route evidence recorded

States 8-10 must stay blocked until the release `quic_relay_tunnel` runtime and
payload endpoint are implemented and proven.

### Evidence Center MVP

Evidence Center is table-first:

- release gate
- machine
- latest evidence path
- verifier
- result
- freshness
- blocker
- next action

Required release gates:

- single-machine smoke
- process ownership
- startup single-instance
- desktop single-instance
- desktop-open idle CPU
- five-state runtime CPU matrix
- targeted route-attempt CPU diagnostic
- successful second-PC route
- live MUSU.PRO P2P owner scope
- relay transport proof
- relay payload delivery proof
- support mailbox
- Store/Partner Center

Raw JSON should open in a detail drawer, but the main screen must be readable
without raw logs.

### Desktop Mini Console MVP

The installed desktop program needs a local control strip:

- local runtime online/offline
- current account/company
- active rooms and orders
- local bridge URL
- route candidates published
- remote control allowed/paused
- relay fallback allowed/blocked
- CPU/memory baseline
- quit/revoke controls

The mini console can link to MUSU.PRO for remote input, but should not ask
normal users to operate `localhost:3001` as the product surface.

## 2026-06-07 15:00 KST Design Recheck

The latest official source recheck keeps the AG UI/UX direction unchanged.

Design lock:

- The primary MUSU.PRO experience is a command-room/control-plane surface.
- The installed MUSU Desktop program is the execution runtime and local
  permission boundary.
- Remote web/mobile control is a limited surface for input, prompts,
  approvals, cancellations, status, and evidence inspection.
- Local-only operations must stay visibly unavailable from remote sessions
  unless the desktop policy explicitly allows them.
- Device Mesh and Evidence Center must show whether a run is local direct,
  P2P direct, relay fallback, or future hosted execution.
- Any future hosted worker mode needs a different badge, policy, billing, and
  evidence surface from local remote control.

MVP addition:

- Add a small execution-locus strip above the order composer:
  `Input`, `Execution device`, `Route policy`, `Evidence required`.
- Disable submit when no selected MUSU Desktop runtime is online unless the
  order is explicitly queued with a pickup timeout.
- Show `localhost` only as a technical bridge detail inside Desktop Mini
  Console diagnostics, not as the normal product entry point.

## 2026-06-07 15:50 KST Final Design Recheck

The final same-day SaaS source recheck is documented in:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_FINAL_RECHECK_2026_06_07.md`

Design decision unchanged:

- AG UI is an operator cockpit for local AI workers, not a hosted-agent landing
  page.
- The first viewport after login should be Command Center.
- The order composer must show `Input`, `Executing on`, `Route`, and
  `Evidence` before submission.
- Project Rooms are the AI company meeting room: humans and attached local
  agents coordinate plans, decisions, artifacts, blockers, and evidence.
- Device Mesh is the place to inspect local runtime liveness, route candidates,
  direct attempts, relay fallback, and revoke/pause controls.
- Evidence Center is the release/no-go truth surface, with raw JSON kept behind
  a detail drawer.

MVP rule:

- No online eligible MUSU Desktop runtime means no immediate submit. The only
  valid remote path is explicit queueing with pickup timeout and visible
  offline/sleep/policy state.

## 2026-06-07 17:55 KST Late SaaS/AG-UI Recheck

The late same-day source recheck is documented in:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LATE_RECHECK_2026_06_07.md`

Design decision still unchanged:

- Codex validates Windows/macOS desktop plus cloud/app/editor/terminal
  command-center surfaces, but its local CLI remains a local computer runtime.
- GitHub, Cursor, Jules, Devin, and Replit validate assignment, plan approval,
  background status, follow-ups, notifications, artifacts, and review.
- AG-UI validates typed, event-based agent-to-UI interaction; MUSU should use
  that event mental model for room/order/run streams.
- Tailscale validates direct-first route UX with explicit relay fallback.

Additional UI contract:

- every room/order/run update should be streamable as a typed event;
- event transport can be SSE/WebSocket/webhook later, but the product state
  model must not depend on a specific transport;
- command/tool execution events must distinguish `requested`, `approved`,
  `rejected`, `started`, `completed`, `failed`, and `timed_out`;
- route events must distinguish candidate publication, direct attempt, relay
  lease, transport proof, payload proof, and evidence attachment;
- remote web/mobile control may stream status and approvals, but local Desktop
  policy owns whether execution is allowed.
