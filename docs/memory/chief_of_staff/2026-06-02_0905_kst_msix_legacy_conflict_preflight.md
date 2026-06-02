# Chief of Staff Memory: MSIX Legacy Conflict Preflight

Date: 2026-06-02 09:05 KST

## Durable Decision

WindowsApps alias shadowing and stale legacy launch helpers are now release
handoff evidence, not ad hoc operator notes.

`scripts\windows\check-msix-legacy-conflicts.ps1` emits
`musu.msix_legacy_conflicts.v1` JSON and supports `-Json`, `-OutputPath`, and
`-FailOnProblem`. `run-second-pc-release-check.ps1` includes the JSON in
second-PC return zips when present, and `import-second-pc-return.ps1` preserves
returned files under `.local-build\msix-legacy-conflicts`.

## Current Finding

Local `HUGH_SECOND` validation reports no active startup helpers, scheduled
tasks, or legacy `~\.musu\bin` binaries. It does report one alias shadow:
`C:\Users\empty\.cargo\bin\musu.exe` appears before
`C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`.

This is an operator-shell cleanliness issue. It is not new evidence of a MUSU
runtime CPU loop, and packaged evidence can still be captured through the
explicit WindowsApps alias path. For final release handoff, the conflict should
either be removed or recorded in the second-PC/Store evidence packet.

## Validation

- PowerShell parser checks passed for edited scripts.
- `check-msix-legacy-conflicts.ps1 -Json` produced the expected schema.
- `check-msix-legacy-conflicts.ps1 -Json -FailOnProblem` exits `1` on the
  known local alias shadow.
- `check-msix-legacy-conflicts.ps1 -OutputPath ... -Json` writes JSON.
- `import-second-pc-return.ps1 -Json` remains compatible with the older
  `20260531-165240-HUGH-MAIN.second-pc-return.zip`, where this optional JSON is
  absent.

## Follow-Up

Keep `musu.msix_legacy_conflicts.v1` in the next second-PC run and Partner
Center handoff packet. Do not treat machine-wide shell alias conflicts as
runtime CPU evidence unless CPU/process ownership samples show MUSU-owned hot
processes.
