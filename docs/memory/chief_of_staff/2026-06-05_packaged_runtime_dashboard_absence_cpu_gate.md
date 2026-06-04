# Chief of Staff Memory: Packaged Runtime Dashboard Absence CPU Gate

Date: 2026-06-05T05:06+09:00

Decision:

- Runtime CPU matrix verification now accepts packaged runtime evidence when
  `dashboard-open` cannot open a URL because packaged `musu up --json` exposes
  no dashboard URL.
- This avoids requiring the repo/workspace `127.0.0.1:3001/app` dashboard for
  packaged local-runtime evidence.
- Debug `musu-rs\target\debug\musu.exe` CPU matrix evidence remains rejected.

Fresh HUGH_SECOND evidence:

- Matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-045524-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with `ok=true`, clean git, WindowsApps `musu.exe`,
  `musu_exe_release_identity=true`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_045524`, route task
  `095647cf-83da-46eb-81ec-bd79a81402eb`, and verifier `fail_count=0`.
- Idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-050112-HUGH_SECOND.desktop-open.evidence.json`
  with `ok=true`, `60.055s`, MUSU CPU `0`, Node CPU `0`, WebView2 max CPU
  `0.13`, hot process count `0`, and working set `360.32MB`.

Validation:

- Parser checks passed for the changed verifier and regression script.
- Direct verifier passed against the fresh matrix.
- Release evidence verifier regression passed with `ok=true`, `case_count=31`,
  and `failed_case_count=0`.
- Dirty go/no-go saw runtime idle CPU `1/2 [HUGH_SECOND]` and runtime matrix
  `1/2 [HUGH_SECOND]`.

Release status:

- One-machine packaged local runtime CPU evidence is restored.
- Public release remains No-Go on second-PC CPU/matrix, current-build
  multi-device evidence, hosted P2P, support mailbox, and Store evidence.
