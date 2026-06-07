# Agent Control SaaS Operator Deep Dive

Date: 2026-06-07 16:10 KST

## Scope

This is the operator-requested deep research pass for comparable SaaS and
agent-control products after the final source recheck. The product question is
not whether MUSU should become another hosted coding-agent cloud. The question
is:

Can MUSU.PRO be the web/mobile/team control plane for local MUSU Desktop
executors, including rooms, remote input, rendezvous, path selection, relay
fallback, evidence, and notifications?

## Primary Sources

Official or primary sources checked or rechecked:

- Claude Code Remote Control:
  `https://code.claude.com/docs/en/remote-control`
- OpenAI Codex manual, app features, Windows app, and remote connections:
  `https://developers.openai.com/codex/codex-manual.md`
- OpenAI Codex product and app announcement:
  `https://openai.com/codex/`,
  `https://openai.com/index/introducing-the-codex-app/`
- GitHub Copilot CLI Remote Control:
  `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control`
- GitHub Copilot cloud agent and third-party coding agents:
  `https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent`,
  `https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents`
- GitHub Actions self-hosted runners:
  `https://docs.github.com/en/actions/reference/self-hosted-runners-reference`
- Cursor Background Agents and Web/Mobile Agents:
  `https://docs.cursor.com/background-agent`,
  `https://docs.cursor.com/en/background-agent/web-and-mobile`
- Google Jules:
  `https://jules.google/docs/`
- Devin:
  `https://docs.devin.ai/`,
  `https://docs.devin.ai/onboard-devin/environment`
- Replit Agent:
  `https://docs.replit.com/core-concepts/agent/`
- Factory Droids:
  `https://factory.ai/product/droids`
- Tailscale control/data planes, connection types, peer relay, and DERP:
  `https://tailscale.com/docs/concepts/control-data-planes`,
  `https://tailscale.com/docs/reference/connection-types`,
  `https://tailscale.com/docs/features/peer-relay`,
  `https://tailscale.com/docs/reference/derp-servers`
- Twingate architecture and relays:
  `https://www.twingate.com/docs/how-twingate-works/`,
  `https://www.twingate.com/docs/understanding-relays`
- VS Code Remote Tunnels:
  `https://code.visualstudio.com/docs/remote/tunnels`
- Cloudflare Tunnel:
  `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/`

## Market Shape

The market separates into five product patterns.

| Pattern | Products | What it proves | What MUSU should not copy |
|---|---|---|---|
| Remote control of local execution | Claude Code Remote Control, GitHub Copilot CLI Remote Control, OpenAI Codex Remote connections | Web/mobile can steer a local process while files, shell, tools, credentials, and project context stay on the host machine. | Hiding that the local process must remain awake, online, authenticated, and policy-allowed. |
| Command center for agents | OpenAI Codex app, Factory Droids, Devin, Cursor | Users need multi-agent supervision, parallel work, follow-ups, review, status, and handoff surfaces. | Collapsing local, worktree, cloud, and relay into one vague `connected` state. |
| Hosted async coding agent | GitHub Copilot cloud agent, Cursor Background Agents, Jules, Devin environment, Replit Agent | Planning, branch/PR/artifact flow, background status, and team review are valuable SaaS UX. | Moving MUSU's default executor into a vendor cloud VM and losing local-device proof. |
| Cloud queue to customer machine | GitHub Actions self-hosted runners | Scheduling can use online/idle state, labels, groups, pickup timeout, queued state, and stale-runner failure. | Treating a batch CI runner contract as enough for interactive agent permissions and desktop state. |
| Control plane plus device data plane | Tailscale, Twingate, VS Code Remote Tunnels, Cloudflare Tunnel | Hosted services can coordinate identity, policy, connectors, route candidates, NAT traversal, and fallback relays without being the executor. | Anonymous tunnels, default relay routing, or payload visibility in the control plane. |

## Closest Direct Comparators

Claude Code Remote Control is the cleanest product analogy: a browser or mobile
surface controls a running local session, and the web interface is a window into
that local process rather than the runtime itself. It also makes the local
process requirement explicit: when the local process exits, sleeps too long, or
loses network access, remote control stops.

GitHub Copilot CLI Remote Control makes the same boundary useful in a GitHub
workflow. The remote surface can monitor output, answer questions, approve or
deny permission requests, approve plans, send prompts, switch modes, and cancel
work. The CLI, tools, shell commands, and file operations remain on the machine
where the session started. This maps almost directly to MUSU.PRO remote input
for a local MUSU Desktop runtime.

OpenAI Codex adds the command-center lesson. The Codex app is a desktop
multi-agent command center with projects, threads, worktrees, cloud mode,
skills, automations, Git tools, browser/computer use, and Windows-native
execution. The important MUSU lesson is not "make all work cloud"; it is "make
execution location a first-class choice and make multi-agent supervision
operational."

## Hosted Agent Lessons

GitHub Copilot cloud agent, Cursor Background Agents, Jules, Devin, Replit, and
Factory show what users expect from SaaS agent work:

- task prompt from web/mobile/IDE/issue/Slack;
- repository or project selector;
- implementation plan before risky changes;
- background status and follow-up prompts;
- branch, diff, artifact, or PR handoff;
- review comments that the agent can iterate on;
- notifications when work finishes or needs a decision;
- team visibility and permission policy.

These are good UI expectations for MUSU.PRO. They do not change MUSU's runtime
boundary. For MUSU, the "agent run" record must point to a selected local
device and evidence bundle, not just a cloud work item.

## Network And Relay Lessons

Tailscale is the strongest architecture reference. The coordination server
manages identity, policy, peer discovery, route metadata, NAT traversal, and
DERP selection. The data plane runs on devices. DERP is fallback, and relays
blindly forward encrypted packets rather than becoming the trusted executor.

Twingate reinforces the separation between controller, client, connector, and
relay. The controller does not carry data flow; clients and connectors enforce
authorization and establish encrypted paths, with relay as backup.

Cloudflare Tunnel and VS Code Remote Tunnels validate outbound-only connector
ergonomics. They also show why MUSU must not expose anonymous or public local
agent control tunnels. Agent-control connectors need account ownership,
expiration, revocation, audit, and evidence.

## Product Decision

MUSU.PRO should be positioned as coordination SaaS for local agent operations:

- remote input from web/mobile;
- project/company rooms and AI meeting rooms;
- device and agent presence;
- owner/org policy for remote control;
- authenticated work-order envelopes;
- durable queue with pickup timeout;
- route candidate exchange and path selection;
- relay fallback lease negotiation;
- evidence index and No-Go explanations;
- notifications and review handoff.

MUSU Desktop remains the executor:

- local filesystem, process, tool, secret, browser, and adapter access;
- local permission policy and approval prompts;
- local durable inbox for remote work orders;
- CPU/process/single-instance/route evidence capture;
- P2P direct route attempts;
- release relay byte path when implemented;
- local pause/revoke/keep-awake controls.

## AG UI/UX Requirements

The first screen should be an operator cockpit, not a landing page or generic
chat:

- room selector;
- target device or agent group selector;
- execution locus selector;
- route policy selector: `Local only`, `Prefer direct`, `Allow relay fallback`;
- permission envelope;
- queue/pickup timeout;
- cancel/revoke controls;
- evidence status before submit.

Every run must show an execution-locus strip:

- `Input from <surface>`;
- `Executing on <device/runtime>`;
- `Route <local|lan|direct_quic|peer_relay|hosted_relay|cloud>`;
- `Evidence <ok|missing|failed>`;
- `Remote control <enabled|disabled|policy-blocked>`.

If no eligible local runtime is online, the submit button should not pretend
that MUSU.PRO can run the task. The valid choices are explicit queueing with a
pickup timeout, installing/starting MUSU Desktop on a device, or choosing a
future hosted worker mode if that separate product ever exists.

## Roadmap Impact

P0 release gates:

1. Remove normal release UX that sends users to `localhost`.
2. Make MUSU Desktop mini console the local runtime surface.
3. Add MUSU.PRO work-order composer around room, target, permission, route, and
   evidence.
4. Add authenticated local Desktop work-order inbox.
5. Keep direct P2P as preferred route after MUSU.PRO rendezvous.
6. Finish release-grade relay byte path before flipping payload/runtime markers.
7. Show No-Go blockers in Evidence Center from verifier outputs.

P1 paid SaaS:

1. Remote web/mobile input.
2. Project/company rooms and agent meeting timeline.
3. Multi-device presence and scheduling.
4. Notifications and follow-ups.
5. Team policy for remote control and relay fallback.
6. Evidence history and retention.
7. Hosted relay fallback with explicit proof.

P2 optional expansion:

1. Agent marketplace or third-party agent assignment.
2. Slack/GitHub/issue tracker entry points.
3. Hosted worker mode, but only as a separate execution class with separate
   labels, permissions, billing, and evidence.

## Red Lines

- Do not label remote-control local execution as cloud execution.
- Do not label relay fallback as default route.
- Do not allow anonymous tunnels for agent control.
- Do not accept work immediately when no local runtime is online unless the user
  explicitly queues it.
- Do not close P2P release gates with metadata, lease, or queue proof alone;
  route metadata, transport proof, and payload delivery proof are required.

## Qualitative Assessment

The competitive read is favorable. The market already validates remote
agent-control UX, async agent status, plan approval, team review, and
command-center workflows. MUSU's defensible difference is that it applies those
conveniences to a local device fleet with visible execution location and
evidence. The main product risk is not market demand; it is trust collapse if
the UI hides where work ran or if release markers claim relay/runtime readiness
before byte-level proof exists.

Release meaning is unchanged: this is research/spec progress only. Public
release remains No-Go until second-machine route/CPU/matrix evidence, live
MUSU.PRO P2P route/transport/payload proof, support mailbox proof, and
Store/Partner Center proof pass.
