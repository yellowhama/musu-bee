# Next Steps After Current Package Refresh (2026-06-30)

## Current State

MUSU is still **NO-GO** for full product completion and public desktop release.
The local packaged runtime on `HUGH_SECOND` is healthy again, but the remaining
blockers are physical, external, or release-transport proof gates.

Current local evidence report:

- `docs/CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_30.md`

Current second-PC kit:

- `.local-build/multi-device-test-kit/musu-multidevice-1.15.0-rc.22-20260701-000516.zip`
- SHA256:
  `2966f53e7dac6e1703f7ba694f3b95ef66b6f3b3977059a237d2f6ea52402558`
- source commit:
  `33b0ca155991ba4f46422288cde9cc36d0b5840c`

## What Is Proven

- `HUGH_SECOND` MSIX install is current for `1.15.0.22`.
- `HUGH_SECOND` single-machine smoke passes.
- Process ownership, startup single-instance, and desktop single-instance pass.
- `HUGH_SECOND` desktop-open idle CPU passes.
- Full five-scenario runtime CPU matrix passes on `HUGH_SECOND`.
- The post-route scenario can target `hugh-main` over LAN.
- The current package pins clean brain commit
  `c477c004691a7fe5d555e4403d91bab71a3c303f`.

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
- Brain data-root contract is not fully settled:
  current package proof uses `~/.musu/brain`, while the brain repo handoff
  describes `~/.musubrain`.

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

Before expanding cockpit recall/capture UX or automatic collection, resolve the
data root contract in one place:

- Current musu-bee thesis/proof: `~/.musu/brain`
- Current brain handoff language: `~/.musubrain`
- Canonical brain handoff:
  `F:\musu_2nd_brain\docs\HANDOFF-musu-integration.md`

Required decision:

1. One MUSU-owned resolver/env contract.
2. Tauri sidecar, runtime bridge env, proof scripts, and docs use the same
   root.
3. Root stays outside MSIX LocalState.
4. If changing root, add migration/compat proof before release claims.

## Priority Order

1. Run/import `hugh-main` kit return.
2. Pass physical remote file `put/ls/get` proof.
3. Resolve brain data-root contract.
4. Repair `musu.pro` apex DNS/TLS and rerun public metadata verifier.
5. Produce Private Mesh packaged proof archive.
6. Complete release-grade route transport and relay proof.
7. Record Store, design approval, live P2P control-plane, and V34 stale
   self-heal evidence.
