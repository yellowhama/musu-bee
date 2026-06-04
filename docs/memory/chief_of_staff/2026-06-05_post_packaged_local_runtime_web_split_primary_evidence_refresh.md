# Chief of Staff Memory: Post Packaged Local Runtime / Web Split Primary Evidence Refresh

Date: 2026-06-05

- User confusion root cause is now locked: `127.0.0.1:3001/app` is an optional
  workspace/developer dashboard, not the installed local MUSU program.
- Packaged local runtime health is now proven through WindowsApps `musu.exe`
  bridge evidence with `dashboard_required=false` and
  `single_machine_surface=local-bridge-only`.
- Current single-machine evidence:
  `docs/evidence/single-machine/1.15.0-rc.1/20260605-060842-HUGH_SECOND.evidence.json`
  with bridge `http://127.0.0.1:3591`, packaged executable
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`, and CLI route
  checked.
- Current desktop-open CPU evidence:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260605-061127-HUGH_SECOND.desktop-open.evidence.json`
  passed for `60.054s`, MUSU CPU `0`, Node CPU `0`, WebView2 CPU `0.6`,
  working set `362.17MB`, and hot process count `0`.
- Current runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260605-061306-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed five scenarios with WindowsApps release identity and route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_061306`.
- Process ownership and startup single-instance audits passed on commit
  `7d3e28ea`; startup reused bridge PID `39052` across three `musu up --json`
  calls.
- Direct go/no-go reports local artifacts, single-machine, MSIX install,
  desktop entrypoint, and public metadata OK, but public desktop release remains
  No-Go until second-PC, hosted P2P proof, support mailbox, and Store evidence
  are complete.

