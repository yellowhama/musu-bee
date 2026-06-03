# MUSU 1.15.0-rc.1 Post Relay Connect Primary Evidence Refresh

Date: 2026-06-03 20:05 KST

## Summary

After commit `e592bf608341f0461b03d55c7c0845ccf7781be0`, the local-sideload
MSIX was rebuilt, reinstalled, and primary-machine smoke/CPU evidence was
refreshed on HUGH_SECOND.

The refresh restores current-HEAD primary-machine evidence after the relay
connect fail-closed endpoint source change. It does not close the public release
because second-PC runtime/multi-device evidence, hosted relay payload proof,
support mailbox evidence, and Store evidence remain missing.

## Package

- Package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Startup contract: `local-sideload-manual`
- Signing certificate thumbprint: `9048EA2A9C0891A574C62F9DF2C1D0DA873952DE`

Install note: the previous packaged bridge PID `13732` was still running and
blocked package replacement, so only that installed `musu.exe` bridge process was
stopped before the install continued. Unrelated Node processes were not stopped.

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-195528-HUGH_SECOND.evidence.json`
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-195742-HUGH_SECOND.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-195917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-195917-HUGH_SECOND.verification.json`

## Results

- Single-machine smoke passed with dashboard task
  `c809f3ea-b9a5-4ae1-aed9-8b6a899c3d3a`.
- Smoke output: `MUSU_RELEASE_SMOKE_OK_20260603_195506`.
- CLI route smoke passed.
- Bridge URL: `http://127.0.0.1:10502`.
- Desktop-open CPU passed for `60.059s`.
- Desktop-open CPU max one-core usage:
  - MUSU: `0`
  - Node: `0`
  - WebView2: `0.39`
- Desktop-open working set: `521.48MB`.
- Runtime matrix verifier passed with `ok=true`, `fail_count=0`.
- Runtime matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_195917`.
- Runtime matrix max one-core CPU:
  - MUSU: `0.42`
  - Node: `0.05`
  - WebView2: `0.42`
- Runtime matrix max working set: `527.72MB`.

## Validation

- `scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
  completed successfully.
- `scripts\windows\smoke-single-machine-beta.ps1` passed using the packaged
  WindowsApps alias and `http://127.0.0.1:3001`.
- `scripts\windows\measure-musu-idle-cpu.ps1` passed for `desktop-open`.
- `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` passed five states:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`.
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` passed with
  `fail_count=0`.

## Release Status

Dirty-tree go/no-go after adding evidence reports:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `multi_device_verified=false`
- `p2p_control_plane_verified=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_payload_transport_proven=false`

Public release remains No-Go.
