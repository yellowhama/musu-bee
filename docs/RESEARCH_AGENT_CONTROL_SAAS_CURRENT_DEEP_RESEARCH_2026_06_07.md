# Agent Control SaaS Current Deep Research Recheck

Date: 2026-06-07 17:56 KST

## Scope

This is the operator-requested deeper recheck of comparable SaaS products after
the second-PC route preflight helper and late AG-UI research. It updates the
MUSU roadmap without changing the product boundary:

- MUSU.PRO is the remote input, room, presence, rendezvous, path selection,
  relay fallback, evidence, notification, and policy control plane.
- MUSU Desktop on each device remains the local executor, permission boundary,
  route-attempt owner, and evidence recorder.
- P2P direct paths remain preferred after MUSU.PRO rendezvous.
- Hosted relay is explicit fallback and must stay proof-gated.

Confidence: high for the product boundary and source classification; medium for
competitor feature depth because agent SaaS surfaces are changing quickly.

## Sources Rechecked

Official or primary sources checked in this pass:

- Claude Code Remote Control:
  `https://code.claude.com/docs/en/remote-control`
- GitHub Copilot CLI Remote Control:
  `https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/steer-remotely`
- OpenAI Codex product page:
  `https://openai.com/codex/`
- OpenAI Codex GitHub repository:
  `https://github.com/openai/codex`
- OpenAI Enterprise/Edu release notes for Codex Windows remote control:
  `https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes`
- Cursor Background Agents and Web/Mobile Agents:
  `https://docs.cursor.com/background-agent`,
  `https://docs.cursor.com/en/background-agent/web-and-mobile`
- Google Jules docs and product page:
  `https://jules.google/docs/`, `https://jules.google/`
- Devin docs:
  `https://docs.devin.ai/get-started/devin-intro`
- AG-UI protocol docs and repo:
  `https://docs.ag-ui.com/`, `https://github.com/ag-ui-protocol/ag-ui`
- Tailscale connection types and DERP docs:
  `https://tailscale.com/docs/reference/connection-types`,
  `https://tailscale.com/docs/reference/derp-servers`

## Current Read

Claude Code Remote Control remains the cleanest direct comparator. The product
explicitly separates local execution from cloud web execution: the remote UI is
a web/mobile window into a running local session, and the local machine keeps
filesystem, tools, MCP servers, and project configuration. MUSU should copy the
clarity of that boundary and generalize it from one session to a device/agent
fleet.

GitHub Copilot CLI Remote Control reinforces the same user journey in a GitHub
workflow. A user can steer a running CLI session from GitHub.com or GitHub
Mobile, monitor output, answer permission prompts, keep the host machine awake,
and review older sessions. The release lesson is that remote input is valuable,
but the local process must be online, owner-scoped, and explicitly remote-
control enabled.

OpenAI Codex is now the strongest command-center reference. The product page
describes Codex as available on macOS and Windows and as a command center for
agentic coding with multi-agent workflows, worktrees, cloud environments,
Skills, and Automations. The open GitHub repository still describes Codex CLI
as a coding agent that runs locally on the user's computer. The Enterprise/Edu
release notes add an important overlap with MUSU: Windows remote control keeps
the Windows machine as host for project files, shell, app server, and local
context. MUSU's answer is not to hide from Codex; it is to make the multi-device
local fleet, room coordination, route proof, and local evidence stronger and
more visible.

Cursor, Jules, Devin, and Replit keep validating hosted async-agent UX:
background task lists, follow-ups, plan approval, branch/artifact review,
notifications, and team workflows. Jules is explicitly cloud-VM based. Devin is
positioned as an autonomous AI software engineer that writes, runs, and tests
code. These products are useful UX references, but they do not prove MUSU
should move default execution into a vendor cloud.

AG-UI validates the UI architecture. It is an event-based agent-user
interaction protocol for streaming state, UI intents, tool events, shared
state, interrupts, and custom events between agent backends and frontends. MUSU
does not need to block release on adopting AG-UI as a dependency, but the MUSU
AG UI should use the same mental model: every room/order/run update is typed,
streamable, auditable, and separate from local command execution.

Tailscale remains the strongest route architecture reference. It starts with
relay-assisted connectivity, tries to upgrade to direct UDP peer-to-peer,
falls back to peer relay when configured, and otherwise uses DERP as last
resort. The important UX rule is explicit route state: direct, peer relay,
hosted relay, fallback reason, and proof must be visible.

## Market Segmentation

| Pattern | Current examples | What MUSU should borrow | What MUSU must avoid |
|---|---|---|---|
| Remote control of local execution | Claude Code Remote Control, GitHub Copilot CLI Remote Control, Codex Windows remote control | web/mobile prompt input, approvals, cancellation, session review, keep-awake/pickup state | pretending the web surface can execute when the local host is offline |
| Agent command center | OpenAI Codex app, Devin, Cursor | multi-agent supervision, work queues, follow-ups, review, artifacts | one vague `connected` badge for local, cloud, relay, and sandbox |
| Hosted async coding agent | Jules, Devin, Cursor Background Agents, Replit Agent, GitHub Copilot cloud agent | plan approval, repo/project selector, PR/artifact handoff, notifications | moving MUSU default execution into cloud and losing local proof |
| Cloud queue to customer-owned host | GitHub Actions self-hosted runner pattern | online/idle matching, labels, pickup timeout, stale runner handling | treating batch CI semantics as enough for interactive local-agent permissions |
| Control plane plus device data plane | Tailscale, Twingate, tunnels, relays | identity, policy, route candidates, rendezvous, NAT traversal, relay fallback | anonymous tunnels, default relay paths, or payload visibility in the control plane |

## MUSU Product Implications

The product decision remains unchanged and sharper:

- MUSU.PRO should sell coordination, not default hosted execution.
- The paid SaaS surface is Command Center, Project Rooms, Agent Grid, Device
  Mesh, Evidence Center, notifications, owner/org policy, rendezvous, and
  relay fallback.
- MUSU Desktop is the installed runtime that owns local files, shell, tools,
  browser/app adapters, permission prompts, route attempts, CPU/process
  budgets, and evidence.
- A web/mobile order is a signed work-order envelope. It is not execution until
  a selected local MUSU Desktop runtime accepts it under local policy.
- Future hosted workers can exist only as a separate execution class with
  separate label, policy, billing, data controls, and evidence.

## AG UI/UX Lock

The first product screen after login should be Command Center, not a landing
page.

The order composer must require:

- room
- target device, best-device policy, or agent group
- execution locus, default `Local MUSU Desktop`
- route policy: `Local only`, `Prefer direct`, `Allow relay fallback`
- permission envelope
- queue/pickup timeout
- evidence requirement

Every run must show:

- `Input from <web|mobile|desktop|api|github>`
- `Executing on <device/runtime>`
- `Route <local|lan|tailscale|direct_quic|peer_relay|hosted_relay|cloud>`
- `Evidence <required|collecting|ok|missing|failed>`
- `Remote control <enabled|paused|policy-blocked>`

Remote submit is disabled unless an eligible local runtime is online or the
user explicitly queues the work with a pickup timeout. `localhost` appears only
inside Desktop Mini Console diagnostics.

## Roadmap Update

Immediate roadmap:

1. Keep one-machine local Desktop testing valid, but label it as one-machine
   only.
2. Install the same current MUSU build on the second Windows machine before
   attempting real two-device proof.
3. Use the second-PC route preflight helper before spending another 60s
   targeted route CPU sample.
4. Implement the MUSU.PRO work-order room composer around target device,
   route policy, permission envelope, queue timeout, and evidence.
5. Add Desktop local inbox acceptance so web input becomes local execution only
   after local policy accepts the envelope.
6. Finish release `quic_relay_tunnel` byte transit before flipping relay
   payload/runtime markers.
7. Show release No-Go blockers directly in Evidence Center.

## Qualitative Assessment

The research is positive for MUSU. Comparable products validate the user desire
to order agent work from web/mobile, supervise background progress, approve
plans, and review artifacts. The gap MUSU can own is stricter execution
truthfulness: target device, local runtime liveness, direct-or-relay route,
resource budget, and evidence are visible before and after the order.

The main risk is trust collapse if MUSU copies hosted-agent UX while hiding the
local executor. The design must make offline/sleeping/policy-blocked devices
obvious and must not imply `musu.pro` executed work that happened on a local PC.

Release meaning is unchanged. This research/spec update does not close
second-PC route/CPU/matrix, live MUSU.PRO P2P/relay proof, support mailbox, or
Store/Partner Center gates.

## 2026-06-07 19:15 KST Supplemental Recheck

Additional same-turn source recheck:

- OpenAI Enterprise/Edu release notes for Codex Windows remote control:
  `https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes`
- OpenAI Codex product page:
  `https://openai.com/codex/`
- OpenAI Codex GitHub repository:
  `https://github.com/openai/codex`
- VS Code Remote Tunnels:
  `https://code.visualstudio.com/docs/remote/tunnels`
- AG-UI protocol docs and repo:
  `https://docs.ag-ui.com/`,
  `https://github.com/ag-ui-protocol/ag-ui`

Update:

OpenAI's Windows remote-control release-note wording is especially relevant to
MUSU. It reinforces the same architecture: a remote surface can steer work,
but the Windows machine remains host for local project context, shell, app
server, and files. That is the product lane MUSU should claim more strictly:
web input and collaboration through MUSU.PRO, local execution through MUSU
Desktop, and route/evidence proof for every run.

VS Code Remote Tunnels reinforces the security rule. Remote access can be
acceptable when it is authenticated and explicit, but anonymous tunnel behavior
combined with agentic coding is unsafe. MUSU should therefore require owner
scope, explicit remote-control enablement, revocation, audit, and route/evidence
status before accepting remote work.

AG-UI continues to validate the event model, not a dependency decision. MUSU
should implement room/order/run state as typed streamable events and keep local
command execution behind Desktop policy.
