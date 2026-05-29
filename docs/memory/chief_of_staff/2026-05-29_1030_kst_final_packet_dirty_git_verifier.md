# 2026-05-29 10:30 KST - Final Packet Dirty Git Verifier

## Change

`scripts\windows\verify-final-operator-gate-packet.ps1` now validates two
dirty-git release-safety properties inside the packet:

- bundled `scripts\windows\write-release-go-no-go.ps1` must block dirty git
  state with `Add-Blocker -Area "git"`
- bundled `scripts\windows\verify-final-operator-gate-packet.ps1` must contain
  the same dirty-git blocker assertion

## Reason

After `write-release-go-no-go.ps1` was changed to treat dirty git state as a
blocker, the previously generated final operator packet still contained the
older warning-only script. The old packet verified successfully because packet
verification checked file presence and checksums but not that new fail-closed
rule.

## Verification

Before regenerating the packet, the new verifier failed the latest packet with:

- `packet verifier dirty git check`

After regenerating, `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
verified with `ok=true`, `fail_count=0`, and `kit_count=1`, including both
dirty-git checks.
