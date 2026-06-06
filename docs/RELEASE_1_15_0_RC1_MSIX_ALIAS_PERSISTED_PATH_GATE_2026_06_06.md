# MUSU 1.15.0-rc.1 MSIX Alias Persisted PATH Gate

**Wiki ID**: wiki/827
**Date**: 2026-06-06

## Summary

The MSIX legacy conflict check now separates release-relevant persisted PATH
state from the current process PATH inherited by an already-open shell.

This fixes the ambiguity discovered after wiki/825:

- the current Codex/PowerShell process still resolves `musu` to the developer
  binary first
- the persisted User PATH has already been corrected so a fresh terminal
  resolves the WindowsApps packaged alias first

Release pass/fail should use the persisted User+Machine PATH that a fresh user
shell receives. Stale already-open shells remain visible as diagnostic fields.

## Change

Updated `scripts/windows/check-msix-legacy-conflicts.ps1`:

- computes `alias_sources`, `first_alias_path`, and `alias_shadowing_count`
  from persisted Machine PATH plus User PATH
- emits `alias_path_scope=persisted_user_machine`
- preserves current process details separately:
  - `current_process_alias_sources`
  - `current_process_first_alias_path`
  - `current_process_alias_shadowing`
  - `current_process_alias_shadowing_count`
  - `current_process_path_stale`
- keeps startup helpers, scheduled tasks, and legacy bins as hard failures

Updated `scripts/windows/test-release-evidence-verifiers.ps1`:

- adds source-contract case
  `MSIX legacy conflict check separates persisted and current process PATH`

## Current HUGH_SECOND Result

`scripts/windows/check-msix-legacy-conflicts.ps1 -Json` now reports:

- `ok=true`
- `alias_path_scope=persisted_user_machine`
- `alias_shadowing_count=0`
- `first_alias_path=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `current_process_alias_shadowing_count=1`
- `current_process_first_alias_path=C:\Users\empty\.cargo\bin\musu.exe`
- `current_process_path_stale=true`

Dirty-tree go/no-go after the change reports:

- `msix_current_legacy_conflicts_ok=true`
- `alias_shadowing_count=0`
- `current_process_path_stale=true`
- no `msix-current-legacy-conflicts` blocker
- `git` blocker remains only because the script/docs change is uncommitted

## Validation

Passed:

- PowerShell parser check for changed scripts
- `scripts/windows/check-msix-legacy-conflicts.ps1 -Json`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=61`, `failed_case_count=0`
- dirty-tree go/no-go summary shows the alias blocker removed while current
  process stale state remains visible

## Qualitative Audit

No high or medium issue was found in the changed code surface.

This is release gate accuracy hardening. It does not weaken the installed MUSU
identity requirement: a fresh operator shell still has to resolve the packaged
WindowsApps alias first. It only prevents an already-open automation shell with
stale environment variables from being treated as a permanent machine-level
release blocker.

## Product Boundary

- MUSU Desktop remains the local executor.
- The packaged WindowsApps alias remains the release CLI/runtime identity.
- Developer `musu 1.15.0-dev` remains diagnostic only.
- MUSU.PRO remains remote input, company/project room, rendezvous,
  path-selection, relay fallback, and evidence/control plane.

## Next Steps

- Commit this gate refinement, then rerun clean go/no-go.
- Re-capture primary single-machine and CPU evidence from clean HEAD.
- Continue second-PC and hosted P2P proof work.

