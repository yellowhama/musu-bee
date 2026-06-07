# 2026-06-07 One-Machine MUSU.PRO Work-Order Smoke Gate

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ONE_MACHINE_MUSU_PRO_WORK_ORDER_SMOKE_GATE_2026_06_07.md`

Code:

- `scripts\windows\smoke-one-machine-musu-pro-work-order.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Evidence:

- `docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260607-213245-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`

Current result:

- schema `musu.one_machine_musu_pro_work_order.v1`
- `ok=false`
- `fail_count=10`
- local packaged runtime starts through WindowsApps alias
- `musu up --json` passes
- `doctor` is not failed
- bridge URL is discovered as `http://127.0.0.1:9741`
- fixed `localhost:3001` assumption is `false`
- account login is missing
- room presence publish/list return `not_logged_in`
- P2P control token is missing
- work-order POST is skipped
- Desktop outbound pickup and post-run CPU evidence are not proven

Decision:

- This is a valid diagnostic No-Go, not a release pass.
- The local program is alive; the missing product path is authenticated
  MUSU.PRO order delivery to the local Desktop.
- Hosted `https://musu.pro` must not try to call the user's `127.0.0.1`
  bridge directly. The required next implementation is durable owner-scoped
  work-order inbox, Desktop outbound pickup/claim, local execution, result
  return, and post-run idle CPU linkage.

Search terms should include `one-machine MUSU.PRO work-order smoke gate`,
`musu.one_machine_musu_pro_work_order.v1`, `20260607-213245-HUGH_SECOND`,
`not_logged_in`, `P2P control token`, `Desktop outbound pickup`,
`127.0.0.1:9741`, and `localhost:3001`.
