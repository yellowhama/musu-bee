# MUSU 1.15.0-rc.1 Second-PC Route Reachability Handoff

**Date**: 2026-06-07 02:08 KST
**Machine**: `HUGH_SECOND`

## Summary

Route reachability diagnostics are now connected to the actual second-PC
handoff path instead of living only as standalone tools.

Changed release flow:

- `run-second-pc-release-check.ps1` can record
  `musu.route_reachability_diagnostic.v1` when a non-local target peer is
  supplied.
- The second-PC return zip can include
  `.local-build\route-diagnostics\*.route-reachability-diagnostic.json`.
- `import-second-pc-return.ps1` copies returned diagnostics into the primary
  repo's `.local-build\route-diagnostics\` root and verifies them with
  `verify-route-reachability-diagnostic.ps1 -RequireNonLocalTarget`.
- `prepare-multidevice-test-kit.ps1`,
  `prepare-final-operator-gate-packet.ps1`, and
  `prepare-operator-action-pack.ps1` now include route reachability tools and
  operator guidance.
- Packet/action-pack verifiers now fail if the handoff path loses the route
  reachability scripts or README instructions.

## Product Boundary

This preserves the current product decision:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback coordination, and evidence/control
  plane.
- MUSU.PRO does not execute local work and does not become the default payload
  path.
- `localhost:3001` is optional developer/operator dashboard behavior, not the
  packaged desktop runtime contract.

The web can make it easier for a user to submit work from another place and to
connect devices, but actual execution remains on the local MUSU program on each
machine. After web-assisted discovery, the target route still has to prove
non-local peer reachability and then release-grade P2P route evidence.

## Implementation Notes

`run-second-pc-release-check.ps1` gained:

- `-RouteReachabilityTarget`
- `-RouteReachabilityPrompt`
- `-RouteReachabilityTcpTimeoutMs`
- `-SkipRouteReachabilityDiagnostic`
- `-SkipRouteReachabilityRouteAttempt`
- `-FailOnRouteReachabilityDiagnostic`

If `-RouteReachabilityTarget` is omitted, the wrapper falls back to
`-RuntimeCpuRouteTarget`. If neither target exists, the diagnostic is skipped so
the default one-machine install/handoff smoke still works.

Returned release-check JSON now exposes:

- `route_reachability_target`
- `route_reachability_diagnostic_required`
- `route_reachability_diagnostic_path`
- `route_reachability_diagnostic_verified`
- `route_reachability_tcp_test_succeeded`
- `route_reachability_route_attempt_result`
- `route_reachability_successful_multi_device_route_proof`

`import-second-pc-return.ps1` treats the diagnostic as conditional release-gate
supporting evidence: if the returned release-check JSON says route reachability
was required, the importer requires the returned diagnostic to verify.

## Validation

- PowerShell parser checks: pass
- release evidence verifier regression: `ok=true`, `case_count=93`,
  `failed_case_count=0`

New regression coverage:

- `second-PC release check returns route reachability diagnostics`
- `second-PC return import verifies route reachability diagnostics`
- `second-PC kit includes route reachability diagnostic handoff`

## Qualitative Audit

No high or medium issue was found.

The change is narrowly scoped to release tooling, packet generation,
operator handoff docs, and regression contracts. It does not alter runtime route
selection, relay transport, local API auth, CPU sampling, or packaged desktop
startup behavior.

Residual risks:

- Existing generated final-operator packets and operator action packs must be
  regenerated from a clean tree before use; older zips cannot contain the new
  route reachability scripts.
- This does not prove multi-device readiness by itself. Successful release proof
  still requires real two-machine route evidence, CPU/matrix evidence on both
  machines, hosted MUSU.PRO P2P/relay evidence, support mailbox proof, and
  Store/Partner Center proof.
- If a second PC has no registered primary peer yet, the default wrapper skips
  route reachability diagnostics until `-RouteReachabilityTarget` or
  `-RuntimeCpuRouteTarget` is supplied.

## Next Step

Regenerate the final operator packet and action pack from a clean release repo,
then run the second-PC wrapper with a real peer target:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 `
  -RouteReachabilityTarget <PRIMARY_PEER_NAME> `
  -RuntimeCpuRouteTarget <PRIMARY_PEER_NAME> `
  -AllowFailedRuntimeCpuRouteProbe
```

Import the returned zip from the primary repo:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 `
  -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> `
  -RequireReleaseGateEvidence `
  -Json
```

Only after route reachability is non-local and healthy should the release path
proceed to successful two-machine route evidence and hosted MUSU.PRO P2P/relay
proof.
