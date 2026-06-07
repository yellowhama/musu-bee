# 2026-06-07 Agent Control SaaS Operator Deep Dive

Operator-requested deeper SaaS research was added as:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_OPERATOR_DEEP_DIVE_2026_06_07.md`

The report separates comparable products into five execution patterns:

- remote control of local execution;
- command center for multiple agents;
- hosted async coding agent;
- cloud queue to customer-owned runner;
- control plane plus device data plane.

Closest direct comparators:

- Claude Code Remote Control
- GitHub Copilot CLI Remote Control
- OpenAI Codex Remote connections

Decision:

- MUSU.PRO remains web/mobile/team coordination SaaS for remote input, rooms,
  meeting timeline, presence, authenticated work-order envelopes, rendezvous,
  path selection, relay fallback negotiation, evidence, notifications, and
  policy.
- MUSU Desktop remains the local executor and owns filesystem, process, tools,
  adapters, secrets, local approval prompts, durable inbox, and evidence.
- Hosted coding-agent products validate plan/status/review/team UX but do not
  change MUSU's default execution model.
- Relay/tunnel fallback remains explicit, authenticated, revocable, and proof
  gated by route metadata, transport proof, and payload delivery proof.

Search terms should include `operator deep dive`, `remote control of local
execution`, `GitHub Copilot CLI Remote Control`, `Codex Remote connections`,
`cloud queue to customer-owned runner`, `Command Center`,
`local MUSU Desktop executor`, and `route metadata transport proof payload
delivery proof`.
