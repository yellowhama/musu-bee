# Release 1.15.0-rc.1 Packaged Runtime Dashboard Absence CPU Gate

Date: 2026-06-05T05:06+09:00

## Decision

Runtime CPU scenario matrix verification no longer requires a development
dashboard URL when the installed packaged MUSU runtime does not expose one.

This matches the product split:

- the local MUSU program executes work on the device
- the packaged local bridge is the runtime control surface for local evidence
- `musu.pro` is the remote input, project-room, rendezvous, path-selection,
  relay-fallback, and evidence control plane
- a repo/workspace dashboard such as `127.0.0.1:3001/app` is not required for
  packaged runtime CPU release evidence

## Gate Change

`verify-runtime-cpu-scenario-matrix.ps1` now accepts `dashboard-open` when:

- a dashboard URL was opened, or
- the matrix proves packaged MUSU executable identity,
- `musu up --json` was used to discover a dashboard URL,
- no dashboard URL was exposed, and
- the scenario still measured the current packaged runtime state.

The release verifier regression suite now includes:

- `runtime matrix accepts packaged runtime without dashboard URL`

The previous executable identity hardening remains in force: debug
`musu-rs\target\debug\musu.exe` matrix evidence is still rejected.

## Fresh One-Machine Evidence

Fresh HUGH_SECOND packaged-runtime CPU evidence was captured after commit
`7c3939e76e7d6808d10b90b052f27bf542addc49`.

Runtime CPU scenario matrix:

- path:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-045524-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `ok=true`
- `git_dirty=false`
- `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `musu_exe_release_identity=true`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- `dashboard-open` did not launch a dashboard URL because packaged
  `musu up --json` exposed none; it measured packaged runtime state instead
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_045524`
- route task: `095647cf-83da-46eb-81ec-bd79a81402eb`
- max observed role CPU: MUSU `0.03`, Node `0`, WebView2 `1.07`
- max working set observed in the matrix stayed below the `1024MB` budget
- verifier after the gate change reported `ok=true`, `fail_count=0`

Runtime idle CPU:

- path:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-050112-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- `git_dirty=false`
- scenario: `desktop-open`
- sample duration: `60.055s`
- owned WebView2 required and present
- MUSU CPU `0`
- Node CPU `0`
- WebView2 max CPU `0.13`
- hot process count `0`
- working set `360.32MB`

## Validation

Validation passed:

- PowerShell parser for `verify-runtime-cpu-scenario-matrix.ps1`
- PowerShell parser for `test-release-evidence-verifiers.ps1`
- direct verifier against the fresh matrix:
  - `ok=true`
  - `fail_count=0`
- release evidence verifier regression:
  - `ok=true`
  - `case_count=31`
  - `failed_case_count=0`
- dirty-tree go/no-go after the fresh evidence:
  - runtime idle CPU `1/2 [HUGH_SECOND]`
  - runtime CPU scenario matrix `1/2 [HUGH_SECOND]`
  - process ownership `true`
  - startup single-instance `true`
  - single-machine `true`

## Release Implication

The current one-machine packaged local runtime CPU evidence is restored under
the new executable-identity and dashboard-absence rules.

Public release remains No-Go because the release still requires:

- two-machine idle CPU and runtime matrix evidence,
- current-build second-PC multi-device evidence,
- hosted `musu.pro` P2P control-plane evidence,
- support mailbox evidence, and
- Store evidence.
