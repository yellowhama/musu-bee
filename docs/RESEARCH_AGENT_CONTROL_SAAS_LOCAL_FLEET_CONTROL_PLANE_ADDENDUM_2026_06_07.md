# Agent Control SaaS Local Fleet Control-Plane Addendum

Date: 2026-06-07 19:47 KST

## Scope

This addendum records the operator-requested comparable SaaS deep research pass
after the 19:15 KST local desktop evidence refresh. It focuses on the product
lane closest to MUSU: web/mobile/team input controlling customer-owned local or
self-hosted workers, with evidence that execution location is not hidden.

Confidence:

- high for primary-source product positioning;
- medium for fast-moving startup/commercial surfaces that may change copy or
  availability without stable docs;
- low for third-party valuation/adoption claims, which were not used for
  release decisions.

## Sources Checked

Primary or product-owned sources checked in this pass:

- OpenAI Codex agent loop:
  `https://openai.com/index/unrolling-the-codex-agent-loop/`
- OpenAI Codex repository:
  `https://github.com/openai/codex`
- GitHub Copilot cloud-agent session docs:
  `https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/start-copilot-sessions`
- Cursor Cloud Agents:
  `https://cursor.com/docs/background-agent`
- Claude Code on the web:
  `https://code.claude.com/docs/en/claude-code-on-the-web`
- Google Jules:
  `https://jules.google/`
- OpenHands:
  `https://github.com/OpenHands/OpenHands`
- Replit Agent:
  `https://docs.replit.com/references/agent/overview`
- Xians Agent Control Plane:
  `https://xians.ai/`
- ZyAgents:
  `https://zyagents.com/`
- Pilox:
  `https://pilox.dev/`

## Findings

### Cloud coding agents are converging on command centers

OpenAI Codex, GitHub Copilot cloud agent, Cursor Cloud Agents, Claude Code on
the web, Jules, Devin-like products, and Replit Agent all validate the same UX:
users want to start tasks away from the terminal, monitor long-running work,
approve plans, review logs/artifacts, and receive completion handoff.

The execution model is different from MUSU's default model. GitHub Copilot
cloud agent and Jules use cloud-hosted environments; Claude Code on the web runs
tasks on Anthropic-managed cloud infrastructure; Cursor Cloud Agents use remote
environments; Replit is a hosted workspace. These are strong UX references but
not proof that MUSU should move default execution into cloud workers.

### Codex validates the local executor lane

OpenAI's own Codex materials keep a split that matters to MUSU. The Codex repo
states that Codex CLI runs locally on the user's computer, while Codex Web is a
separate cloud-based agent surface. The Codex agent-loop article describes the
local agent loop as the harness coordinating model inference and tools while
operating on the user's machine.

MUSU should make this split more explicit than competitors:

- `MUSU Desktop` is the local executor and permission boundary.
- `MUSU.PRO` is the command room, remote input surface, rendezvous/control
  plane, evidence index, policy surface, and notification plane.
- Future hosted workers can exist only as a separately labeled execution class.

### Self-hosted control planes are the closer strategic signal

Xians, ZyAgents, Pilox, and OpenHands show a second market lane: keep agents or
workers under customer control while putting routing, queues, rooms, secrets,
observability, policy, or team dashboards in a control plane.

Relevant patterns:

- outbound-only workers are preferable to opening inbound ports;
- device/worker registration uses one-time tokens or explicit enrollment;
- the hub owns source-of-truth task state and audit logs;
- workers own execution and local environment access;
- multi-agent rooms, team chat, labels, status, logs, and permissions are the
  product surface;
- observability and audit history are first-class.

ZyAgents is especially close to the "dispatch Claude/Codex across your own
worker hosts" concept, but it currently positions Windows as future support.
MUSU's Windows desktop/runtime evidence can become a differentiator if kept
strict and visible.

### Control-plane truthfulness is the differentiator

Most competitors optimize for making agent delegation feel simple. MUSU should
optimize for delegation that remains truthful:

- where the input came from;
- which local device accepted it;
- what policy/permission envelope was active;
- which route was attempted;
- whether fallback was direct, peer relay, or hosted relay;
- which proofs were attached;
- whether CPU/process budgets stayed under threshold.

The key product risk is copying hosted-agent UX while hiding execution locus.
That would recreate the user's current confusion around `localhost` versus
local desktop versus web. The UI must not show a generic `connected` state when
it actually means `web input queued`, `local runtime online`, `P2P route
selected`, `relay fallback allowed`, or `proof missing`.

## MUSU Product Implications

MUSU.PRO should be designed as a local-fleet command center:

- Command Center: create orders, select room/device/agent group, choose route
  policy, set budget, and require evidence.
- Project Rooms: meeting-style coordination among humans and local AI workers.
- Agent Grid: role, capability, device assignment, permission tier, current
  run, and evidence freshness.
- Devices: online/offline, version, route candidates, CPU/memory budget,
  remote-control state, and installed runtime health.
- Evidence Center: route metadata, transport proof, payload delivery proof,
  process ownership, CPU matrix, and release blockers.

The first submission flow should reject ambiguity. A work order must explicitly
bind:

- input surface;
- project room;
- target device, best-device policy, or agent group;
- execution locus, default `Local MUSU Desktop`;
- route policy;
- permission envelope;
- queue/pickup timeout;
- evidence requirement.

## Release Interpretation

This research does not close any release gate. It strengthens the current
roadmap:

- do not use `localhost` as user-facing product UX;
- do not let MUSU.PRO claim local execution;
- do not flip relay runtime/source markers while the byte path is still absent;
- keep second-PC proof, live MUSU.PRO P2P/relay proof, support mailbox proof,
  and Store proof as public-release blockers.

## Next Design Decisions

1. Build the MUSU.PRO order composer around execution-locus truth first.
2. Add local Desktop inbox acceptance before treating web input as execution.
3. Represent room/order/run updates as typed events.
4. Keep device registration and remote control revocable and owner-scoped.
5. Make evidence missing a first-class run state, not a post-release audit note.

## 2026-06-07 20:35 KST Current Source Recheck

Additional same-turn recheck used current primary/product-owned sources:

- OpenAI Codex repository:
  `https://github.com/openai/codex`
- OpenAI Codex launch/agent evidence:
  `https://openai.com/index/introducing-codex/`
- OpenAI Codex agent loop:
  `https://openai.com/index/unrolling-the-codex-agent-loop/`
- GitHub Copilot cloud agent:
  `https://code.visualstudio.com/docs/copilot/copilot-cloud-agent`
- Claude Code on the web:
  `https://support.claude.com/en/articles/12618689-claude-code-on-the-web`
- Google Jules:
  `https://jules.google/`, `https://jules.google/docs/`
- OpenHands runtime docs:
  `https://docs.openhands.dev/openhands/usage/v0/runtimes/V0_overview`
- Replit Agent:
  `https://docs.replit.com/references/agent/overview`
- Xians ACP:
  `https://xians.ai/`
- ZyAgents:
  `https://zyagents.com/`
- Pilox:
  `https://pilox.dev/`

Updated read:

- cloud coding-agent products validate command-center UX, task progress,
  review, parallelism, and session logs;
- self-hosted/local-worker control planes are the closer MUSU execution model;
- MUSU must keep the strict product split: MUSU.PRO is the control plane and
  MUSU Desktop is the executor;
- every remote order must show input surface, execution locus, route, and
  evidence before it is treated as real work;
- `localhost` is diagnostic vocabulary only, not public remote-control UX.
