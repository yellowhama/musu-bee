# Second-PC Kit Handoff (2026-06-28)

## Status

Current `1.15.0-rc.22` second-PC evidence is not complete. The release gate has
only `HUGH_SECOND` runtime CPU evidence (`1/2`). The other physical machine,
`hugh-main`, still needs a verifier-passing return zip.

## Current Kit

- Kit zip:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-135632.zip`
- Kit root:
  `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-135632`
- Metadata:
  `version=1.15.0-rc.22`, branch `feat/v33-residual-finalize`, source commit
  `9ce134bb6b10c6320e21bdebe4abf6ddcdc8760d`, `dirty=false`.
- Generated on:
  `HUGH_SECOND`, at `2026-07-01T13:56:40.1524203+09:00`, from clean commit
  `9ce134bb`.
- Zip SHA256:
  `3d97eb84b7359a35199f5739ecea5d6fa43ef124931e4937ba7891c9c41cdd8b`.
- Internal checksum verification:
  `ok=true`, `checksum_mismatches=0`, `checksum_count=50`, `file_count=51`.

The kit includes the MSIX, public cert, second-PC release wrapper, runtime CPU
idle/matrix tools, route preflight, V34 proof tools, relay/P2P evidence tools,
Private Mesh packaged release-proof tools, and multi-device recorder/verifier
scripts.

The generator supports the go/no-go next action command with `-Json` and
persists the latest `schema=musu.multidevice_test_kit_prepare.v1`,
`zip_sha256`, `metadata_path`, and source git metadata to
`.local-build/multi-device-test-kit/latest-prepare-output.json`. The current
kit supersedes the earlier `20260701-112343` kit because it was generated from
the current clean HEAD after the shell cancel latch source fix, local package
evidence refresh, runtime CPU evidence refresh, clean go/no-go recheck, and
wiki/spec/index updates.

The canonical brain-side handoff remains
`F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md` on clean brain repo
`main` commit `eb0c0ec2b83a9226f431012bc8c7b2267a3c0d14`. That handoff
describes standalone brain defaults under `~/.musubrain`; MUSU's packaged
product overlay is still `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`
with product root `~/.musu/brain`.

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

## Remote File CLI Proof Setup

The post-fix remote file CLI proof is still open. A physical attempt from
`HUGH_SECOND` to `hugh-main` on 2026-06-30 reached the target bridge but failed
closed because `hugh-main` had not configured a file serve root or writable
share. Before rerunning `musu ls/get/put` proof from `hugh_second`, prepare the
target on `hugh-main`:

```powershell
New-Item -ItemType Directory -Force C:\Users\empty\.musu\codex-remote-file-proof
musu share C:\Users\empty\.musu\codex-remote-file-proof --writable --label remote-file-cli-proof
```

After installing the current kit package, the packaged bridge should not need a
manual restart for the remote file API to reread `~/.musu/shares.toml`. Rerun
the remote file proof from `hugh_second` and require all three commands to
pass: `musu put`, `musu ls`, and `musu get`.

If `hugh-main` is still running an earlier rc.22 package, install the current
kit package first; otherwise the installed bridge may still hold the old
startup-only file policy.

Canonical blocker report:
`docs/REMOTE_FILE_CLI_PHYSICAL_PROOF_POLICY_BLOCKED_2026_06_30.md`.

## Product Meaning

This handoff prepares the second physical machine evidence path only. It does
not close the full multi-device release gate by itself. The current
`verify-multidevice-evidence.ps1` still requires release-grade route evidence:
verified peer identity, hardened QUIC/TLS transport proof, and payload transit
truth. A legacy LAN HTTP bearer route is diagnostic only.
