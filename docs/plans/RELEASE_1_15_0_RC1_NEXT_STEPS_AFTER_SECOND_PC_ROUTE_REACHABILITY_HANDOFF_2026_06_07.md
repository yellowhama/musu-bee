# MUSU 1.15.0-rc.1 Next Steps After Second-PC Route Reachability Handoff

**Generated**: 2026-06-07 02:08 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_REACHABILITY_HANDOFF_2026_06_07.md`

## Current Position

The second-PC handoff path now carries route reachability diagnostics when a
target peer is supplied. The release tooling can distinguish three states:

1. default one-machine install/handoff smoke with no route target;
2. targeted non-local reachability diagnostic for a registered peer;
3. successful release-grade multi-device route proof.

Only the third state can close the public multi-device release gate.

## Execution Order

1. Regenerate the final operator gate packet from a clean release repo.
2. Regenerate and verify the operator action pack.
3. Install or start current MUSU Desktop on the second Windows PC.
4. Make sure the primary peer is registered on that second PC.
5. Run the second-PC wrapper with:
   `-RouteReachabilityTarget <PRIMARY_PEER_NAME>`,
   `-RuntimeCpuRouteTarget <PRIMARY_PEER_NAME>`, and
   `-AllowFailedRuntimeCpuRouteProbe` while diagnosing failures.
6. Return `.local-build\second-pc-return\*.zip` to the primary repo.
7. Import with `import-second-pc-return.ps1 -RequireReleaseGateEvidence`.
8. If the diagnostic fails, fix peer address, port, firewall, package/runtime
   state, or peer identity before retrying.
9. After reachability is healthy, record successful two-machine route evidence.
10. Record second-PC runtime idle CPU and runtime CPU scenario matrix evidence.
11. Record hosted MUSU.PRO P2P/relay proof with route metadata, transport
    proof, and payload delivery proof.
12. Record support mailbox and Store/Partner Center evidence.

## Product Spec Notes

- MUSU Desktop remains the local executor on every device.
- MUSU.PRO receives remote user input and provides project/company room,
  meeting, presence, rendezvous, path-selection, relay-fallback, and evidence
  control-plane functions.
- The web can help devices find and authorize each other; it must not become the
  execution runtime.
- `localhost:3001` is not the packaged desktop runtime contract.

## Release Gate Notes

- `musu.route_reachability_diagnostic.v1` is supporting diagnostic evidence.
- `musu.route_evidence.v1` with release-grade route identity/encryption is
  still required for multi-device release proof.
- Existing generated packets/action packs should be treated as stale and
  regenerated because they do not include the new route reachability handoff.
