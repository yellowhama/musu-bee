# 2026-05-29 10:12 KST - Final Completion Fail On Not Ready

## Change

The official final completion command now includes `-FailOnNotReady` when
running `scripts\windows\complete-final-operator-gates.ps1`.

Updated surfaces:

- `scripts\windows\show-final-release-handoff-status.ps1`
- `scripts\windows\prepare-final-operator-gate-packet.ps1`
- `scripts\windows\verify-final-operator-gate-packet.ps1`
- `docs\RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`

## Reason

The final completion runner already supported `-FailOnNotReady`, but the
operator-facing command omitted it. Without the flag, a run with remaining
release blockers could still exit 0 after printing `ready_for_public_desktop_release=false`.

## Current Rule

The final operator command should exit non-zero unless every public desktop
release gate is satisfied. Packet verification now fails if the README final
command omits `-FailOnNotReady`.
