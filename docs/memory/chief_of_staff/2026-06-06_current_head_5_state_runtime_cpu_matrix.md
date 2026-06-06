# 2026-06-06 Current HEAD 5-State Runtime CPU Matrix

Current HEAD `d6e494eabb9dcc70dd90e78b621e7f520067a192` restored the
primary-machine five-state runtime CPU matrix on `HUGH_SECOND`.

Canonical evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-203857-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-203857-HUGH_SECOND.verification.json`

Matrix:

- `startup-open`: hot `0`, MUSU `0`, Node `0`, WebView2 `0.05`, working set
  `179.74MB`
- `runtime-started`: hot `0`, MUSU `0`, Node `0`, WebView2 `0.05`, working set
  `179.76MB`
- `dashboard-open`: hot `0`, MUSU `0`, Node `0`, WebView2 `0.10`, working set
  `179.72MB`
- `desktop-open`: hot `0`, MUSU `0`, Node `0`, WebView2 `0.03`, working set
  `179.72MB`
- `post-route`: hot `0`, MUSU `0`, Node `0`, WebView2 `0.13`, working set
  `183.95MB`

All scenarios recorded `bridge_runtime=1`, `desktop_shell=1`, and
`webview2_helper=6`.

Route probe:

- local `musu route --wait`
- token `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_203857`
- task `1bb405b5-76cf-4084-a542-e7ee0beca780`
- `ok=true`

Verifier:

- `ok=true`
- `fail_count=0`
- all required scenarios present
- post-route probe required and successful

Go/no-go after capture:

- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=0`
- `manifest_dirty=false`
- public release remains No-Go

Interpretation:

- primary 20% busy-loop is not reproduced
- primary runtime matrix is restored to `1/2`
- second-PC CPU/matrix and targeted route proof are still required
