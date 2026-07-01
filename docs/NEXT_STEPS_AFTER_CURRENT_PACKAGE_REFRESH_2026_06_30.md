# Next Steps After Current Package Refresh (2026-06-30)

## Current State

MUSU is still **NO-GO** for full product completion and public desktop release.
The local packaged runtime on `HUGH_SECOND` is healthy again, but the remaining
blockers are physical, external, or release-transport proof gates.

Current local evidence report:

- `docs/LOCAL_PACKAGED_EVIDENCE_REFRESH_AFTER_SHELL_CANCEL_FIX_2026_07_01.md`

Current second-PC kit:

- `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-135632.zip`
- SHA256:
  `3d97eb84b7359a35199f5739ecea5d6fa43ef124931e4937ba7891c9c41cdd8b`
- source commit:
  `9ce134bb6b10c6320e21bdebe4abf6ddcdc8760d`

## What Is Proven

- `HUGH_SECOND` MSIX install is current for `1.15.0.22`.
- `HUGH_SECOND` single-machine smoke passes.
- Process ownership, startup single-instance, and desktop single-instance pass.
- `HUGH_SECOND` desktop-open idle CPU passes.
- Five-scenario runtime CPU matrix captures on `HUGH_SECOND`; the targeted
  route-attempt verifier passes for `hugh-main`, but the default successful
  post-route matrix gate remains open because `route_ok=false`.
- The packaged hidden-brain lane now passes on `HUGH_SECOND` after the MSIX
  `windows.fullTrustProcess` repair for `musu-brain.exe`.
- The current second-PC kit was regenerated from clean HEAD after the shell
  cancel latch fix and local package evidence refresh, so the next `hugh-main`
  run is not tied to the older `20260701-112343` source snapshot.

## What Is Not Proven

- `hugh-main` has not returned current CPU/matrix evidence.
- The LAN route is not release-grade transport:
  `peer_identity_verified=false`, `encryption=none_http_bearer`.
- `musu put/ls/get` has not passed as a physical sibling-PC file proof.
- Public `https://musu.pro` metadata verification is still blocked by
  DNS/TLS.
- Private Mesh packaged proof archive is not recorded.
- Store release evidence is not recorded.
- Live P2P control-plane proof is not recorded.
- Real relay transport, design approval, and V34 stale self-heal physical proof
  remain open.
- Brain data-root and handoff alignment are green on source and `HUGH_SECOND`
  package proof, but the same current package still needs second-machine
  evidence.

## Run On hugh-main

Extract the current kit on `hugh-main`, then run from inside the extracted kit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix -FailOnPrivateMeshPhysicalPeerEvidence
```

If certificate trust fails, rerun from elevated PowerShell with `-MachineTrust`.

Return the generated:

```text
.local-build/second-pc-return/*.zip
```

Then import it on this repo before recording final two-machine gates.

## Remote File Proof Setup

On `hugh-main`, prepare a writable proof share:

```powershell
New-Item -ItemType Directory -Force C:\Users\empty\.musu\codex-remote-file-proof
musu share C:\Users\empty\.musu\codex-remote-file-proof --writable --label remote-file-cli-proof
```

After the current package is installed, the dynamic-share reload should make
this visible to remote file API requests without a manual bridge restart. Then
rerun the physical proof from `hugh_second` and require all three commands to
pass:

- `musu put`
- `musu ls`
- `musu get`

## Brain Integration Next Constraint

Before expanding cockpit recall/capture UX or automatic collection, rebuild and
prove the source-level data root contract:

- MUSU product root: `~/.musu/brain`
- Standalone brain default mentioned by brain handoff: `~/.musubrain`
- MUSU source contract:
  `docs/BRAIN_INTEGRATION_ROOT_CONTRACT_2026_07_01.md`
- Canonical brain handoff:
  `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`

Required proof:

1. Rebuild/reinstall a package containing the 2026-07-01 source update.
2. Confirm Tauri exports `MUSU_KNOWLEDGE_ROOT` and `MUSUBRAIN_ROOT` as
   `~/.musu/brain`.
3. Rerun `record-brain-product-proof.ps1`.
4. Keep root outside MSIX LocalState and keep user notes out of product sync.

## Priority Order

1. Run/import `hugh-main` kit return.
2. Pass physical remote file `put/ls/get` proof.
3. Repair `musu.pro` apex DNS/TLS and rerun public metadata verifier.
4. Produce Private Mesh packaged proof archive.
5. Complete release-grade route transport and relay proof.
6. Record Store, design approval, live P2P control-plane, and V34 stale
   self-heal evidence.
