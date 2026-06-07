# 2026-06-07 AG UI/UX SaaS Landscape Design

AG UI/UX design was added as
`docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`.

Research sources checked on 2026-06-07:

- OpenAI Codex product/help
- GitHub Copilot cloud agent docs
- Cursor background agents docs
- Google Jules docs
- Devin docs
- Replit Agent docs

Main conclusion:

- comparable SaaS products optimize for cloud or remote async execution;
- MUSU should optimize for remote input with explicit local execution;
- every run must expose input source, execution device, route kind, and
  evidence state;
- primary navigation should be Command Center, Project Rooms, Agent Grid,
  Devices, Tasks, Evidence, and Settings;
- Project Rooms should model the "AI company meeting room" concept where local
  agents coordinate, propose plans, request approval, and attach evidence.

Design is kept under `docs\` so release freshness gates do not confuse
root-level design-system edits with runtime-affecting changes.

Product boundary remains unchanged: MUSU.PRO coordinates remote input, rooms,
rendezvous, path selection, relay fallback, and evidence. Local MUSU Desktop
runtimes execute work.
