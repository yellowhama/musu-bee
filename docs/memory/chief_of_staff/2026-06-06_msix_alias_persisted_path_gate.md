# 2026-06-06 MSIX alias persisted PATH gate

## Decision

MSIX legacy conflict release pass/fail now uses persisted User+Machine PATH.
Current-process PATH is diagnostic only because already-open shells can keep
stale environment values after User PATH is repaired.

## Evidence

- Persisted PATH result:
  - `ok=true`
  - `alias_shadowing_count=0`
  - `first_alias_path=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- Current Codex process:
  - `current_process_alias_shadowing_count=1`
  - `current_process_first_alias_path=C:\Users\empty\.cargo\bin\musu.exe`
  - `current_process_path_stale=true`
- Dirty-tree go/no-go no longer has `msix-current-legacy-conflicts`; only `git`
  represents this uncommitted state.

## Validation

- parser check: pass
- legacy conflict JSON: pass
- release verifier regression: `61/61`
- dirty-tree go/no-go summary: `msix_current_legacy_conflicts_ok=true`

## Product Status

Fresh terminals resolve the packaged WindowsApps alias first. Already-open
stale shells should be restarted or use the explicit WindowsApps alias.

