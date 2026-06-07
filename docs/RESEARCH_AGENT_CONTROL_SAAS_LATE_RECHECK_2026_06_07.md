# Agent Control SaaS Late Source Recheck

Date: 2026-06-07 17:55 KST

## Scope

This is a late same-day source recheck after the second-PC route preflight
helper. It answers the operator request to keep deep research on comparable
SaaS products current while preserving the MUSU product split:

- MUSU.PRO receives remote user input, project/company room state, presence,
  rendezvous, path selection, relay fallback coordination, evidence, and team
  policy.
- MUSU Desktop on each device remains the local executor for files, shells,
  tools, agents, adapters, route attempts, and release evidence.

Confidence: high for the product boundary, medium for individual competitor
feature details that may continue changing quickly.

## Sources Rechecked

Official or primary sources checked in this pass:

- OpenAI Codex product page: `https://openai.com/codex/`
- OpenAI Codex app announcement:
  `https://openai.com/index/introducing-the-codex-app/`
- OpenAI Codex upgrades:
  `https://openai.com/index/introducing-upgrades-to-codex/`
- OpenAI Codex GitHub repository: `https://github.com/openai/codex`
- GitHub Copilot cloud-agent session docs:
  `https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/start-copilot-sessions`
- Cursor Background Agents docs: `https://docs.cursor.com/background-agent`
- Google Jules docs and product page:
  `https://jules.google/docs/`, `https://jules.google/`
- Devin docs: `https://docs.devin.ai/get-started/devin-intro`
- Replit Agent docs and mobile product page:
  `https://docs.replit.com/references/agent/overview`,
  `https://replit.com/products/mobile`
- AG-UI protocol docs and repo:
  `https://docs.ag-ui.com/`, `https://github.com/ag-ui-protocol/ag-ui`
- Tailscale connection types and DERP docs:
  `https://tailscale.com/docs/reference/connection-types`,
  `https://tailscale.com/docs/reference/derp-servers`

## Updated Read

OpenAI Codex now makes the command-center pattern explicit: the product page
shows Codex available on macOS and Windows, and describes the Codex app as a
command center for agentic coding with built-in worktrees, cloud environments,
Skills, Automations, and connected app/editor/terminal surfaces. The GitHub
repository still states that Codex CLI runs locally on the user's computer.
For MUSU, the lesson is that local, desktop, web, and cloud agent surfaces can
coexist, but execution location must be a first-class label.

GitHub Copilot cloud agent validates assignment and follow-up UX from issues,
GitHub.com, mobile, and IDEs. It also reinforces that cloud-agent products
center on branch/PR/session logs. MUSU should borrow the task/session/review
pattern but adapt it to local devices and evidence bundles, not only PRs.

Cursor, Jules, Devin, and Replit keep validating hosted async-agent UX:
background status, project/repo selection, plan approval, follow-ups,
notifications, artifacts, and review. They are useful UX references, but they
mostly run in vendor-controlled environments. MUSU's product edge remains
local-device execution with visible route and resource proof.

AG-UI adds a protocol-level UI lesson. It standardizes event-based
agent-to-application interaction, including streaming text, tool results,
state updates, custom events, and human-in-the-loop collaboration. MUSU should
not blindly adopt AG-UI as the release blocker, but the AG UI should use a
compatible event mental model: every room/order/run update should be
streamable, typed, auditable, and separable from local command execution.

Tailscale continues to validate direct-first mesh behavior. Devices first use
coordination metadata, then attempt direct peer-to-peer paths, peer relay, and
DERP fallback. MUSU.PRO should mirror the product clarity: route UI must show
direct attempt, peer/hosted relay fallback, fallback reason, transport proof,
and payload delivery proof.

## Product Impact

The product decision is unchanged and sharpened:

- MUSU.PRO is a SaaS control plane, not the default executor.
- MUSU Desktop is the installed local runtime and permission boundary.
- Remote input can come from web/mobile/GitHub-like surfaces.
- Local execution remains selected-device execution.
- Relay is explicit fallback, not a vague connected state.
- Any future hosted worker is a separate execution class with separate labels,
  billing, policy, data controls, and evidence.

## AG UI/UX Impact

Command Center must require these fields before submit:

- room
- target device or agent group
- execution locus
- route policy
- permission envelope
- queue/pickup timeout
- evidence requirement

Every run needs an execution strip:

- `Input from <surface>`
- `Executing on <device/runtime>`
- `Route <local|lan|tailscale|direct_quic|peer_relay|hosted_relay|cloud>`
- `Evidence <ok|missing|failed>`
- `Remote control <enabled|paused|policy-blocked>`

The event stream should use typed UI events:

- order created
- target selected
- local runtime heartbeat
- prompt delivered
- approval requested
- command accepted or rejected
- route candidate published
- rendezvous created
- direct route attempted
- relay lease requested
- relay transport proven
- payload delivery proven
- evidence attached
- run completed, failed, canceled, or timed out

The UI should treat `localhost` as an implementation detail in Desktop Mini
Console diagnostics. Normal remote users should see device names, rooms,
route state, and evidence state, not a local developer URL.

## Release Meaning

This research/spec update does not close any release gate. Public release
remains No-Go until real second-PC route/CPU/matrix evidence, live owner-scoped
MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center
proof pass.
