# Next Steps After MSIX Alias Persisted PATH Gate

## Current State

The release gate now distinguishes:

- persisted User+Machine PATH: release pass/fail
- current process PATH: stale-shell diagnostic

On `HUGH_SECOND`, persisted PATH is clean and current Codex process PATH is
stale.

## Next Actions

1. Commit the persisted PATH gate refinement.
2. Run clean go/no-go and confirm:
   - `msix_current_legacy_conflicts_ok=true`
   - no `msix-current-legacy-conflicts` blocker
   - `current_process_path_stale=true` remains diagnostic only
3. Re-capture clean primary release evidence:
   - single-machine smoke
   - desktop-open idle CPU
   - runtime CPU scenario matrix
   - targeted HUGH-MAIN post-route CPU diagnostic
4. Continue second-PC release kit work.
5. Continue hosted MUSU.PRO release-grade P2P/relay proof.

## Non-Goals

- Do not delete developer `.cargo\bin\musu.exe`.
- Do not use a stale current shell as release pass/fail if persisted PATH is
  clean.
- Do not move local execution into MUSU.PRO.

