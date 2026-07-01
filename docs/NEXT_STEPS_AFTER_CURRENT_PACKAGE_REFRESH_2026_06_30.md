# Next Steps After Current Package Refresh (2026-06-30)

## Current State

MUSU is still **NO-GO** for full product completion and public desktop release.
The local packaged runtime on `HUGH_SECOND` is healthy again, but the remaining
blockers are physical, external, or release-transport proof gates.

Current local evidence report:

- `docs/LOCAL_PACKAGE_REFRESH_AFTER_BRAIN_PIN_2026_07_01.md`

Current second-PC kit status:

- The older `20260701-135632` kit is stale for the current source/package
  because the local package has since moved to commit
  `ee597c7e03fa12da853451e2c1339d63b93de52b` and brain pin
  `0b47c430e94fa504029c9b754dea70055beeee6e`.
- Regenerate or republish the second-PC install/check path before treating a
  new `hugh-main` return as current release evidence.

## What Is Proven

- `HUGH_SECOND` MSIX install is current for `1.15.0.22`.
- `HUGH_SECOND` single-machine smoke passes.
- Process ownership, startup single-instance, and desktop single-instance pass.
- `HUGH_SECOND` desktop-open idle CPU passes.
- Five-scenario runtime CPU matrix captures on `HUGH_SECOND`; the targeted
  route-attempt verifier passes for `hugh-main`, but the default successful
  post-route matrix gate remains open because `route_ok=false`.
- The packaged hidden-brain lane now passes on `HUGH_SECOND` with the current
  brain pin `0b47c430e94fa504029c9b754dea70055beeee6e`.
- Clean go/no-go at `2026-07-01T18:49:50.0962676+09:00` reports
  `blockers=10`, `manifest_git.dirty=false`,
  `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`,
  `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1 [HUGH_SECOND]`,
  and `runtime_cpu_scenario_matrix_valid_machine_count=0/2`.

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

First install or otherwise deliver the current package built from
`ee597c7e03fa12da853451e2c1339d63b93de52b` to `hugh-main`. Then run the current
second-PC release check from a regenerated kit or equivalent current scripts:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget hugh_second -RuntimeCpuRouteTarget hugh_second -FailOnRouteReachabilityDiagnostic -FailOnRuntimeCpuScenarioMatrix -FailOnPrivateMeshPhysicalPeerEvidence
```

If certificate trust fails, rerun from elevated PowerShell with `-MachineTrust`.

Return the generated:

```text
.local-build/second-pc-return/*.zip
```

Then import it on this repo before recording final two-machine gates. Do not
reuse the older `20260701-135632` kit as release-grade evidence for the current
source.

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

1. Regenerate/publish the current `hugh-main` install and release-check path.
2. Run/import `hugh-main` kit return.
3. Pass physical remote file `put/ls/get` proof.
4. Repair `musu.pro` apex DNS/TLS and rerun public metadata verifier.
5. Produce Private Mesh packaged proof archive.
6. Complete release-grade route transport and relay proof.
7. Record Store, design approval, live P2P control-plane, and V34 stale
   self-heal evidence.
