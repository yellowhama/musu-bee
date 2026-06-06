# MUSU 1.15.0-rc.1 Next Steps After Route Reachability Diagnostic Tooling

**Generated**: 2026-06-07 01:47 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_ROUTE_REACHABILITY_DIAGNOSTIC_TOOLING_2026_06_07.md`

## Current Position

HUGH-MAIN route reachability can now be captured and verified by script.
The new tooling proves failed peer reachability without allowing that failure
to masquerade as release-grade multi-device proof.

## Next Execution Order

1. Install or start current MUSU Desktop on `HUGH-MAIN`.
2. Run `record-route-reachability-diagnostic.ps1 -Target HUGH-MAIN`.
3. Verify the diagnostic with `verify-route-reachability-diagnostic.ps1`.
4. If TCP or peer health still fails, correct address, port, firewall, or
   package/runtime state on the second PC.
5. Once reachability passes, capture successful two-machine route evidence.
6. Capture second-PC desktop-open idle CPU and full runtime CPU matrix.
7. Return to hosted MUSU.PRO P2P evidence: owner-scoped rendezvous, route
   metadata, relay transport proof, and payload delivery proof.
8. Record support mailbox and Store/Partner Center evidence.

## Gate Notes

- Failed reachability diagnostics remain diagnostic evidence only.
- `localhost:3001` remains irrelevant to packaged desktop runtime readiness.
- Manual `http_bearer` routes remain non-release-grade until verified peer
  identity and `quic_tls_1_3` route proof exist.
