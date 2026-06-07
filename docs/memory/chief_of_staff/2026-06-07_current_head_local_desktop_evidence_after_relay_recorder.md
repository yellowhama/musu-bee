# 2026-06-07 Current-HEAD Local Desktop Evidence After Relay Recorder

Current HUGH_SECOND packaged local desktop evidence was refreshed after the
release relay payload route evidence recorder.

Promoted evidence:

- MSIX install: `20260607-185659-HUGH_SECOND`
- single-machine smoke: `20260607-185741-HUGH_SECOND`
- process ownership: `20260607-185807-HUGH_SECOND`
- startup single-instance: `20260607-185807-HUGH_SECOND`
- desktop single-instance: `20260607-185821-HUGH_SECOND`
- desktop-open idle CPU:
  `20260607-190027-HUGH_SECOND.desktop-open.evidence.json`
- full runtime CPU matrix:
  `20260607-190401-HUGH_SECOND.current-head-after-relay-recorder`
- target-route diagnostic:
  `20260607-191020-HUGH_SECOND.current-head-target-route-after-relay-recorder`

Runtime result:

- full matrix `ok=true`, `fail_count=0`, `git_dirty=false`
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max `0.08`
- owned WebView2 helpers `6`
- max working set `365.22MB`
- target `PRIMARY-PC` failed with `peer 'PRIMARY-PC' not found`
- target failure was explicitly allowed and verified as CPU diagnostic evidence

Go/no-go after evidence promotion:

- local artifacts: true
- single-machine: true
- runtime idle CPU valid machines: `1`
- runtime CPU matrix valid machines: `1`
- runtime second-PC route attempt valid machines: `1`
- process/startup/desktop single-instance: true
- public release: No-Go

Open gates remain multi-device proof, second-machine CPU/matrix, live MUSU.PRO
P2P/relay proof, support mailbox proof, Store proof, and clean git after
committing this evidence/docs update.

Product decision remains unchanged: MUSU.PRO is command center, remote input,
rooms, rendezvous, route policy, relay fallback, evidence, notification, and
owner/org policy. MUSU Desktop remains the executor.

Search terms should include `GOAL v836`, `wiki/1011`,
`current-head local desktop evidence after relay recorder`,
`20260607-190401-HUGH_SECOND`, `20260607-191020-HUGH_SECOND`,
`PRIMARY-PC peer not found`, `runtime_cpu_scenario_matrix_valid_machine_count=1`,
and `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`.
