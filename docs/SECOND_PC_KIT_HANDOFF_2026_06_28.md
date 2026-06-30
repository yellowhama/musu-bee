# Second-PC Kit Handoff (2026-06-28)

## Status

Current `1.15.0-rc.22` second-PC evidence is not complete. The release gate has
only `HUGH_SECOND` runtime CPU evidence (`1/2`). The other physical machine,
`hugh-main`, still needs a verifier-passing return zip.

## Current Kit

- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260630-165500.zip`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260630-165500`
- Metadata:
  `version=1.15.0-rc.22`, branch `feat/v33-residual-finalize`, source commit
  `87ffa7a5c76eb36d8a4ce3982d76a1860ecd3ddc`, `dirty=false`.
- Generated on:
  `HUGH_SECOND`, at `2026-06-30T16:55:08.6186397+09:00`, from clean commit
  `87ffa7a5`.
- Zip SHA256:
  `78f126b9c67c5c867bceecb1e739694697a0dc840fe6c6a7c1f3dba8ca14f0aa`.

The kit includes the MSIX, public cert, second-PC release wrapper, runtime CPU
idle/matrix tools, route preflight, V34 proof tools, relay/P2P evidence tools,
Private Mesh packaged release-proof tools, and multi-device recorder/verifier
scripts.

The generator now supports the go/no-go next action command with `-Json` and
persists the latest `schema=musu.multidevice_test_kit_prepare.v1`,
`zip_sha256`, `metadata_path`, and source git metadata to
`.local-build/multi-device-test-kit/latest-prepare-output.json`.

## Command For hugh-main

Run this from inside the extracted kit directory on `hugh-main`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix -FailOnPrivateMeshPhysicalPeerEvidence
```

If certificate trust fails, rerun the same command from elevated PowerShell
with `-MachineTrust`.

Return the generated `.local-build/second-pc-return/*.zip` to this release repo.
Importing and verifying that zip is required before the two-machine runtime
idle CPU and runtime CPU scenario matrix gates can turn green.

The return zip now also includes target-side Private Mesh physical-peer
evidence:

- `.local-build/private-mesh-physical-peer/*.physical-peer-evidence.json`
- `.local-build/private-mesh-physical-peer/*.physical-peer-evidence.json.sha256`

After importing the return zip on this repo, use that imported JSON as the
`-PhysicalPeerEvidencePath` input to
`scripts/windows/run-private-mesh-release-proof.ps1`. This is the handoff
material for the `private-mesh-packaged-release-proof` lane; it still must be
combined with a packaged desktop release-proof archive before the gate can turn
green.

## Product Meaning

This handoff prepares the second physical machine evidence path only. It does
not close the full multi-device release gate by itself. The current
`verify-multidevice-evidence.ps1` still requires release-grade route evidence:
verified peer identity, hardened QUIC/TLS transport proof, and payload transit
truth. A legacy LAN HTTP bearer route is diagnostic only.
