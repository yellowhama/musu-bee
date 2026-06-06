# MUSU 1.15.0-rc.1 Current HEAD 5-State Runtime CPU Matrix

**Wiki ID**: wiki/875
**Generated**: 2026-06-06 20:48 KST
**HEAD**: `d6e494eabb9dcc70dd90e78b621e7f520067a192`
**Machine**: `HUGH_SECOND`

## Summary

Current HEAD now has fresh primary-machine runtime CPU scenario matrix evidence
covering all required release scenarios:

- `startup-open`
- `runtime-started`
- `dashboard-open`
- `desktop-open`
- `post-route`

The matrix was captured from clean git state with packaged WindowsApps MUSU,
60-second samples, and a successful local post-route probe.

Canonical evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-203857-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-203857-HUGH_SECOND.verification.json`

This restores the primary-machine runtime matrix gate to `1/2`. Public release
still needs the same five-state matrix from a second Windows PC and a targeted
second-PC route attempt sample.

## Route Probe

Post-route probe:

- command:
  `musu route --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260606_203857"`
- result: `ok=true`
- task id: `1bb405b5-76cf-4084-a542-e7ee0beca780`
- token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_203857`
- target: local route, not second-PC route

This proves the current primary machine remains inside CPU/resource budget
after local route execution. It does not prove multi-device routing.

## CPU Matrix

| Scenario | Hot | MUSU | Node | WebView2 | Bridge | Desktop | WebView2 helpers | Working set |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `startup-open` | 0 | 0 | 0 | 0.05 | 1 | 1 | 6 | 179.74 MB |
| `runtime-started` | 0 | 0 | 0 | 0.05 | 1 | 1 | 6 | 179.76 MB |
| `dashboard-open` | 0 | 0 | 0 | 0.10 | 1 | 1 | 6 | 179.72 MB |
| `desktop-open` | 0 | 0 | 0 | 0.03 | 1 | 1 | 6 | 179.72 MB |
| `post-route` | 0 | 0 | 0 | 0.13 | 1 | 1 | 6 | 183.95 MB |

All values are one logical core percentages. Every scenario stayed below the
5% release budget. No Node helper was attributed to MUSU.

## Verification

`verify-runtime-cpu-scenario-matrix.ps1` result:

- `ok=true`
- `fail_count=0`
- present required scenarios:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`
- `require_post_route_probe=true`
- `allow_failed_post_route_probe=false`

Go/no-go after capture:

- `ready_for_public_desktop_release=false`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_idle_cpu_valid_machines=HUGH_SECOND`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machines=HUGH_SECOND`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=0`
- `idle_busy_loop_candidate_contract_verified=true`
- `manifest_dirty=false`

## Qualitative Audit

The reported 20% idle CPU busy-loop is not reproduced on the current primary
packaged desktop matrix. The highest observed WebView2 one-core CPU value was
`0.13`; MUSU runtime, desktop shell, and Node were `0` in every scenario.

No high or medium issue was found in the current primary CPU evidence.

Residual risks:

- this is still one-machine evidence
- post-route probe is local, not a second-PC route
- second-PC CPU/matrix and route proof remain missing
- live MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof remain
  open

## Release Interpretation

This is meaningful progress on the idle busy-loop objective because it fixes
the current primary matrix gap and records process subroles for MUSU bridge,
desktop shell, WebView2, and Node across startup/runtime/dashboard/desktop and
post-route states.

It does not complete the release CPU gate. The release requirement is still two
machines at 60 seconds, <=5% of one logical core, with the same subrole
attribution and post-route coverage.
