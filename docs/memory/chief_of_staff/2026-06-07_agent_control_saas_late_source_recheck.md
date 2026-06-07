# 2026-06-07 Agent Control SaaS Late Source Recheck

Late same-day comparable SaaS research was added after the second-PC route
preflight helper.

Canonical report:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LATE_RECHECK_2026_06_07.md`

Updated specs/docs:

- `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`
- `docs\GOAL.md`
- `docs\WIKI.md`
- `docs\WIKI_INDEX.md`

Product boundary remains unchanged:

- MUSU.PRO is the command-room/control-plane SaaS for remote input, rooms,
  presence, rendezvous, path selection, relay fallback, evidence,
  notifications, and owner/org policy.
- MUSU Desktop is the local executor and permission boundary.
- AG UI should use typed room/order/run event streams, but those events are
  control metadata unless local Desktop accepts and executes an authenticated
  work order.

Release remains No-Go on real second-PC route/CPU/matrix evidence, live
owner-scoped MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.
