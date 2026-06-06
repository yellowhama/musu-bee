# MUSU 1.15.0-rc.1 Next Steps After Single-Instance Freshness Gate

**Generated**: 2026-06-07 00:03 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_SINGLE_INSTANCE_FRESHNESS_GATE_2026_06_07.md`

## Current Position

Startup and desktop single-instance evidence now has the same freshness rule
as runtime CPU and process ownership evidence.

This closes a stale-proof release gate gap. It does not itself prove the
current installed desktop is single-instance clean; the new gate intentionally
reopens `startup-single-instance` and `desktop-single-instance` until fresh
current-HEAD evidence is captured.

## Next Execution Order

1. Commit this freshness-gate change and run a clean go/no-go to confirm the
   stale startup/desktop single-instance blockers remain visible without the
   temporary `git` blocker.
2. Build or reinstall the current MSIX package on `HUGH_SECOND`.
3. Capture fresh startup single-instance evidence with the packaged
   WindowsApps `musu.exe` command.
4. Capture fresh desktop single-instance evidence with the packaged
   `musu-desktop.exe` shell.
5. Capture process ownership, desktop-open idle CPU, and runtime CPU matrix
   evidence from the same installed package.
6. Install the same current build on the second Windows PC and repeat
   process ownership, single-instance, CPU, matrix, and route evidence.
7. Record live MUSU.PRO owner-scoped P2P/relay proof with release route
   metadata, route transport proof, and payload delivery proof.
8. Record support mailbox proof and Store/Partner Center proof.
9. Run final clean go/no-go and final operator packet verification.

## Audit Notes

No high or medium code issue was found in this scoped verifier change.

Do not treat a historical single-instance pass as evidence for the current
runtime. Freshness now belongs to the single-instance release contract.
