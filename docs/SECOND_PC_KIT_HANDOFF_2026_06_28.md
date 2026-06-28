# Second-PC Kit Handoff (2026-06-28)

## Status

Current `1.15.0-rc.22` second-PC evidence is not complete. The release gate has
only `HUGH_SECOND` runtime CPU evidence (`1/2`). The other physical machine,
`hugh-main`, still needs a verifier-passing return zip.

## Current Kit

- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260628-141837.zip`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260628-141837`
- Metadata:
  `version=1.15.0-rc.22`, branch `feat/v33-residual-finalize`, source commit
  `e9ed80a2bb55fb7b798327129e5e461dd7039f25`, `dirty=false`.
- Generated on:
  `HUGH_SECOND`, after commit `e9ed80a2`.
- Zip SHA256:
  `c47c3204a08bc5ea0c427da29b9ef6a03e9df905e5ddf2b4ea66fdde8b431862`.
- Zip size:
  `81116411` bytes.

The kit includes the MSIX, public cert, second-PC release wrapper, runtime CPU
idle/matrix tools, route preflight, V34 proof tools, relay/P2P evidence tools,
and multi-device recorder/verifier scripts.

The generator now supports the go/no-go next action command with `-Json` and
records `schema=musu.multidevice_test_kit_prepare.v1`, `zip_sha256`,
`metadata_path`, and source git metadata in
`.local-build/multi-device-test-kit/latest-prepare-output.json`.

## Command For hugh-main

Run this from inside the extracted kit directory on `hugh-main`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix
```

If certificate trust fails, rerun the same command from elevated PowerShell
with `-MachineTrust`.

Return the generated `.local-build/second-pc-return/*.zip` to this release repo.
Importing and verifying that zip is required before the two-machine runtime
idle CPU and runtime CPU scenario matrix gates can turn green.

## Product Meaning

This handoff prepares the second physical machine evidence path only. It does
not close the full multi-device release gate by itself. The current
`verify-multidevice-evidence.ps1` still requires release-grade route evidence:
verified peer identity, hardened QUIC/TLS transport proof, and payload transit
truth. A legacy LAN HTTP bearer route is diagnostic only.
