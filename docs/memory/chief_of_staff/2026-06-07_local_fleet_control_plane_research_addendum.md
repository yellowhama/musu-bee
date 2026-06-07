# 2026-06-07 Local Fleet Control-Plane Research Addendum

Comparable SaaS research was refreshed for the local-fleet control-plane lane.

Key conclusion:

- cloud coding agents validate command-center UX;
- self-hosted/local-worker control planes validate MUSU.PRO as coordination,
  routing, audit, and policy plane;
- MUSU Desktop must stay the executor and local permission boundary;
- hosted workers, if added later, need a distinct execution class with separate
  policy, billing, and evidence.

Sources checked include OpenAI Codex agent-loop/repo, GitHub Copilot cloud
agent docs, Cursor Cloud Agents, Claude Code on the web, Jules, OpenHands,
Replit Agent, Xians ACP, ZyAgents, and Pilox.

Product lock:

- show `Input`, `Executing on`, `Route`, and `Evidence` before and during every
  run;
- never collapse `remote control`, `local runtime online`, `P2P route`,
  `relay fallback`, and `proof missing` into one generic connected state;
- `localhost` remains diagnostic, not release UX.

Canonical report:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LOCAL_FLEET_CONTROL_PLANE_ADDENDUM_2026_06_07.md`
