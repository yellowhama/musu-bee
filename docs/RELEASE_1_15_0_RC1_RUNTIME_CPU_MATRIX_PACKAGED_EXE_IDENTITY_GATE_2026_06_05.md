# Release 1.15.0-rc.1 Runtime CPU Matrix Packaged Executable Identity Gate

Date: 2026-06-05T04:48+09:00

## Decision

Runtime CPU scenario matrix evidence must now prove that it was captured through
the installed packaged MUSU runtime, not a repo/debug executable.

This keeps the product boundary explicit:

- local MUSU programs execute work on each device
- `localhost` is same-machine loopback, not internet
- the browser dashboard on port 3001 is separate from the packaged local bridge
- `musu.pro` is the remote input, project room, rendezvous, path-selection,
  relay-fallback, and evidence control plane

## Gate Changes

`scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` now:

- defaults `MusuExe` to
  `C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\musu.exe` when the
  WindowsApps alias exists
- falls back to `musu-rs\target\debug\musu.exe` only for developer diagnostics
- rejects non-packaged runtime paths unless `-AllowDeveloperRuntime` is passed
- records `musu_exe`, `allow_developer_runtime`, and
  `musu_exe_release_identity` in matrix evidence

`scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` now rejects release
matrix evidence unless:

- `musu_exe_release_identity=true`, and
- `musu_exe` is a WindowsApps MUSU alias or installed
  `Yellowhama.MUSU_...` package path

`scripts\windows\test-release-evidence-verifiers.ps1` now has a regression
case that proves a debug `musu-rs\target\debug\musu.exe` CPU matrix is rejected.

## Validation

PowerShell parser checks passed for:

- `measure-musu-runtime-cpu-scenarios.ps1`
- `verify-runtime-cpu-scenario-matrix.ps1`
- `test-release-evidence-verifiers.ps1`

Short diagnostic packaged runtime sample:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario runtime-started -SampleSeconds 3 -Json
```

Result summary:

- `ok=true`
- `fail_count=0`
- `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `musu_exe_release_identity=true`
- `git_dirty=true`
- scenario `runtime-started=True`
- max MUSU CPU `0`
- bridge local URL `http://127.0.0.1:7555`

Release evidence verifier regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json
```

Result summary:

- `ok=true`
- `case_count=30`
- `failed_case_count=0`
- new case `runtime matrix rejects debug MUSU executable identity` passed its
  expected failure

`git diff --check` completed without whitespace errors.

## Localhost Note

`http://127.0.0.1:3001/app` can still return connection refused in the repaired
packaged-runtime state because the repo/workspace Next dashboard was
intentionally stopped. That does not mean the local MUSU runtime is missing.
The packaged local bridge is separate and was confirmed at
`http://127.0.0.1:7555`.

## Release Implication

Older runtime CPU matrix evidence that lacks `musu_exe`,
`allow_developer_runtime`, and `musu_exe_release_identity` is no longer
release-grade.

Public release remains No-Go until:

- a fresh clean-source 60-second packaged runtime CPU matrix is captured after
  this commit,
- two-machine idle CPU and runtime matrix evidence pass,
- current-build second-PC multi-device evidence is recorded,
- hosted `musu.pro` P2P control-plane evidence passes,
- support mailbox evidence is recorded, and
- Store evidence is recorded.
