# 1.15.0-rc.1 Current-HEAD Target Route CPU Matrix and Selection Gate

Date: 2026-06-07 KST

## Summary

Current HEAD `c71915aa86b94241cbd12d53b88c303c324a599b` now has a fresh
five-state runtime CPU matrix on `HUGH_SECOND` after a targeted second-PC route
attempt to `HUGH-MAIN`.

The route attempt did not connect. It timed out at
`http://192.168.1.192:8949/api/tasks/delegate`, so this is still not
successful two-machine route proof. It does prove the local packaged runtime
stays under the idle CPU/resource budget before and after that failed targeted
route attempt.

## Evidence

Promoted evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.startup-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.runtime-started.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.dashboard-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.desktop-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.post-route.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`

Capture command:

```powershell
.\scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 `
  -OpenDesktopApp `
  -RunRouteProbe `
  -RouteTarget HUGH-MAIN `
  -AllowFailedRouteProbe `
  -RouteWaitTimeoutSec 180 `
  -CommandTimeoutSec 90 `
  -SampleSeconds 60 `
  -Json
```

## CPU Results

All scenarios passed the 60s, <=5% of one logical core budget:

| Scenario | MUSU processes | Node processes | WebView2 processes | Hot processes | MUSU max | Node max | WebView2 max | Bridge max | Desktop shell max | Working set |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `startup-open` | 2 | 0 | 6 | 0 | 0 | 0 | 0.16 | 0 | 0 | 363.98MB |
| `runtime-started` | 2 | 0 | 6 | 0 | 0 | 0 | 0.03 | 0 | 0 | 364.08MB |
| `dashboard-open` | 2 | 0 | 6 | 0 | 0 | 0 | 0.10 | 0 | 0 | 364.18MB |
| `desktop-open` | 2 | 0 | 6 | 0 | 0 | 0 | 0.08 | 0 | 0 | 364.13MB |
| `post-route` | 2 | 0 | 6 | 0 | 0 | 0 | 0.16 | 0 | 0 | 364.08MB |

Verifier results:

- five-state matrix with failed route allowed:
  `ok=true`, `fail_count=0`
- targeted second-PC route-attempt verifier:
  `ok=true`, `fail_count=0`

## Route Attempt Result

Route target:

- `HUGH-MAIN`

Route command:

```powershell
musu route --target HUGH-MAIN --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260607_122313"
```

Result:

- `ok=false`
- `failure_allowed=true`
- `exit_code=1`
- error: timeout sending request to
  `http://192.168.1.192:8949/api/tasks/delegate`

This preserves the current blocker: `HUGH-MAIN` is still not reachable as a
release-grade second PC route target from this machine.

## Selection Gate Hardening

The runtime CPU scenario matrix and targeted second-PC route-attempt evidence
share the same evidence directory and file suffix. Single-scenario target-route
files can otherwise crowd out older complete five-state matrices in a
latest-per-machine candidate scan.

`scripts\windows\write-release-go-no-go.ps1` now selects runtime CPU scenario
matrix candidates as:

- latest candidates per machine;
- plus latest candidates per machine that contain all required scenarios:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`;
- plus latest candidates per machine that contain a target-bearing
  `post-route` route probe.

The reported selection mode is now:

```text
latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates
```

`scripts\windows\test-release-evidence-verifiers.ps1` source-checks this
selection contract.

## Go/No-Go Impact

Pre-commit Go/No-Go after the change:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- `multi_device_verified=false`
- `p2p_control_plane_env_ready=false`

Public release remains No-Go until a second Windows PC contributes successful
runtime idle CPU and matrix evidence, real multi-device route evidence,
release-grade MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.

## Validation

- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` five-state failed-route-allowed verifier: `ok=true`, `fail_count=0`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` targeted post-route verifier: `ok=true`, `fail_count=0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `case_count=104`, `failed_case_count=0`
- `scripts\windows\write-release-go-no-go.ps1 -Json`: completed and wrote `.local-build\go-no-go\latest.json`
- `git diff --check`: passed
