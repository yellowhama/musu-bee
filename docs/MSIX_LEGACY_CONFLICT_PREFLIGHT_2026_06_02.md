# MSIX Legacy Conflict Preflight

**Wiki ID**: wiki/541
**Date**: 2026-06-02 09:05 KST

## Scope

This preflight turns the recurring WindowsApps alias shadowing and legacy
startup conflict class into machine-readable release tooling.

The problem it addresses is not a MUSU runtime CPU loop by itself. It is an
operator environment risk: a development or old direct-download `musu.exe` can
appear earlier on `PATH` than the packaged WindowsApps alias, causing smoke
commands to test the wrong binary.

## Change

`scripts\windows\check-msix-legacy-conflicts.ps1` now supports:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-msix-legacy-conflicts.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-msix-legacy-conflicts.ps1 -Json -FailOnProblem
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-msix-legacy-conflicts.ps1 -OutputPath .local-build\msix-legacy-conflicts\<stamp>.json -Json
```

The JSON schema is `musu.msix_legacy_conflicts.v1`.

It records:

- active legacy startup folder helpers
- active legacy scheduled tasks
- legacy `~\.musu\bin` executables
- WindowsApps alias presence
- all `musu.exe` command sources found through `Get-Command -All`
- paths that shadow the WindowsApps alias
- pass/fail checks for automation

`run-second-pc-release-check.ps1` now writes this JSON to
`.local-build\msix-legacy-conflicts\...` and includes it in the second-PC return
zip when present.

`import-second-pc-return.ps1` preserves returned
`musu.msix_legacy_conflicts.v1` files under `.local-build\msix-legacy-conflicts`.

The release evidence freshness allowlist now treats
`check-msix-legacy-conflicts.ps1` as exact release tooling, not runtime source.

## Local Result

On `HUGH_SECOND`, the preflight currently reports `ok=false` because
`C:\Users\empty\.cargo\bin\musu.exe` shadows
`C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`.

Counts:

- startup helpers: `0`
- scheduled tasks: `0`
- legacy bin artifacts: `0`
- alias shadowing: `1`

This is an operator-shell cleanliness issue. Packaged evidence can still be
captured safely by using the explicit WindowsApps alias path, but final
operator runs should either remove the stale dev alias or record the conflict
explicitly.

## Validation

Validation passed:

- PowerShell parser checks for edited scripts
- `check-msix-legacy-conflicts.ps1 -Json`
- `check-msix-legacy-conflicts.ps1 -Json -FailOnProblem` exits `1` on the
  known local alias shadow
- `check-msix-legacy-conflicts.ps1 -OutputPath ... -Json` writes the JSON file
- `import-second-pc-return.ps1 -Json` remains compatible with the older
  `20260531-165240-HUGH-MAIN.second-pc-return.zip`, where the new optional
  legacy-conflict JSON is absent

## Release Interpretation

This does not close public release blockers by itself. It prevents a known
operator environment problem from being hidden during second-PC and Store
handoff runs.
