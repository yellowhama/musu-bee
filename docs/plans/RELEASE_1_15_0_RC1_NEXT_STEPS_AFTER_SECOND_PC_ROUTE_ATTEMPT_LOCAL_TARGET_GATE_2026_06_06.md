# MUSU 1.15.0-rc.1 Next Steps After Second-PC Route-Attempt Local Target Gate

**Generated**: 2026-06-06 22:35 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_ATTEMPT_LOCAL_TARGET_GATE_2026_06_06.md`

## Current Position

The targeted second-PC route-attempt CPU diagnostic can no longer pass with a
localhost or loopback target. It still accepts explicitly allowed failed route
attempts, but only when the route target is non-local, command-bound,
argument-bound, token-bound, and not the operator machine.

## No-Go Items

Public release remains blocked by:

- no successful current second-PC multi-device route evidence
- no second-PC desktop-open idle CPU evidence
- no second-PC full runtime CPU matrix evidence
- no current non-local targeted second-PC route-attempt CPU evidence
- no live MUSU.PRO runtime login/storage/relay proof
- no support mailbox proof
- no Store/Partner Center proof

## Next Execution Order

1. Install current MUSU Desktop on the second PC.
2. Verify packaged WindowsApps `musu.exe` alias on both machines.
3. Capture second-PC single-machine and desktop-open idle CPU evidence.
4. Capture second-PC full runtime CPU scenario matrix evidence.
5. Capture targeted route-attempt CPU evidence using a non-local target name or
   address, not `localhost`, loopback, or the operator machine.
6. Capture successful two-machine route evidence.
7. Record live MUSU.PRO P2P/relay evidence after packaged runtime login and
   release relay proof wiring.
8. Record support mailbox and Store/Partner Center proof.

## Audit Notes

This gate only prevents a bad diagnostic from passing. It does not reduce the
need for actual two-machine evidence.
