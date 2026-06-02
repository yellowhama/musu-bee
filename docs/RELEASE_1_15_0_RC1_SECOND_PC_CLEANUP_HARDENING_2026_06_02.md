# MUSU 1.15.0-rc.1 Second-PC Runtime Cleanup Hardening

Date: 2026-06-02 18:52 KST

Scope: second-PC release wrapper cleanup, return evidence, operator action pack
instructions, and verifier coverage.

## Summary

The second-PC release check now records runtime cleanup evidence at the end of
the run. This directly addresses the process ownership / orphan runtime track:
the wrapper no longer only opens the desktop and starts/uses the bridge; it also
records that it attempted to clean up the bridge and desktop shell it created.

New evidence schema:

- `musu.second_pc_runtime_cleanup.v1`

New return artifact:

- `.local-build\runtime-cleanup\*.runtime-cleanup.json`

## Behavior

`scripts\windows\run-second-pc-release-check.ps1` now runs cleanup in `finally`,
so it executes after both successful and failed second-PC runs.

Cleanup actions:

- resolve the packaged MUSU CLI through the WindowsApps alias first
- run `musu down --json --timeout-sec 5`
- parse and embed the `musu.stop_report.v1` output
- stop packaged `musu-desktop.exe` shells opened by the evidence run
- record remaining packaged desktop shell count and PIDs
- write `.local-build\runtime-cleanup\*.runtime-cleanup.json`
- include that cleanup JSON in the second-PC return zip
- require cleanup success for top-level wrapper `ok=true`

The operator transfer instructions now list the cleanup evidence file, and
`verify-operator-action-pack.ps1` checks that both the transfer quickstart and
nested second-PC kit README explain the cleanup evidence.

## Validation

PowerShell parser validation passed for:

- `scripts\windows\run-second-pc-release-check.ps1`
- `scripts\windows\prepare-multidevice-test-kit.ps1`
- `scripts\windows\prepare-operator-action-pack.ps1`
- `scripts\windows\verify-operator-action-pack.ps1`

Release evidence verifier regression also passed all 13 cases:

- `scripts\windows\test-release-evidence-verifiers.ps1`

Short local wrapper smoke:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 `
  -SkipRuntimeIdleCpu `
  -SkipRuntimeCpuScenarioMatrix `
  -NoReturnZip `
  -CommandTimeoutSec 30 `
  -Json
```

The wrapper stopped at MSIX install evidence capture on `HUGH_SECOND` because
the known development alias `C:\Users\empty\.cargo\bin\musu.exe` shadows the
WindowsApps alias. That is an expected local environment caveat, not a cleanup
failure.

The new cleanup evidence still ran from `finally` and passed:

- cleanup evidence:
  `.local-build\runtime-cleanup\20260602-185052-HUGH_SECOND.runtime-cleanup.json`
- schema: `musu.second_pc_runtime_cleanup.v1`
- `ok=true`
- packaged CLI:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `stop_exit_code=0`
- `remaining_desktop_shell_count=0`
- `error=null`

## Release Meaning

This does not close the second-PC evidence gate by itself. It makes the next
real second-PC run safer and more attributable:

- if the run succeeds, the return zip now proves cleanup
- if the run fails, cleanup still runs and the return zip/summary can show what
  was left behind
- a cleanup failure now prevents top-level wrapper `ok=true`

Public release remains No-Go until current second-PC CPU/matrix/route evidence,
live `musu.pro` P2P owner-scope evidence, `musu@musu.pro` mailbox evidence, and
Store evidence are recorded.
