# 2026-06-07 Current-HEAD Desktop-Open CPU And Research Gate Recheck

Current HEAD `41ce3d71e14138cf44d6d9d4879bf1c939508deb` has fresh
HUGH_SECOND packaged desktop-open idle CPU evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-150047-HUGH_SECOND.desktop-open.evidence.json`

Result:

- `ok=true`
- `git_dirty=false`
- `60.048s`
- MUSU `0`
- Node `0`
- owned WebView2 max `0.13`
- owned WebView2 helpers `6`
- hot process count `0`
- working set `370.64MB`

Dirty-tree go/no-go after evidence promotion restored
`runtime_idle_cpu_valid_machine_count=1`, kept
`runtime_cpu_second_pc_route_attempt_valid_machine_count=1`, and correctly kept
`runtime_cpu_scenario_matrix_valid_machine_count=0` because the current matrix
evidence is failed target-route CPU diagnostic proof, not successful post-route
release proof.

The 15:00 KST SaaS source recheck reconfirmed the product split:

- MUSU Desktop executes locally on each device.
- MUSU.PRO receives remote input, coordinates rooms/presence/rendezvous/path
  selection, issues relay fallback leases, and indexes evidence.
- `localhost:3001` is not the normal packaged desktop release path.

Next proof remains second-PC MUSU Desktop install/run/reachability, successful
route/CPU/matrix evidence, live `musu.pro` P2P/relay proof, support mailbox,
and Store/Partner Center evidence.
