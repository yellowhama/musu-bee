# 2026-06-07 Agent Control SaaS Deep Research

Deep research was added for comparable SaaS and agent-control products:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`
- updated `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`
- updated BETA checklist product split
- updated runtime stabilization execution plan

Key conclusion:

- Claude Code Remote Control is the closest direct comparator: web/mobile
  controls a local agent session, while execution remains on the local machine.
- OpenAI Codex, GitHub Copilot cloud agent, Cursor Background Agents, Jules,
  Devin, and Replit mostly validate command-center, background-agent, plan,
  branch/log/review, team/ticket, and natural-language order patterns.
- Tailscale and ngrok validate the control-plane/data-plane and outbound
  connector/relay concepts.

Product boundary:

- MUSU.PRO is remote input, rooms, presence, rendezvous, path selection, relay
  fallback, evidence history, notifications, and team permissions.
- MUSU Desktop is the local executor on each device.
- Paid MUSU.PRO value should be coordination infrastructure, not hosted default
  execution.
- `localhost:3001` should not be the normal release user path.

Release impact:

- This is docs/spec/research progress only.
- Public release remains No-Go until second-PC route/CPU/matrix evidence, live
  MUSU.PRO release-grade relay proof, support mailbox proof, and Store proof
  pass.

Search terms should include `agent control SaaS deep research`,
`Claude Code Remote Control`, `MUSU.PRO remote input`,
`local MUSU Desktop execution`, `control plane data plane`, `Agent Grid`,
`Project Rooms`, and `Device Mesh`.
