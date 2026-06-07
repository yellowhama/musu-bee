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
- Tailscale control/data plane:
  `https://tailscale.com/docs/concepts/control-data-planes`
- ngrok secure tunnels:
  `https://ngrok.com/docs/guides/share-localhost/tunnels`

## Landscape Map

| Product | Execution location | User control surface | Useful pattern | Risk for MUSU to avoid |
|---|---|---|---|---|
| Claude Code Remote Control | local user machine | browser/mobile connected to local session | closest match for remote input controlling local execution | hiding that a local process must stay awake and connected |
| OpenAI Codex CLI | local machine | terminal/IDE/desktop app | local agent harness, approvals, app/CLI split | letting app/cloud terminology blur where work ran |
| OpenAI Codex app/cloud | local and cloud agent surfaces | command center for parallel work | multi-agent command center, worktrees, automations, skills | defaulting MUSU toward cloud execution instead of local device ownership |
| GitHub Copilot cloud agent | GitHub Actions-powered ephemeral environment | GitHub issues/agents/PR flow | plan, branch, logs, PR, review trail | assuming GitHub PR flow is enough for non-code local work |
| Cursor Background Agents | remote isolated machine | IDE/sidebar/web/mobile | background status, follow-ups, handoff/takeover | making all async work remote by default |
| Google Jules | cloud VM with GitHub repo clone | web app, repo selector, plan approval | repo/branch selector, plan approval, notifications | losing local runtime and device evidence |
| Devin | autonomous hosted software engineer plus CLI/desktop | team backlog, tickets, integrations | agent as teammate, backlog work, rich integrations | positioning as generic hosted worker instead of device fleet |
| Replit Agent | hosted workspace/deploy flow | natural-language builder | plain-language order flow and preview | hiding infrastructure/runtime location behind simplicity |
| Tailscale | data plane on devices, coordination server for control plane | admin console and clients | clean control-plane/data-plane split, device identity, NAT traversal | accidentally routing payload/data through MUSU.PRO by default |
| ngrok | local agent opens outbound TLS tunnel to cloud endpoint | dashboard plus public endpoint | no inbound ports, relay/tunnel as explicit connector | treating relay as the primary execution path |

## Main Finding

The strongest validation of the MUSU direction is Claude Code Remote Control:
the user can control a session from browser/mobile, but execution remains on the
machine that started the local process. That is the same product boundary MUSU
should adopt, generalized from a single agent session to a fleet of local MUSU
Desktop runtimes, project rooms, and P2P route selection.

The broader coding-agent market mostly solves remote convenience by moving
execution into a vendor cloud VM or GitHub Actions-like environment. MUSU should
not copy that default. MUSU's sharper position is:

> Submit work from anywhere. Coordinate through MUSU.PRO. Execute on your own
> machines. Prove the device, route, and resource behavior.

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
