# 2026-06-07 Current-HEAD CPU Matrix After Agent Control Research

After commit `13dcd4677fde12daa6454b4064ca14da55b3a3ae`, HUGH_SECOND captured
a clean packaged runtime CPU matrix with `-OpenDesktopApp`, `-RunRouteProbe`,
target `HUGH-MAIN`, and `-AllowFailedRouteProbe`.

Promoted evidence:

- `20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- `20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- `20260607-141207-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`
- per-scenario startup/runtime/dashboard/desktop/post-route evidence JSON files

Results:

- full matrix verifier `ok=true`, `fail_count=0`
- post-route target verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- packaged WindowsApps MUSU command
- hot process count `0` in all five scenarios
- MUSU CPU `0`, Node CPU `0`
- owned WebView2 max `0.13`
- working set range `370.07-370.13MB`

The route probe still timed out to
`http://192.168.1.192:8949/api/tasks/delegate` with `exit_code=1`,
`raw_exit_code=1`, `ok=false`, and `failure_allowed=true`.

Interpretation:

- the reported 20% busy-loop did not reproduce on HUGH_SECOND/current HEAD
- this is valid failed target-route CPU diagnostic evidence
- this is not successful second-PC route proof
- release still needs second-PC CPU/matrix, live MUSU.PRO P2P/relay proof,
  support mailbox proof, and Store proof

Search terms should include `current-head CPU matrix after agent control
research`, `20260607-141207-HUGH_SECOND`, `13dcd467`, `HUGH-MAIN timeout`,
`WebView2 max 0.13`, and `MUSU CPU 0`.
