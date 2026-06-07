# Agent Control SaaS Landscape Research

Generated: 2026-06-07 KST

## Scope

This research compares products that let a user delegate work to AI agents,
monitor asynchronous execution, or connect a cloud/web control surface to local
machines. The product question is:

Can MUSU.PRO be the remote input, room, rendezvous, and evidence surface while
installed MUSU Desktop programs remain the executors on each device?

## Sources Checked

Official or primary sources checked on 2026-06-07:

- Claude Code Remote Control:
  `https://code.claude.com/docs/en/remote-control`
- Claude Code architecture:
  `https://code.claude.com/docs/en/how-claude-code-works`
- OpenAI Codex product page:
  `https://openai.com/codex/`
- OpenAI Codex CLI docs:
  `https://developers.openai.com/codex/cli`
- OpenAI Codex GitHub repository:
  `https://github.com/openai/codex`
- GitHub Copilot cloud agent:
  `https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent`
- GitHub Copilot CLI Remote Control:
  `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control`
- GitHub Copilot cloud/local sandboxes:
  `https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes`
- GitHub Actions self-hosted runners:
  `https://docs.github.com/en/actions/reference/runners/self-hosted-runners`
- Cursor Background Agents:
  `https://docs.cursor.com/background-agent`
- Cursor Web & Mobile Agents:
  `https://docs.cursor.com/en/background-agent/web-and-mobile`
- Google Jules:
  `https://jules.google/docs/`
- Devin:
  `https://docs.devin.ai/get-started/devin-intro`
- Replit Agent:
  `https://docs.replit.com/references/agent/overview`
- Factory Droids:
  `https://factory.ai/product/droids`
- VS Code Remote Tunnels:
  `https://code.visualstudio.com/docs/remote/tunnels`
- Tailscale control/data plane:
  `https://tailscale.com/docs/concepts/control-data-planes`
- Tailscale DERP servers:
  `https://tailscale.com/docs/reference/derp-servers`
- Cloudflare Tunnel:
  `https://developers.cloudflare.com/tunnel/`
- ngrok secure tunnels:
  `https://ngrok.com/docs/guides/share-localhost/tunnels`

## Landscape Map

| Product | Execution location | User control surface | Useful pattern | Risk for MUSU to avoid |
|---|---|---|---|---|
| Claude Code Remote Control | local user machine | browser/mobile connected to local session | closest match for remote input controlling local execution | hiding that a local process must stay awake and connected |
| OpenAI Codex CLI | local machine | terminal/IDE/desktop app | local agent harness, approvals, app/CLI split | letting app/cloud terminology blur where work ran |
| OpenAI Codex app/cloud | local and cloud agent surfaces | command center for parallel work | multi-agent command center, worktrees, automations, skills | defaulting MUSU toward cloud execution instead of local device ownership |
| GitHub Copilot cloud agent | GitHub Actions-powered ephemeral environment | GitHub issues/agents/PR flow | plan, branch, logs, PR, review trail | assuming GitHub PR flow is enough for non-code local work |
| GitHub Copilot CLI Remote Control | local user machine | GitHub.com or GitHub Mobile | remote prompts, approvals, plans, cancel, and status while CLI tools stay local | syncing sensitive session events without clear owner/device policy |
| GitHub Copilot local/cloud sandboxes | local sandbox or GitHub cloud sandbox | CLI and Copilot app | explicit execution-location choice and policy-managed isolation | mixing local and cloud sandbox claims in one status label |
| GitHub Actions self-hosted runners | customer-owned runner machine | GitHub Actions queue and logs | cloud queue assigns jobs to online local runners with labels and timeouts | treating a CI runner pattern as sufficient for interactive agent control |
| Cursor Background Agents | remote isolated machine | IDE/sidebar/web/mobile | background status, follow-ups, handoff/takeover | making all async work remote by default |
| Google Jules | cloud VM with GitHub repo clone | web app, repo selector, plan approval | repo/branch selector, plan approval, notifications | losing local runtime and device evidence |
| Devin | autonomous hosted software engineer plus CLI/desktop | team backlog, tickets, integrations | agent as teammate, backlog work, rich integrations | positioning as generic hosted worker instead of device fleet |
| Replit Agent | hosted workspace/deploy flow | natural-language builder | plain-language order flow and preview | hiding infrastructure/runtime location behind simplicity |
| Factory Droids | terminal/IDE/browser/Slack surfaces | one prompt to PR | multi-surface agent routing and adjustable autonomy | selling autonomy without local execution proof |
| VS Code Remote Tunnels | VS Code Server on the remote machine | VS Code desktop/web | authenticated outbound tunnel with no SSH or inbound listener | anonymous tunnels plus auto-approved agents are a severe risk |
| Tailscale | data plane on devices, coordination server for control plane | admin console and clients | clean control-plane/data-plane split, device identity, NAT traversal | accidentally routing payload/data through MUSU.PRO by default |
| Tailscale DERP / peer relays | local devices with direct, peer relay, or DERP fallback | clients plus coordination server | direct-first pathing, encrypted blind relay, DERP map distribution | relay fallback without route/e2e proof |
| Cloudflare Tunnel | local daemon opens outbound tunnel to Cloudflare | public hostname/dashboard/API | no inbound ports, persistent connector, public hostname to local service | making Cloudflare/MUSU.PRO the default data plane |
| ngrok | local agent opens outbound TLS tunnel to cloud endpoint | dashboard plus public endpoint | no inbound ports, relay/tunnel as explicit connector | treating relay as the primary execution path |

## Main Finding

The strongest validation of the MUSU direction is remote control over a local
agent session. Claude Code Remote Control and GitHub Copilot CLI Remote Control
both let users monitor, prompt, approve, and steer from browser/mobile surfaces
while shell commands, file operations, tools, and local context remain on the
machine where the session started. That is the same product boundary MUSU should
adopt, generalized from a single local agent session to a fleet of local MUSU
Desktop runtimes, project rooms, and P2P route selection.

The broader coding-agent market mostly solves remote convenience by moving
execution into a vendor cloud VM or GitHub Actions-like environment. MUSU should
not copy that default. MUSU's sharper position is:

> Submit work from anywhere. Coordinate through MUSU.PRO. Execute on your own
> machines. Prove the device, route, and resource behavior.

## Execution Topologies Observed

The market splits into five execution patterns:

1. Local session, remotely controlled: Claude Code Remote Control and GitHub
   Copilot CLI Remote Control. This is the closest MUSU comparator.
2. Hosted async coding agent: Codex cloud/app, GitHub Copilot cloud agent,
   Cursor Background Agents, Jules, Devin, Replit, and Factory. These validate
   command-center, plan/review, branch, notification, and team workflow UX, but
   they mostly move execution into vendor infrastructure.
3. Cloud queue to customer runner: GitHub Actions self-hosted runners. This
   validates online/idle runner selection, labels, queue timeout, auto-update,
   and external log preservation for work executed on customer machines.
4. Authenticated outbound tunnel: VS Code Remote Tunnels, Cloudflare Tunnel,
   and ngrok. These validate no inbound ports and authenticated remote access,
   but they also highlight the need to ban anonymous tunnels when agents can
   auto-approve commands.
5. Mesh plus fallback relay: Tailscale direct paths, peer relay, and DERP. This
   validates direct-first connection policy, coordination server metadata, blind
   encrypted relay, and relay fallback only when direct paths are unavailable.

## Implications For MUSU.PRO

MUSU.PRO should be a hosted control plane, not a hosted worker pool:

- account and device registration
- project/company rooms
- remote work-order composer
- human/agent meeting timeline
- presence and device liveness
- rendezvous session creation
- route candidate exchange
- path selection and relay lease negotiation
- command audit and rejected-command audit
- evidence index and No-Go explanation
- notification delivery
- remote prompt, approval, cancellation, and status sync for local sessions
- owner/org policy for whether remote control is allowed
- local-session heartbeat, sleep/offline state, and reconnect messaging

MUSU.PRO must not present itself as the runtime that executed user work. Every
task should visibly distinguish:

- `Input from MUSU.PRO`
- `Execution on <device>`
- `Route <lan|tailscale|direct_quic|relay>`
- `Evidence <available|missing|failed>`

## Implications For MUSU Desktop

Each installed MUSU Desktop remains the local executor:

- owns filesystem/process/tool access
- receives authenticated work-order envelopes
- applies local permission and approval policy
- runs agents and adapters
- records CPU/process/route evidence
- advertises route candidates
- prefers direct P2P paths after rendezvous
- falls back to relay only when direct paths fail and policy allows it
- keeps a durable local work-order inbox for remote prompts and approvals
- exposes which remote actions are allowed from web/mobile versus local-only
- preserves command/tool logs outside ephemeral local processes

The desktop mini console should show local process liveness, current room/order
count, CPU/memory baseline, connected peers, route state, and a pause/revoke
control. It should not send users to `localhost:3001` as the release product
experience.

## AG UI/UX Decisions

### Command Center

The first MUSU.PRO screen after login should be a command center:

- order composer with room/device/agent scope
- active run table grouped by project room
- selected run timeline
- approval drawer
- evidence status and blockers

This borrows the command-center pattern from Codex-like products, but the
primary status is local execution state rather than cloud task state.

### Project Rooms

Rooms should act like an AI company meeting room:

- humans submit orders and approve plans
- local agents discuss plan splits and blockers
- devices appear in the roster with route status
- artifacts and evidence attach to room decisions
- rejected work orders are visible as audit events

Room state is metadata and coordination. Payload execution stays with local
MUSU Desktop runtimes unless an explicit relay fallback is active.

### Device Mesh

The Device Mesh screen should make the network behavior obvious:

1. device registered
2. presence current
3. route candidates published
4. rendezvous created
5. candidate exchange complete
6. direct path attempted
7. relay fallback requested if allowed
8. route evidence recorded

The UI should borrow the control/data-plane clarity from Tailscale: MUSU.PRO
coordinates and local devices move encrypted data/work results.

### Evidence Center

Cloud coding agents expose logs, PRs, and status. MUSU needs a stronger trust
surface because its differentiator is local execution:

- process ownership
- single instance
- runtime idle CPU
- runtime CPU scenario matrix
- route kind
- peer identity
- encryption
- relay transport proof
- delivery proof
- support/store/public release blockers

This must be readable without opening raw JSON.

## Deep Research Product Requirements

- Every remote-controlled run must state: local process online, local device,
  account/company owner, current route, and whether the local process can keep
  running after the user leaves the desk.
- Remote web/mobile input may submit prompts, answer questions, approve/deny
  plans, approve/deny tool permissions, cancel current work, and request status.
  Local-only operations must be labeled and denied from the remote UI.
- Remote control must be owner-scoped and policy-gated for teams. Enterprise
  behavior should default to off until an admin enables it.
- The desktop runtime must never open anonymous inbound tunnels for agent
  control. Outbound-only connectors are acceptable only when authenticated,
  scoped, logged, and revocable.
- Self-hosted-runner style semantics should inform MUSU device scheduling:
  online/idle selection, labels/capabilities, pickup timeout, queued state,
  externalized logs, and stale runner detection.
- Relay fallback must emit route metadata, transport proof, and payload delivery
  proof. A relay lease alone is not proof that work ran correctly.
- UI copy must distinguish `remote control of local execution` from `cloud
  execution`. These are separate product modes and must never share one status
  label.

## Product Differentiation

MUSU should not compete as another hosted coding agent. The defensible wedge is
local-first agent operations:

- user input can come from web/mobile/desktop
- execution can use the user's own machines, GPUs, tools, secrets, and LAN
- multiple local devices can coordinate through a shared room
- P2P direct routes are preferred after web rendezvous
- relay is explicit fallback, not the default data path
- every run has proof of where and how it ran

## Pricing And Packaging Implication

Free/local mode can remain a single-machine local desktop product.

Paid MUSU.PRO features should be framed as coordination infrastructure:

- remote input from web/mobile
- project/company rooms
- multi-device presence
- rendezvous and path selection
- hosted relay fallback
- evidence history and release-grade audit
- notifications and team permissions

The paid feature should not be described as "cloud dashboard runs the work";
it is cloud coordination for local work.

## Next Product Work

1. Replace any release UI/copy that points normal users at `localhost:3001`
   with MUSU Desktop mini console or MUSU.PRO remote input language.
2. Build the MUSU.PRO work-order composer around room, target device, target
   agents, permission envelope, route policy, and expected evidence.
3. Build the local Desktop receiver as a durable authenticated work-order inbox.
4. Finish hosted rendezvous plus candidate exchange proof against real
   `musu.pro`.
5. Implement release-grade `quic_relay_tunnel` payload transit separately from
   preview store-forward queues.
6. Add Evidence Center views backed only by existing verifier outputs.
7. Keep public release No-Go until second-machine route/CPU/matrix, live
   MUSU.PRO relay proof, support mailbox, and Store evidence pass.
