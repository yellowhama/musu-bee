# 2026-06-06 Post-Degraded-Gate Primary Evidence Refresh

Context:

- The degraded/fallback contract gate changed Next/API source at
  `701988f39ce2f293077198e853d68cf84c470b5d`, so prior runtime evidence became
  source-stale.
- User objective remains local desktop execution with MUSU.PRO as remote input,
  project/meeting-room coordination, rendezvous, path selection, and relay
  fallback control plane.

What was refreshed:

- Packaged runtime repair succeeded and restarted the local runtime through the
  WindowsApps alias.
- New bridge: `http://127.0.0.1:4760`, PID `32780`.
- Single-machine smoke passed:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-043041-HUGH_SECOND.evidence.json`.
- Desktop-open idle CPU passed:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-043051-HUGH_SECOND.desktop-open.evidence.json`.
- Full five-scenario runtime CPU matrix passed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
- Targeted `HUGH-MAIN` post-route CPU attempt passed CPU verification with
  route failure allowed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043811-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.

CPU findings:

- Desktop-open sample: `60.039s`, `git_dirty=false`, MUSU `0`, Node `0`,
  WebView2 `0.03`, hot `0`, working set `369.01MB`.
- Full matrix: `git_dirty=false`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_043203`, max MUSU `0`, Node `0`,
  WebView2 `0.1`, max working set `371.01MB`.
- Targeted post-route: `HUGH-MAIN` route timed out at
  `http://192.168.1.192:8949/api/tasks/delegate`, failure was explicitly
  allowed, and post-route WebView2 max was `0.05` with hot `0`.

Audit conclusion:

- Primary idle busy-loop is not reproduced on current packaged `HUGH_SECOND`
  evidence.
- This is not real second-PC route success. It only proves the primary runtime
  stays within CPU budget after a failed targeted route attempt.
- Remaining release blockers are second-PC CPU/matrix/route evidence, hosted
  MUSU.PRO P2P/relay proof, support mailbox proof, and Store evidence.
